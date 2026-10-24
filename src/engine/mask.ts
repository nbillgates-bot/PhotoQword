/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp, createCanvas, createReadbackCanvas, ctx2d, fillCanvas } from './canvasUtils';

/**
 * 图层蒙版。
 *
 * 存储形式沿用 PS：**灰度**画布，白=完全显示，黑=完全隐藏，灰=半透明。
 * 选灰度而不是直接存 alpha，是为了让"在蒙版上画画"这件事保持直觉——
 * 用黑色笔刷涂掉、用白色笔刷涂回来、拉黑白渐变做柔和过渡，
 * 都是普通的绘制操作，不用为每种颜色换一套 globalCompositeOperation。
 *
 * 代价是合成时要把亮度翻译成 alpha（见 maskToAlpha），这一步有像素循环，
 * 所以按蒙版画布做了缓存。
 */

/** 蒙版的几何：建多大、对齐到文档的哪个点 */
export interface MaskGeometry {
  width: number;
  height: number;
  /** 蒙版左上角在文档坐标里的位置 */
  x: number;
  y: number;
}

/** maskGeometry 只需要图层的这几个字段，写成结构类型免得引擎层依赖完整的 Layer */
interface MaskOwner {
  type: string;
  bounds: { x: number; y: number };
  canvas: HTMLCanvasElement;
}

/**
 * 蒙版该建多大、对齐到哪里。**所有产生或消费蒙版的地方都走这一个函数。**
 *
 * 这条规则以前散在四处各自实现，结果两个生产者给出的约定互相矛盾：
 * maskSlice 按文档尺寸建、psdLayers 按图层尺寸建，而合成一律画在文档原点。
 * PSD 里 bounds 不在原点的图层于是被整层抹掉（destination-in 交集为空）。
 * 收成一个函数是为了让它不可能再各自漂移。
 *
 * - 普通图层：蒙版跟图层画布同尺寸，对齐到 bounds。PS 的图层蒙版也是属于图层的。
 * - 组：组没有自己的像素（画布是 1×1 占位），拿它当基准没有意义，
 *   所以按文档尺寸建、对齐到原点。
 */
export function maskGeometry(layer: MaskOwner, doc: { width: number; height: number }): MaskGeometry {
  const { x, y } = maskOrigin(layer);
  if (layer.type === 'group') return { width: doc.width, height: doc.height, x, y };
  return { width: layer.canvas.width, height: layer.canvas.height, x, y };
}

/**
 * 蒙版对齐到文档的哪个点。**合成时画蒙版一律用这个,不要直接写 layer.bounds。**
 *
 * 消费端只需要位置(蒙版按自身尺寸画),不需要尺寸,所以不必知道文档多大 ——
 * 这样合成路径就不用为了一个「组永远是 (0,0)」的分支去层层传文档尺寸。
 * 尺寸是生产端的事,归 maskGeometry。
 */
export function maskOrigin(layer: Pick<MaskOwner, 'type' | 'bounds'>): { x: number; y: number } {
  // 组的 bounds 恒为 (0,0)(画布是 1×1 占位),蒙版按文档尺寸建,所以对齐到原点
  if (layer.type === 'group') return { x: 0, y: 0 };
  return { x: layer.bounds.x, y: layer.bounds.y };
}

/** 新建一个蒙版。reveal=true 全白（全部显示），false 全黑（全部隐藏） */
export function createMask(width: number, height: number, reveal = true): HTMLCanvasElement {
  // 蒙版像素也进历史差分，而且这里马上就 fillCanvas，声明必须在创建时下
  const mask = createReadbackCanvas(width, height);
  fillCanvas(mask, reveal ? '#ffffff' : '#000000');
  return mask;
}

/**
 * 缓存"灰度 -> alpha"的转换结果。
 *
 * 键是蒙版画布本身，用 WeakMap 所以图层删掉后会自动回收。
 * 画布是可变对象，React 看不见它变化，这个缓存同样看不见——
 * **任何改动蒙版像素的代码都必须调 invalidateMask()**，
 * 和改完图层像素要调 bumpRevision() 是同一类约定。
 */
const alphaCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();

/** 蒙版像素变了之后必须调用，否则合成会用旧的 alpha 版本 */
export function invalidateMask(mask: HTMLCanvasElement): void {
  alphaCache.delete(mask);
}

/**
 * 把灰度蒙版转成"RGB 全白、alpha = 原亮度"的画布，供 destination-in 使用。
 * 结果带缓存，重复合成同一张未改动的蒙版不会重复计算。
 */
export function maskToAlpha(mask: HTMLCanvasElement): HTMLCanvasElement {
  const hit = alphaCache.get(mask);
  if (hit) return hit;

  const image = ctx2d(mask).getImageData(0, 0, mask.width, mask.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    // 用 Rec.601 亮度，与 grayscale 调整保持一致
    const luma = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    // 再乘上自身 alpha：蒙版理论上 alpha 恒为 255，但橡皮之类的
    // destination-out 操作会打出透明洞。透明处应当视为"隐藏"，
    // 否则那些洞会因为残留的白色 RGB 被当成"完全显示"。
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = (luma * data[i + 3]) / 255;
  }
  const output = createCanvas(mask.width, mask.height);
  ctx2d(output).putImageData(image, 0, 0);
  alphaCache.set(mask, output);
  return output;
}

/**
 * 按蒙版裁剪图层像素，把蒙版**摆到 (x, y)、按自身尺寸**画，不拉伸。
 *
 * 和 applyMask 的区别就是这一句，但它决定了结果是「位置对」还是「整层消失」：
 *
 * - 蒙版与图层同尺寸同原点（应用内新建的蒙版都是这样）→ 两者等价。
 * - 蒙版是图层尺寸、图层像素已经摆到文档坐标（PSD 导入的图层）→
 *   applyMask 会把图层尺寸的蒙版拉伸铺满整个文档，图层被扭曲；
 *   而这里按 bounds 摆放，结果才是对的。
 *
 * 契约：蒙版对齐到 layer.bounds，尺寸取蒙版画布自身。
 * 与 viewCompositor 的视图路径是同一条规则，两条路径必须一致，
 * 否则屏幕上看到的和导出的不是同一张图。
 */
export function applyMaskAt(
  source: HTMLCanvasElement,
  mask: HTMLCanvasElement,
  x: number,
  y: number,
): HTMLCanvasElement {
  const output = createReadbackCanvas(source.width, source.height);
  const context = ctx2d(output);
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(maskToAlpha(mask), x, y);
  return output;
}

/**
 * 按蒙版裁剪图层像素，返回新画布（不改动入参）。
 * 蒙版尺寸与图层不一致时先拉伸对齐，避免调用方各自处理。
 *
 * **摆位场景请用 applyMaskAt**：像素已经摆到文档坐标、而蒙版还是图层尺寸时，
 * 这个函数的拉伸会把蒙版铺满整个文档。这里保留拉伸语义是给
 * transformSource / overlayPreview 用的，它们要的正是「按源画布缩放」。
 */
export function applyMask(
  source: HTMLCanvasElement,
  mask: HTMLCanvasElement,
): HTMLCanvasElement {
  // 合成时手写混合模式要 getImageData 读这张裁剪结果，每帧都走
  const output = createReadbackCanvas(source.width, source.height);
  const context = ctx2d(output);
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(maskToAlpha(mask), 0, 0, source.width, source.height);
  return output;
}

/**
 * 把选区蒙版转成图层蒙版：选中的地方显示，未选中的隐藏。
 *
 * geom 给出蒙版的尺寸与它在文档里的位置。选区蒙版是文档尺寸的，
 * 所以这里是**按位置裁**（把 geom 那一块搬过来），不是缩放：
 * 图层比文档小的时候缩放会把整个选区压进图层那一小块，位置全错。
 */
export function maskFromSelection(
  selectionMask: HTMLCanvasElement,
  geom: MaskGeometry,
): HTMLCanvasElement {
  const mask = createMask(geom.width, geom.height, false);
  const context = ctx2d(mask);
  // 选区蒙版本身是白=选中的灰度图，直接画上去即是"选中处变白"
  context.drawImage(selectionMask, -geom.x, -geom.y);
  return mask;
}

/** 反相蒙版（就地修改） */
export function invertMask(mask: HTMLCanvasElement): void {
  const context = ctx2d(mask);
  const image = context.getImageData(0, 0, mask.width, mask.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  context.putImageData(image, 0, 0);
  invalidateMask(mask);
}

/** 用统一灰度填满蒙版（就地修改）。level 取 0-255 */
export function fillMask(mask: HTMLCanvasElement, level: number): void {
  const value = Math.round(clamp(level, 0, 255));
  fillCanvas(mask, `rgb(${value},${value},${value})`);
  invalidateMask(mask);
}
