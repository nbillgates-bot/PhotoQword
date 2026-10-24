/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 合成结果缓存：让平移和缩放不必每帧重合成整幅画面。
 *
 * 决策在 viewCachePlan.ts（纯逻辑）。这里负责按决策操作画布：
 * - reuse：缓存原样贴到主画布
 * - shift：缓存整体挪一下，只重画新露出的边条
 * - rescale：缓存拉伸顶上，画质暂时降级
 * - full：全量重合成并换掉缓存
 *
 * **缓存里始终是「最近一次全量合成」的清晰结果。** rescale 不回写缓存，
 * 所以连续缩放是「同一份清晰源拉伸到不同倍率」，不会一次比一次糊
 * ——从拉伸结果再拉伸就是典型的代际损失。
 */

import type { Layer } from '../types';
import type { Viewport } from './compositor';
import { createCanvas, ctx2d } from './canvasUtils';
import { paintLayersInto } from './viewRenderer';
import {
  applySmoothing,
  prepareViewportCanvas,
  subViewport,
  type ViewportContext,
} from './viewportRender';
import { planViewCache, type CacheGeometry, type ViewCachePlan } from './viewCachePlan';

/**
 * 条带渲染时四周多画几个像素，只取中间那块。
 *
 * 缓冲会被 padViewRect 夹到「视口」边界，而条带渲染时视口就是这条带本身，
 * 于是跨过条带边界的图层丢掉了 RASTER_BLEED 那圈边，接缝处会差一两个色阶。
 * 多画一圈再截掉就没这个问题。取 2 是因为要挡的是 RASTER_BLEED=1 加上
 * 非整数缩放下的半像素采样。
 */
const STRIP_BLEED = 2;

/**
 * 缓存句柄。由调用方持有（CanvasArea 放在 ref 里），不用模块级单例
 * ——单例会在测试之间串味，也没法同时服务两个文档。
 */
export interface ViewCache {
  /** 双缓冲：shift 时从一张画到另一张，避免自绘自己 */
  front: HTMLCanvasElement;
  back: HTMLCanvasElement;
  /** 缓存内容对应的几何。null 表示缓存里还没有有效内容 */
  geometry: CacheGeometry | null;
  /** 内容身份。与上一帧不同就必须全量重算 */
  contentKey: readonly unknown[] | null;
}

export function createViewCache(): ViewCache {
  return {
    front: createCanvas(1, 1),
    back: createCanvas(1, 1),
    geometry: null,
    contentKey: null,
  };
}

/** 缓存作废。文档关闭、图层结构大改之后调用 */
export function invalidateViewCache(cache: ViewCache): void {
  cache.geometry = null;
  cache.contentKey = null;
}

/**
 * 内容身份是否相同。逐项 Object.is，与 React 依赖表的比较语义一致。
 *
 * 用数组而不是拼字符串：selection、overlay 这些是对象，拼出来都是
 * "[object Object]"，换了内容也看不出差别，就会拿旧画面顶着真实变化。
 */
function sameKey(a: readonly unknown[] | null, b: readonly unknown[]): boolean {
  if (!a || a.length !== b.length) return false;
  return a.every((value, index) => Object.is(value, b[index]));
}

export interface CachedRenderArgs {
  cache: ViewCache;
  /** 主画布，最终要贴到它上面 */
  canvas: HTMLCanvasElement;
  layers: Layer[];
  view: ViewportContext;
  /**
   * 内容身份。取 CanvasArea 合成 effect 的依赖表减去 zoom/panX/panY——
   * 那张表就是「什么时候必须重合成」的既有契约。逐项比较，见 sameKey。
   */
  contentKey: readonly unknown[];
  interacting: boolean;
}

export interface CachedRenderResult {
  plan: ViewCachePlan['kind'];
  painted: number;
  culled: number;
  /** 这一帧实际重画的视口像素数，0 表示纯复用 */
  repaintedPixels: number;
}

/**
 * 图层里有没有带效果的。
 *
 * 条带路径只在「都没效果」时启用：投影、外发光这类会画到 bounds 之外，
 * 需要的留边随效果大小走，几十像素的投影要留几十像素，条带就没剩下多少
 * 便宜可占了。这时退回全量合成，与改造前的行为一致，不算退化。
 */
function hasEffects(layers: Layer[]): boolean {
  return layers.some((layer) => Boolean(layer.effects));
}

/** 按几何为缓存画布定尺寸。尺寸没变不重新赋值——赋值会清空内容 */
function sizeCanvas(canvas: HTMLCanvasElement, view: ViewportContext): void {
  if (canvas.width !== view.viewWidth || canvas.height !== view.viewHeight) {
    canvas.width = view.viewWidth;
    canvas.height = view.viewHeight;
  }
}

function geometryOf(view: ViewportContext): CacheGeometry {
  return {
    viewWidth: view.viewWidth,
    viewHeight: view.viewHeight,
    scale: view.scale,
    originX: view.originX,
    originY: view.originY,
  };
}

/**
 * 渲染一帧，尽量复用上一帧的合成结果。
 *
 * 主画布的内容一律从缓存贴过来，缓存是唯一的真相来源。多这一次整幅
 * drawImage 是 GPU 上的亚毫秒操作，换来的是绝大多数帧不必重合成。
 */
export function renderCached(args: CachedRenderArgs): CachedRenderResult {
  const { cache, canvas, layers, view, contentKey, interacting } = args;

  // 内容变了：缓存里的东西作废，几何也不能再用来比对
  const cached = sameKey(cache.contentKey, contentKey) ? cache.geometry : null;
  let plan = planViewCache(cached, geometryOf(view), interacting);

  // 带效果的图层不走条带，理由见 hasEffects
  if (plan.kind === 'shift' && hasEffects(layers)) plan = { kind: 'full' };

  switch (plan.kind) {
    case 'reuse':
      return { ...blitToMain(canvas, cache, view), plan: 'reuse', repaintedPixels: 0 };
    case 'rescale':
      return { ...rescaleToMain(canvas, cache, view), plan: 'rescale', repaintedPixels: 0 };
    case 'shift':
      return shiftAndFill({ ...args, plan });
    default:
      return fullRender(args);
  }
}

/** 全量重合成，结果留在缓存里，再贴到主画布 */
function fullRender(args: CachedRenderArgs): CachedRenderResult {
  const { cache, canvas, layers, view, contentKey } = args;
  sizeCanvas(cache.front, view);
  const context = prepareViewportCanvas(cache.front, view);
  const counts = paintLayersInto(context, layers, view);

  cache.geometry = geometryOf(view);
  cache.contentKey = contentKey;
  blitToMain(canvas, cache, view);
  return {
    plan: 'full',
    ...counts,
    repaintedPixels: view.viewWidth * view.viewHeight,
  };
}

/** 缓存 1:1 贴到主画布 */
function blitToMain(
  canvas: HTMLCanvasElement,
  cache: ViewCache,
  view: ViewportContext,
): { painted: number; culled: number } {
  sizeCanvas(canvas, view);
  const context = ctx2d(canvas);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, view.viewWidth, view.viewHeight);
  context.drawImage(cache.front, 0, 0);
  return { painted: 0, culled: 0 };
}

/**
 * 把缓存拉伸到当前倍率贴上去。
 *
 * 缓存里的像素在它自己那套几何下：文档点 p 落在 p*S0+O0。要显示成 p*S1+O1，
 * 于是缓存像素 c 应该画到 (c-O0)*r + O1，其中 r = S1/S0。
 * 展开成矩阵就是 setTransform(r, 0, 0, r, O1-O0*r, ...)。
 *
 * **不回写缓存**：回写之后下一次拉伸就是「拉伸结果再拉伸」，糊得会累积。
 */
function rescaleToMain(
  canvas: HTMLCanvasElement,
  cache: ViewCache,
  view: ViewportContext,
): { painted: number; culled: number } {
  const from = cache.geometry;
  if (!from) return { painted: 0, culled: 0 };

  sizeCanvas(canvas, view);
  const context = ctx2d(canvas);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, view.viewWidth, view.viewHeight);

  const ratio = view.scale / from.scale;
  context.setTransform(
    ratio,
    0,
    0,
    ratio,
    view.originX - from.originX * ratio,
    view.originY - from.originY * ratio,
  );
  applySmoothing(context, view);
  context.drawImage(cache.front, 0, 0);
  context.setTransform(1, 0, 0, 1, 0, 0);
  return { painted: 0, culled: 0 };
}

/**
 * 平移复用：缓存整体挪一下，只重画新露出的边条。
 *
 * 用双缓冲而不是让画布自绘自己：规范里自绘是有定义的（源会先取快照），
 * 但两张画布来回画更直白，代价也一样是一次整幅 drawImage。
 */
function shiftAndFill(
  args: CachedRenderArgs & { plan: Extract<ViewCachePlan, { kind: 'shift' }> },
): CachedRenderResult {
  const { cache, canvas, layers, view, contentKey, plan } = args;

  sizeCanvas(cache.back, view);
  const backCtx = ctx2d(cache.back);
  backCtx.setTransform(1, 0, 0, 1, 0, 0);
  backCtx.clearRect(0, 0, view.viewWidth, view.viewHeight);
  // 关掉平滑：整像素平移不需要重采样，开着反而会让内容每帧糊一点
  backCtx.imageSmoothingEnabled = false;
  backCtx.drawImage(cache.front, plan.dx, plan.dy);

  let painted = 0;
  let culled = 0;
  let repaintedPixels = 0;
  for (const strip of plan.strips) {
    const counts = paintStrip(backCtx, layers, view, strip);
    painted += counts.painted;
    culled += counts.culled;
    repaintedPixels += strip.width * strip.height;
  }

  // 换手：新内容成为缓存
  const next = cache.back;
  cache.back = cache.front;
  cache.front = next;
  cache.geometry = geometryOf(view);
  cache.contentKey = contentKey;

  blitToMain(canvas, cache, view);
  return { plan: 'shift', painted, culled, repaintedPixels };
}

/**
 * 重画一条边条。
 *
 * 先按「外扩 STRIP_BLEED 的范围」渲染，再只把中间那块贴回去：
 * 中间缓冲会被夹到条带边界，直接按条带渲染会在接缝处丢掉那圈采样余量。
 */
function paintStrip(
  target: CanvasRenderingContext2D,
  layers: Layer[],
  view: ViewportContext,
  strip: Viewport,
): { painted: number; culled: number } {
  const grown = {
    x: Math.max(0, strip.x - STRIP_BLEED),
    y: Math.max(0, strip.y - STRIP_BLEED),
    width: 0,
    height: 0,
  };
  grown.width = Math.min(view.viewWidth, strip.x + strip.width + STRIP_BLEED) - grown.x;
  grown.height = Math.min(view.viewHeight, strip.y + strip.height + STRIP_BLEED) - grown.y;
  if (grown.width <= 0 || grown.height <= 0) return { painted: 0, culled: 0 };

  const stripView = subViewport(view, grown);
  const scratch = createCanvas(grown.width, grown.height);
  const context = prepareViewportCanvas(scratch, stripView);
  const counts = paintLayersInto(context, layers, stripView);

  // 只取中间那块，外扩出来的边不要
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.imageSmoothingEnabled = false;
  target.drawImage(
    scratch,
    strip.x - grown.x,
    strip.y - grown.y,
    strip.width,
    strip.height,
    strip.x,
    strip.y,
    strip.width,
    strip.height,
  );
  return counts;
}
