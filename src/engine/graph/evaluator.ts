/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 图层图求值器：把节点图算成一张画面。
 *
 * 合成语义全部照搬现有 compositor（那套已经对齐过 PS 并有测试覆盖），
 * 区别只在两点：
 *
 * 1. 调整/滤镜是**节点**，作用于「它下方已经合成出来的画面」，
 *    而不是预先烧进某个图层的像素。这是非破坏性编辑的全部意义。
 * 2. 中间结果按累积签名缓存（见 evalCache），否则 20 个调整节点
 *    意味着每帧跑 20 遍全画布算法。
 */

import type { BlendMode } from '../../types';
import type { GraphNode, LayerGraph } from '../../types/graph';
import { createCanvas, ctx2d, ctx2dReadback } from '../canvasUtils';
import { clipRuns, clipToAlpha } from '../clipping';
import { applyMaskAt } from '../mask';
import { childrenOf } from './graphOps';
import { drawWithBlend, sizedTo } from './blendTarget';
import type { EvalContext } from './evalTypes';
import {
  renderDropShadow,
  renderOuterGlow,
  renderInnerGlow,
  renderStroke,
} from '../layerEffects';

/**
 * 求出整幅画面。
 *
 * 返回新画布而不是画到传入的上下文上：调整节点需要读「下方的画面」，
 * 天然要求中间结果是可取回的一张图。
 */
export function evaluateGraph(graph: LayerGraph, ctx: EvalContext): HTMLCanvasElement {
  return paintSiblings(childrenOf(graph, null), graph, ctx);
}

/** 把一层兄弟节点自底向上画到一张新画布上 */
function paintSiblings(
  nodes: GraphNode[],
  graph: LayerGraph,
  ctx: EvalContext,
): HTMLCanvasElement {
  const canvas = createCanvas(ctx.width, ctx.height);
  if (ctx.width <= 0 || ctx.height <= 0) return canvas;
  const target = ctx2d(canvas);

  // FIXME: 暂时禁用视口裁剪，排查渲染不全问题
  // 视口裁剪：过滤掉与视口不相交的节点
  let visibleNodes = nodes;
  /*
  if (ctx.viewport) {
    visibleNodes = nodes.filter((node) => {
      // 调整/滤镜/组没有 bounds，始终保留（调整/滤镜作用于整幅画面，组需递归判断）
      if (node.kind === 'adjustment' || node.kind === 'filter' || node.kind === 'group') {
        return true;
      }
      const b = node.bounds;
      if (!b) return true;
      const vp = ctx.viewport!;
      // 图层完全在视口外才裁掉
      return !(
        b.x + b.width <= vp.x ||
        b.y + b.height <= vp.y ||
        b.x >= vp.x + vp.width ||
        b.y >= vp.y + vp.height
      );
    });
  }
  */

  for (const run of clipRuns(visibleNodes, (node) => Boolean(node.clipped))) {
    if (run.members.length === 0) {
      paintNode(target, run.base, graph, ctx);
      continue;
    }
    paintClipRun(target, run.base, run.members, graph, ctx);
  }
  return canvas;
}

/** 画单个节点。effect 节点走「读回下方画面再施加」的路径 */
function paintNode(
  target: CanvasRenderingContext2D,
  node: GraphNode,
  graph: LayerGraph,
  ctx: EvalContext,
): void {
  if (!node.visible || node.opacity <= 0) return;

  if (node.kind === 'group') {
    paintGroup(target, node, graph, ctx);
    return;
  }
  if (node.kind === 'adjustment' || node.kind === 'filter') {
    paintEffectNode(target, node, ctx);
    return;
  }
  const content = contentOf(node, ctx);
  if (!content) return;

  // 有图层效果时走效果渲染路径：先套蒙版，再基于蒙版后的形状生成效果
  if (node.effects) {
    const maskedContent = masked(content, node, ctx);
    paintNodeWithEffects(target, maskedContent, node, ctx);
    return;
  }

  blendOnto(target, masked(content, node, ctx), node.blendMode, node.opacity, ctx);
}

/**
 * 节点自身的内容画布（文档坐标，不含蒙版与混合）。
 * 文字与形状走 raster，没提供 raster 时按空处理而不是抛错。
 *
 * 对于 pixel/text/shape 节点，如果它有 bounds 偏移，需要把画布摆放到
 * 文档坐标系（与旧 compositor 的 placedPixels 对齐）。
 */
function contentOf(node: GraphNode, ctx: EvalContext): HTMLCanvasElement | null {
  let raw: HTMLCanvasElement | null = null;
  if (node.kind === 'pixel') {
    raw = ctx.resolver.pixels(node);
  } else if (node.kind === 'text' || node.kind === 'shape' || node.kind === 'smart') {
    raw = ctx.resolver.raster?.(node) ?? null;
  }
  if (!raw) return null;

  // 只有这几种节点有 bounds
  if (node.kind !== 'pixel' && node.kind !== 'text' && node.kind !== 'shape' && node.kind !== 'smart') {
    return raw;
  }

  // 没有 bounds 或 bounds 已对齐到 (0,0) 且尺寸匹配文档时，直接返回
  const bounds = node.bounds;
  if (!bounds) return raw;
  const { x, y } = bounds;
  if (x === 0 && y === 0 && raw.width === ctx.width && raw.height === ctx.height) {
    return raw;
  }

  // 有偏移：摆到文档坐标系
  const placed = createCanvas(ctx.width, ctx.height);
  ctx2dReadback(placed).drawImage(raw, x, y);
  return placed;
}

/**
 * 节点内容的对齐原点，也就是蒙版该摆的位置。
 *
 * 只有 contentOf 会摆位的那几种节点才按 bounds 算；组、调整层、滤镜层的内容
 * 本来就是文档尺寸的（读回下方画面），按原点算。这与 maskGeometry 对组的处理一致。
 */
function nodeOrigin(node: GraphNode): { x: number; y: number } {
  if (node.kind === 'pixel' || node.kind === 'text' || node.kind === 'shape' || node.kind === 'smart') {
    return node.bounds;
  }
  return { x: 0, y: 0 };
}

/** 套上节点自己的蒙版，没有或停用时原样返回 */
function masked(
  content: HTMLCanvasElement,
  node: GraphNode,
  ctx: EvalContext,
): HTMLCanvasElement {
  if (!node.maskId || node.maskEnabled === false) return content;
  const mask = ctx.resolver.mask(node.maskId);
  if (!mask) return content;
  /*
   * content 已经被 contentOf 摆到文档坐标了，蒙版也要摆到 bounds。
   * 原先用 applyMask，它会把图层尺寸的蒙版拉伸铺满整个文档：
   * PSD 里 700×240 的蒙版被拉成 790×4000，图层内容跟着被扭曲。
   * 没有 bounds 的节点（调整层等）按 (0,0) 处理，与原先一致。
   */
  const { x, y } = nodeOrigin(node);
  return applyMaskAt(sized(content, ctx), mask, x, y);
}

/**
 * 调整/滤镜节点：读回下方已合成的画面，施加效果，再按自己的
 * 混合模式与不透明度合回去。
 *
 * 「合回去」而不是「直接替换」是 PS 的语义：调整图层的不透明度调到 50%
 * 意味着效果只生效一半，蒙版则限定生效范围。若直接替换，
 * 这两个控件就都失去意义了。
 */
function paintEffectNode(
  target: CanvasRenderingContext2D,
  node: GraphNode,
  ctx: EvalContext,
): void {
  if (ctx.width <= 0 || ctx.height <= 0) return;
  const backdrop = target.getImageData(0, 0, ctx.width, ctx.height);

  const effected = createCanvas(ctx.width, ctx.height);
  const effectedCtx = ctx2dReadback(effected);
  effectedCtx.putImageData(backdrop, 0, 0);

  if (node.kind === 'adjustment') {
    if (!ctx.applyAdjustment) return;
    const image = effectedCtx.getImageData(0, 0, ctx.width, ctx.height);
    ctx.applyAdjustment(image, node.adjustment, node.params);
    effectedCtx.putImageData(image, 0, 0);
  } else if (node.kind === 'filter') {
    if (!ctx.applyFilter) return;
    const out = runFilters(effected, node.filters, ctx);
    if (!out) return;
    effectedCtx.clearRect(0, 0, ctx.width, ctx.height);
    effectedCtx.drawImage(out, 0, 0);
  }

  blendOnto(target, masked(effected, node, ctx), node.blendMode, node.opacity, ctx);
}

/** 依次跑一串启用的滤镜，任一条返回 null 时保留上一步结果 */
function runFilters(
  source: HTMLCanvasElement,
  filters: { enabled: boolean; filterId: string; params: Record<string, unknown> }[],
  ctx: EvalContext,
): HTMLCanvasElement | null {
  let current: HTMLCanvasElement = source;
  for (const entry of filters) {
    if (!entry.enabled) continue;
    const next = ctx.applyFilter?.(current, entry.filterId, entry.params);
    if (next) current = next;
  }
  return current;
}

/**
 * 画图层组。
 *
 * 穿透 + 不透明度满 + 无蒙版时组不做隔离，子节点直接混到下方画面上
 * （PS 新建组的默认表现）。一旦组自己有不透明度、混合模式或蒙版，
 * PS 也会强制隔离——先把组内合成成一张图，再作为整体混上去。
 */
function paintGroup(
  target: CanvasRenderingContext2D,
  node: GraphNode,
  graph: LayerGraph,
  ctx: EvalContext,
): void {
  const hasMask = Boolean(node.maskId) && node.maskEnabled !== false;
  const isolated = node.blendMode !== 'pass-through' || node.opacity < 100 || hasMask;
  const children = childrenOf(graph, node.id);

  if (!isolated) {
    /*
     * 穿透组必须画在 target 本身上，不能先合成到独立缓冲再叠加：
     * 组内的调整节点要读到「组下方的画面」才对，隔离一次就读不到了。
     */
    for (const run of clipRuns(children, (child) => Boolean(child.clipped))) {
      if (run.members.length === 0) paintNode(target, run.base, graph, ctx);
      else paintClipRun(target, run.base, run.members, graph, ctx);
    }
    return;
  }
  blendOnto(target, groupContent(node, graph, ctx), node.blendMode, node.opacity, ctx);
}

/** 组内合成结果（含组蒙版），不含组自身的混合模式与不透明度 */
function groupContent(
  node: GraphNode,
  graph: LayerGraph,
  ctx: EvalContext,
): HTMLCanvasElement {
  const content = paintSiblings(childrenOf(graph, node.id), graph, ctx);
  return masked(content, node, ctx);
}

/**
 * 画带图层效果的节点。
 * 顺序：投影 → 外发光 → 节点 → 内发光 → 描边（PS 的渲染顺序）。
 *
 * content 已经套了蒙版，效果基于蒙版后的形状生成。
 */
function paintNodeWithEffects(
  target: CanvasRenderingContext2D,
  content: HTMLCanvasElement,
  node: GraphNode,
  ctx: EvalContext,
): void {
  const { effects } = node;
  if (!effects) return;

  // 背后效果
  if (effects.dropShadow?.enabled) {
    const shadow = renderDropShadow(content, effects.dropShadow);
    drawWithBlend(
      target,
      shadow,
      effects.dropShadow.blendMode,
      effects.dropShadow.opacity / 100,
      ctx.width,
      ctx.height,
    );
  }
  if (effects.outerGlow?.enabled) {
    const glow = renderOuterGlow(content, effects.outerGlow);
    drawWithBlend(
      target,
      glow,
      effects.outerGlow.blendMode,
      effects.outerGlow.opacity / 100,
      ctx.width,
      ctx.height,
    );
  }

  // 节点本身（已套蒙版）
  blendOnto(target, content, node.blendMode, node.opacity, ctx);

  // 前置效果
  if (effects.innerGlow?.enabled) {
    const inner = renderInnerGlow(content, effects.innerGlow);
    drawWithBlend(
      target,
      inner,
      effects.innerGlow.blendMode,
      effects.innerGlow.opacity / 100,
      ctx.width,
      ctx.height,
    );
  }
  if (effects.stroke?.enabled) {
    const stroke = renderStroke(content, effects.stroke);
    drawWithBlend(
      target,
      stroke,
      effects.stroke.blendMode,
      effects.stroke.opacity / 100,
      ctx.width,
      ctx.height,
    );
  }
}

/**
 * 画一个剪贴组。PS 的语义：
 * - 成员只在基底的不透明区域内显示，最终 alpha 就等于基底的 alpha；
 * - 成员各自的混合模式作用在「基底 + 已画的成员」上；
 * - 基底的混合模式与不透明度作用在整组上。
 *
 * 所以先在缓冲里按满不透明度画基底，叠完成员，把 alpha 换回基底的，
 * 最后整体按基底的混合模式与不透明度合上去。
 */
function paintClipRun(
  target: CanvasRenderingContext2D,
  base: GraphNode,
  members: GraphNode[],
  graph: LayerGraph,
  ctx: EvalContext,
): void {
  // 基底隐藏则整组不显示：剪贴对象没了，成员无处可剪
  if (!base.visible || base.opacity <= 0) return;
  if (ctx.width <= 0 || ctx.height <= 0) return;

  /*
   * 取基底的「内容」而不是它画到画面上的结果：混合模式与不透明度
   * 要留到最后套在整组上，套两遍就重了。组当基底时因此走 groupContent。
   */
  const basePixels =
    base.kind === 'group'
      ? groupContent(base, graph, ctx)
      : maskedContentOf(base, ctx);
  if (!basePixels) return;

  const buffer = createCanvas(ctx.width, ctx.height);
  const bufferCtx = ctx2dReadback(buffer);
  bufferCtx.drawImage(basePixels, 0, 0);
  for (const member of members) paintNode(bufferCtx, member, graph, ctx);

  clipToAlpha(buffer, sized(basePixels, ctx));
  blendOnto(target, buffer, base.blendMode, base.opacity, ctx);
}

/** 非组节点的内容 + 蒙版，没有内容时返回 null */
function maskedContentOf(node: GraphNode, ctx: EvalContext): HTMLCanvasElement | null {
  const content = contentOf(node, ctx);
  if (!content) return null;
  return masked(content, node, ctx);
}

/** 把画布对齐到文档尺寸，供需要 getImageData 的地方使用 */
function sized(source: HTMLCanvasElement, ctx: EvalContext): HTMLCanvasElement {
  return sizedTo(source, ctx.width, ctx.height);
}

/** drawWithBlend 的定长包装，省去每个调用点重复传宽高 */
function blendOnto(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  mode: BlendMode,
  opacity: number,
  ctx: EvalContext,
): void {
  drawWithBlend(target, pixels, mode, opacity, ctx.width, ctx.height);
}
