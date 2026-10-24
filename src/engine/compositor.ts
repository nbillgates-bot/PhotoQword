/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BlendMode, Layer } from '../types';
import { createCanvas, createReadbackCanvas, ctx2d } from './canvasUtils';
import { applyMask, applyMaskAt, maskOrigin } from './mask';
import { blendImageData, isNativeBlend, nativeOperation } from './blendModes';
import type { LayerNode } from './layerTree';
import { clipRuns, clipToAlpha } from './clipping';
import {
  renderDropShadow,
  renderOuterGlow,
  renderInnerGlow,
  renderStroke,
} from './layerEffects';
import { graphFromLayers, resolverFrom } from './graph/layerAdapter';
import { applyAdjust } from './adjustments';
import { evaluateGraph } from './graph/evaluator';

/** 蒙版生效时返回裁剪后的画布，否则原样返回。尺寸与位置仍是图层自己的 */
export function layerPixels(layer: Layer): HTMLCanvasElement {
  if (!layer.mask || layer.maskEnabled === false) return layer.canvas;
  return applyMask(layer.canvas, layer.mask);
}

/**
 * 把图层像素摆到文档坐标系里，返回一张文档尺寸的画布。
 *
 * 图层画布不必与文档同尺寸、也不必从原点开始（见 Layer.bounds），
 * 而下游的混合、效果、剪贴全是按文档坐标算的，所以先在这里对齐一次，
 * 后面所有代码都能继续按 (0,0) 画，不用各自处理偏移。
 *
 * 顺序是「先摆位、后套蒙版」：蒙版是文档尺寸的，
 * 反过来先套的话 applyMask 会把它拉伸到图层画布的尺寸上去，位置就错了。
 *
 * bounds 恰好覆盖整个文档时直接走 layerPixels，省掉一次全尺寸分配 ——
 * 这是绝大多数图层的情况。
 */
export function placedPixels(layer: Layer, width: number, height: number): HTMLCanvasElement {
  const { x, y } = layer.bounds;
  if (x === 0 && y === 0 && layer.canvas.width === width && layer.canvas.height === height) {
    return layerPixels(layer);
  }
  // 手写混合模式会 getImageData 读这张摆好位置的像素，合成路径上每帧都走
  const placed = createReadbackCanvas(width, height);
  ctx2d(placed).drawImage(layer.canvas, x, y);
  if (!layer.mask || layer.maskEnabled === false) return placed;
  // 像素已经摆到文档坐标，蒙版也要摆到对齐点；用 applyMask 会把图层尺寸的
  // 蒙版拉伸铺满整个文档（PSD 导入的图层就是这样被画歪的）
  const origin = maskOrigin(layer);
  return applyMaskAt(placed, layer.mask, origin.x, origin.y);
}

/** 视口裁剪用的矩形 */
export interface Viewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 判断两个矩形是否相交 */
function intersects(a: Viewport, b: Viewport): boolean {
  return !(
    a.x + a.width < b.x ||
    b.x + b.width < a.x ||
    a.y + a.height < b.y ||
    b.y + b.height < a.y
  );
}

/**
 * 把图层栈按顺序合成到目标上下文。
 * layers[0] 是最底层，与图层面板中"倒序显示"相对应。
 *
 * 内部已切换到新求值器（evaluateGraph），外部接口保持不变。
 *
 * @param viewport 可选的视口范围，只渲染与它相交的图层（视口裁剪优化）
 */
export function composite(
  target: CanvasRenderingContext2D,
  layers: Layer[],
  width: number,
  height: number,
  viewport?: Viewport,
): void {
  // 视口裁剪：过滤出与视口相交的图层
  let visibleLayers = layers;
  if (viewport) {
    visibleLayers = layers.filter((layer) => {
      if (!layer.visible || layer.opacity <= 0) return false;
      const layerBounds = {
        x: layer.bounds.x,
        y: layer.bounds.y,
        width: layer.canvas.width,
        height: layer.canvas.height,
      };
      return intersects(layerBounds, viewport);
    });
  }

  target.save();
  target.clearRect(0, 0, width, height);

  // 新路径：Layer[] → LayerGraph → 求值
  const bridge = graphFromLayers(visibleLayers);
  const result = evaluateGraph(bridge.graph, {
    width,
    height,
    resolver: resolverFrom(bridge.canvases, bridge.masks),
    applyAdjustment: (image, kind, params) => {
      // 目前只实现了 brightness-contrast，其它调整类型暂时跳过
      if (kind === 'brightness-contrast') {
        const fullParams = {
          brightness: (params.brightness as number) ?? 0,
          contrast: (params.contrast as number) ?? 0,
          saturation: (params.saturation as number) ?? 0,
          hue: (params.hue as number) ?? 0,
          exposure: (params.exposure as number) ?? 0,
          temperature: (params.temperature as number) ?? 0,
          vibrance: (params.vibrance as number) ?? 0,
        };
        applyAdjust(image, fullParams);
      }
    },
  });

  target.drawImage(result, 0, 0);
  target.restore();
}

/**
 * 把图层栈叠加到 target 已有内容之上，不清空画布。
 *
 * 分层缓存要「先画缓存、再叠上层图层」，走 composite 会被它开头的 clearRect
 * 把缓存擦掉，所以单独开这个入口。语义上就是 composite 去掉清屏那一步。
 */

/**
 * 把一层兄弟节点按自底向上的顺序画到 target 上。
 *
 * 先切成剪贴组：没有成员的走原来的直接绘制，有成员的走 paintClipRun。
 */
function paintNodes(
  target: CanvasRenderingContext2D,
  nodes: LayerNode[],
  width: number,
  height: number,
): void {
  for (const run of clipRuns(nodes, (node) => Boolean(node.layer.clipped))) {
    if (run.members.length === 0) {
      paintNode(target, run.base, width, height);
      continue;
    }
    paintClipRun(target, run.base, run.members, width, height);
  }
}

/**
 * 画单个节点（组走组的路径），不考虑剪贴。
 *
 * 组隐藏时直接 return，子节点根本不递归进去 —— PS 的行为：
 * 组的眼睛关了，组内所有图层都不显示，即使它们自己的 visible 是 true。
 */
function paintNode(
  target: CanvasRenderingContext2D,
  node: LayerNode,
  width: number,
  height: number,
): void {
  const { layer } = node;
  if (!layer.visible || layer.opacity <= 0) return;
  if (layer.type === 'group') {
    paintGroup(target, node, width, height);
    return;
  }
  if (layer.type === 'adjustment') {
    paintAdjustmentLayer(target, layer, width, height);
    return;
  }
  /*
   * 快速路径：原生混合 + 无蒙版 + 无效果时直接按 bounds 偏移画上去，
   * 不先摊平到文档尺寸。
   *
   * 原生混合只在源有覆盖的地方起作用，源之外等同于透明、不改动目标，
   * 所以「摊平后画到 (0,0)」和「直接画到 (x,y)」结果一致。
   * 长图文档（例如 790×14235）里一张文档尺寸画布就要 45MB，
   * 几百个图层时这一次分配就是点一下眼睛卡住的全部原因。
   *
   * 另外三条路径省不掉，必须先对齐到文档坐标：
   * 蒙版要按对齐点摆到文档坐标系里裁（见 mask.ts 的 maskGeometry / applyMaskAt）；
   * 手写混合要 getImageData，尺寸必须和 target 一致；
   * 效果要从对齐后的画布算投影/发光的位置。
   */
  const needsPlacing =
    (Boolean(layer.mask) && layer.maskEnabled !== false) ||
    Boolean(layer.effects) ||
    !isNativeBlend(normalizeBlend(layer.blendMode));

  if (!needsPlacing) {
    drawNative(target, layer.canvas, layer.blendMode, layer.opacity, layer.bounds.x, layer.bounds.y);
    return;
  }

  const pixels = placedPixels(layer, width, height);
  // 有效果时先画效果，再画图层，再画前置效果（内发光/描边）
  if (layer.effects) {
    paintLayerWithEffects(target, pixels, layer, width, height);
    return;
  }
  /*
   * 手写混合只需要覆盖图层自己的范围：蒙版只会抹掉像素、不会凭空加出像素，
   * 所以 bounds 一定是源不透明区域的上界。效果那条路不能这样收
   * （投影/发光会画到 bounds 之外），所以只在这里传。
   */
  drawPixels(target, pixels, layer.blendMode, layer.opacity, width, height, {
    x: layer.bounds.x,
    y: layer.bounds.y,
    width: layer.canvas.width,
    height: layer.canvas.height,
  });
}

/**
 * 画调整图层：对 target 当前内容就地应用调整。
 *
 * PS 的语义：调整图层作用于它下方的所有图层合成结果（到另一个调整图层或文档底部为止）。
 * 这里简化成始终对整个 target 内容应用，因为 paintNodes 自底向上依次调用，
 * 执行到这里时 target 里的就是下方图层已合成的结果。
 */
function paintAdjustmentLayer(
  target: CanvasRenderingContext2D,
  layer: Layer,
  width: number,
  height: number,
): void {
  if (!layer.adjustmentData || width === 0 || height === 0) return;
  const { kind, params } = layer.adjustmentData;

  // 目前只实现了 brightness-contrast，与 composite() 导出路径保持一致
  if (kind === 'brightness-contrast') {
    const imageData = target.getImageData(0, 0, width, height);
    const fullParams = {
      brightness: (params.brightness as number) ?? 0,
      contrast: (params.contrast as number) ?? 0,
      saturation: (params.saturation as number) ?? 0,
      hue: (params.hue as number) ?? 0,
      exposure: (params.exposure as number) ?? 0,
      temperature: (params.temperature as number) ?? 0,
      vibrance: (params.vibrance as number) ?? 0,
    };
    applyAdjust(imageData, fullParams);
    target.putImageData(imageData, 0, 0);
  }
}

/**
 * 画带效果的图层。
 * 顺序：投影 → 外发光 → 图层 → 内发光 → 描边（PS 的渲染顺序）。
 */
function paintLayerWithEffects(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  layer: Layer,
  width: number,
  height: number,
): void {
  const { effects } = layer;
  if (!effects) return;

  // 背后效果
  if (effects.dropShadow?.enabled) {
    const shadow = renderDropShadow(pixels, effects.dropShadow);
    drawPixels(target, shadow, effects.dropShadow.blendMode, effects.dropShadow.opacity, width, height);
  }
  if (effects.outerGlow?.enabled) {
    const glow = renderOuterGlow(pixels, effects.outerGlow);
    drawPixels(target, glow, effects.outerGlow.blendMode, effects.outerGlow.opacity, width, height);
  }

  // 图层本身
  drawPixels(target, pixels, layer.blendMode, layer.opacity, width, height);

  // 前置效果
  if (effects.innerGlow?.enabled) {
    const inner = renderInnerGlow(pixels, effects.innerGlow);
    drawPixels(target, inner, effects.innerGlow.blendMode, effects.innerGlow.opacity, width, height);
  }
  if (effects.stroke?.enabled) {
    const stroke = renderStroke(pixels, effects.stroke);
    drawPixels(target, stroke, effects.stroke.blendMode, effects.stroke.opacity, width, height);
  }
}

/**
 * 画一个剪贴组：基底 + 剪贴到它上面的成员。
 *
 * PS 的语义：
 * - 成员只在基底的不透明区域内显示，最终 alpha 就是基底的 alpha；
 * - 成员各自的混合模式作用在「基底 + 已画的成员」上，不是作用在组下方的画面上；
 * - 基底的混合模式与不透明度作用在整个剪贴组上。
 *
 * 所以先在缓冲里按 100% 正常模式画基底，叠完成员，把 alpha 换回基底的，
 * 最后整体按基底的混合模式与不透明度合上去。
 */
function paintClipRun(
  target: CanvasRenderingContext2D,
  base: LayerNode,
  members: LayerNode[],
  width: number,
  height: number,
): void {
  // 基底隐藏时整组都不显示，与 PS 一致：剪贴对象没了，成员无处可剪
  if (!base.layer.visible || base.layer.opacity <= 0) return;
  if (width === 0 || height === 0) return;

  /*
   * 取基底的「内容」而不是它画到画面上的结果：混合模式与不透明度
   * 要留到最后套在整组上，在这里套一遍、最后再套一遍就重了。
   * 组当基底时因此走 groupContent（内部合成 + 组蒙版），不走 paintGroup。
   */
  const basePixels =
    base.layer.type === 'group'
      ? groupContent(base, width, height)
      : toSized(placedPixels(base.layer, width, height), width, height);

  // clipToAlpha 会 getImageData 这张缓冲，剪贴组每帧合成都要走一遍
  const buffer = createReadbackCanvas(width, height);
  const bufferCtx = ctx2d(buffer);
  bufferCtx.drawImage(basePixels, 0, 0);
  for (const member of members) paintNode(bufferCtx, member, width, height);

  clipToAlpha(buffer, basePixels);
  drawPixels(target, buffer, base.layer.blendMode, base.layer.opacity, width, height);
}

/**
 * 画一个图层组。
 *
 * 穿透 + 不透明度 100 + 无蒙版 + 无效果时组不做隔离，子图层直接混到下方画面上，
 * 这是 PS 里新建组的默认表现。一旦组自己有不透明度、混合模式、蒙版或效果，
 * PS 也会强制隔离——先把组内合成成一张图，再作为整体混合上去。
 */
function paintGroup(
  target: CanvasRenderingContext2D,
  node: LayerNode,
  width: number,
  height: number,
): void {
  const { layer } = node;
  const isolated =
    layer.blendMode !== 'pass-through' ||
    layer.opacity < 100 ||
    (Boolean(layer.mask) && layer.maskEnabled !== false) ||
    Boolean(layer.effects);

  if (!isolated) {
    paintNodes(target, node.children, width, height);
    return;
  }

  if (width === 0 || height === 0) return;
  const content = groupContent(node, width, height);
  // 组有效果时走效果绘制
  if (layer.effects) {
    paintLayerWithEffects(target, content, layer, width, height);
    return;
  }
  drawPixels(target, content, layer.blendMode, layer.opacity, width, height);
}

/**
 * 组内合成结果（含组蒙版），不含组自身的混合模式与不透明度。
 *
 * 剪贴组要拿它当基底的 alpha 来源，所以必须能单独取到；
 * 穿透组在这里也会被隔离成一张图——当基底时没有别的办法拿到它的 alpha。
 */
function groupContent(node: LayerNode, width: number, height: number): HTMLCanvasElement {
  // 隔离出来的这张会当基底的 alpha 来源，clipToAlpha 与手写混合都要读它
  const buffer = createReadbackCanvas(width, height);
  paintNodes(ctx2d(buffer), node.children, width, height);
  const mask = node.layer.mask;
  if (!mask || node.layer.maskEnabled === false) return buffer;
  // 组的蒙版按文档尺寸建、对齐到原点，所以这里摆位是恒等的；
  // 走 maskOrigin 是为了和其他三处同一条规则，不在这里各写一遍
  const { x, y } = maskOrigin(node.layer);
  return applyMaskAt(buffer, mask, x, y);
}

/*
 * 穿透没有对应的像素混合公式：隔离后的组按正常处理（PS 同此），
 * 非组图层理论上不该有这个值，真被设上了也按正常画。
 * 不归一化的话会掉进 blendImageData 的 "CUSTOM 里没这个模式就直接 return"，
 * 结果是整个图层完全不显示——比画错更难查。
 */
function normalizeBlend(mode: BlendMode): BlendMode {
  return mode === 'pass-through' ? 'normal' : mode;
}

/** 原生混合的绘制。dx/dy 是源在文档坐标里的位置，省掉一次全尺寸摊平 */
function drawNative(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  mode: BlendMode,
  opacity: number,
  dx: number,
  dy: number,
): void {
  target.save();
  target.globalAlpha = opacity / 100;
  target.globalCompositeOperation = nativeOperation(normalizeBlend(mode));
  target.drawImage(pixels, dx, dy);
  target.restore();
}

/**
 * 把一张画布按混合模式与不透明度合成到 target 上。
 *
 * dirty 是源像素在文档坐标里的外接框。只在手写混合时用到：
 * blendImageData 对 source alpha 为 0 的像素直接 continue、不改 backdrop
 * （见 blendModes.ts），所以框外的读-混-写是纯浪费，可以整段跳掉。
 * 长图里这一项决定性能：790×14235 全幅读回是 45MB / 1120 万像素，
 * 而一个图层通常只占其中几十分之一。不传则按整幅处理。
 */
function drawPixels(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  mode: BlendMode,
  opacity: number,
  width: number,
  height: number,
  dirty?: Viewport,
): void {
  const blendMode = normalizeBlend(mode);

  if (isNativeBlend(blendMode)) {
    drawNative(target, pixels, blendMode, opacity, 0, 0);
    return;
  }

  // 手写路径：读回当前合成结果，逐像素混合后写回
  if (width === 0 || height === 0) return;
  const box = clampRect(dirty ?? { x: 0, y: 0, width, height }, width, height);
  if (!box) return;

  const sized = toSized(pixels, width, height);
  const backdrop = target.getImageData(box.x, box.y, box.width, box.height);
  const source = ctx2d(sized).getImageData(box.x, box.y, box.width, box.height);
  blendImageData(backdrop, source, blendMode, opacity / 100);
  target.putImageData(backdrop, box.x, box.y);
}

/** 把矩形取整并夹进文档范围，完全在画布外时返回 null */
function clampRect(rect: Viewport, width: number, height: number): Viewport | null {
  const x = Math.max(0, Math.floor(rect.x));
  const y = Math.max(0, Math.floor(rect.y));
  const right = Math.min(width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(height, Math.ceil(rect.y + rect.height));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * 保证画布与文档同尺寸。
 * 图层画布本该与文档一致，但裁剪撤销等路径下可能短暂不一致，
 * getImageData 尺寸不匹配会直接抛错，这里补一层。
 */
function toSized(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;
  // 补出来这张就是为了紧接着被 getImageData，混合模式每帧都要走
  const sized = createReadbackCanvas(width, height);
  ctx2d(sized).drawImage(source, 0, 0);
  return sized;
}

/**
 * 合成为一个新的 canvas，用于导出/预览/缩略图，也用于合并图层。
 *
 * 声明可读回：调用方要么直接读它的像素（吸管、魔棒），要么把它留下来当
 * 图层画布（向下合并、合并组），两种用法都会反复 getImageData。
 * 导出与缩略图那边走的是 toBlob / drawImage，声明与否实测没有差别。
 */
export function flatten(layers: Layer[], width: number, height: number): HTMLCanvasElement {
  const output = createReadbackCanvas(width, height);
  composite(ctx2d(output), layers, width, height);
  return output;
}

/**
 * 生成图层缩略图。
 * 保持宽高比并居中，透明处显示棋盘由 CSS 负责。
 */
export function makeThumbnail(source: HTMLCanvasElement, box: number): string {
  const scale = Math.min(box / source.width, box / source.height);
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const thumb = createCanvas(w, h);
  const context = ctx2d(thumb);
  context.imageSmoothingQuality = 'medium';
  context.drawImage(source, 0, 0, w, h);
  return thumb.toDataURL('image/png');
}



