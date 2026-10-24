/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 笔刷描边的实时预览。
 *
 * 描边期间像素先攒在一张「缓冲」里(见 store/overlaySlice.ts),抬手才一次性
 * 合入图层——否则同一点反复涂会越叠越深。预览要把「图层 + 缓冲」的样子先算出来,
 * 让用户看到最终效果。
 *
 * **不能把缓冲直接画在合成结果之上**:橡皮用的是 destination-out,
 * 那样会连下层图层一起擦掉。正确做法是先把「目标图层 + 缓冲」合成为一个临时图层,
 * 再让它照常参与整体合成。
 *
 * 临时图层只做到**图层自己那么大**,不做成文档尺寸。缓冲虽然是文档坐标的,
 * 但描边只可能落在图层范围内,合出来的结果超出 bounds 的部分必然是空的。
 * 790×16041 的长图里,一张文档尺寸临时画布是 50MB,而指针每移动一下就要建一张
 * (还要再建一张裁选区用的),这是「放大后编辑图层很慢」的直接原因。
 */

import type { Layer, Selection } from '../types';
import { createCanvas, createReadbackCanvas, ctx2d } from './canvasUtils';
import { withCanvas } from './layerBounds';
import { maskToAlpha } from './mask';

/**
 * 描边缓冲的状态。
 *
 * 与 store 里的 Overlay 结构一致(见 store/types.ts),这里单独声明一份
 * 是为了让引擎层不反向依赖 store —— engine/ 不认识 store 是分层规则。
 * target 缺省表示合入图层像素,与 store 的约定相同。
 */
export interface OverlayState {
  targetLayerId: string;
  target?: 'canvas' | 'mask';
  canvas: HTMLCanvasElement;
  operation: 'source-over' | 'destination-out';
  opacity: number;
  clipToSelection: boolean;
}

/**
 * 把缓冲裁到选区内,返回新画布。
 *
 * 尺寸跟着选区蒙版走(文档尺寸):destination-in 要求两张图对齐,
 * 而选区蒙版就是文档坐标的。
 *
 * 必须先过 maskToAlpha:选区蒙版是「灰度 + alpha 恒为 255」的画布,
 * 直接拿它做 destination-in 等于什么都没裁(全不透明),
 * 半透明的羽化边缘也会丢。这是全项目的统一约定,见 mask.ts。
 */
function clipToSelection(
  source: HTMLCanvasElement,
  selection: Selection,
): HTMLCanvasElement {
  const clipped = createCanvas(source.width, source.height);
  const context = ctx2d(clipped);
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(maskToAlpha(selection.mask), 0, 0);
  return clipped;
}

/**
 * 把缓冲合进图层像素,返回一张与图层画布同尺寸的新画布。
 *
 * 缓冲是文档坐标的,图层画布是局部坐标,差 bounds 那个原点,
 * 所以缓冲要按 -bounds 平移画上去——与 commitOverlay 里的合入方式一致,
 * 保证预览和抬手后的结果分毫不差。
 */
function mergeIntoLayer(
  layer: Layer,
  source: HTMLCanvasElement,
  overlay: OverlayState,
): HTMLCanvasElement {
  const merged = createReadbackCanvas(layer.canvas.width, layer.canvas.height);
  const context = ctx2d(merged);
  context.drawImage(layer.canvas, 0, 0);
  context.globalAlpha = overlay.opacity / 100;
  context.globalCompositeOperation = overlay.operation;
  context.drawImage(source, -layer.bounds.x, -layer.bounds.y);
  return merged;
}

/**
 * 把缓冲合进蒙版,返回文档尺寸的新蒙版。
 *
 * 蒙版本身就是文档坐标的,不跟图层偏移走,所以原点对齐直接画。
 * 这里省不掉文档尺寸的分配:applyMask 会把蒙版拉伸到入参画布尺寸,
 * 换成小尺寸就对不上位置了。好在只有「在蒙版上画」这一种情况会走到。
 */
function mergeIntoMask(
  mask: HTMLCanvasElement,
  source: HTMLCanvasElement,
  overlay: OverlayState,
): HTMLCanvasElement {
  const merged = createReadbackCanvas(mask.width, mask.height);
  const context = ctx2d(merged);
  context.drawImage(mask, 0, 0);
  context.globalAlpha = overlay.opacity / 100;
  context.globalCompositeOperation = overlay.operation;
  context.drawImage(source, 0, 0);
  return merged;
}

/**
 * 把目标图层替换成「图层 + 描边缓冲」的预览版本,其余图层原样返回。
 *
 * 返回新数组;没有目标图层时原样返回入参数组。
 */
export function overlayPreviewLayers(
  layers: Layer[],
  overlay: OverlayState,
  selection: Selection | null,
): Layer[] {
  const source =
    overlay.clipToSelection && selection ? clipToSelection(overlay.canvas, selection) : overlay.canvas;

  return layers.map((layer) => {
    if (layer.id !== overlay.targetLayerId) return layer;
    // 画在蒙版上时缓冲要合进蒙版的副本,否则笔迹会画到图层像素上
    const onMask = overlay.target === 'mask' && layer.mask;
    if (onMask) {
      return { ...layer, mask: mergeIntoMask(layer.mask!, source, overlay) };
    }
    // bounds 的位置不变,只换画布内容,所以原点照旧
    return withCanvas(layer, mergeIntoLayer(layer, source, overlay), layer.bounds.x, layer.bounds.y);
  });
}
