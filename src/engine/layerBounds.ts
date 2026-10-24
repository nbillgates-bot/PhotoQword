/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer, Rect } from '../types';
import { createReadbackCanvas, ctx2d, ctx2dReadback } from './canvasUtils';

/**
 * 图层边界的纯计算。
 *
 * 图层画布不与文档同尺寸，bounds 描述它在文档坐标系里占哪一块。
 * 不变量：bounds.width/height 恒等于该图层 canvas 的宽高。
 * 这里的函数一律返回新对象，不就地修改入参。
 */

/** 文档自身的矩形，供"图层铺满文档"这个默认情形用 */
export function docRect(width: number, height: number): Rect {
  return { x: 0, y: 0, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

/** 按画布尺寸和左上角位置组出 bounds，保证不变量成立 */
export function boundsFor(canvas: HTMLCanvasElement, x = 0, y = 0): Rect {
  return { x: Math.round(x), y: Math.round(y), width: canvas.width, height: canvas.height };
}

/** 平移。只改位置，尺寸不动 */
export function translateBounds(bounds: Rect, dx: number, dy: number): Rect {
  return { ...bounds, x: bounds.x + Math.round(dx), y: bounds.y + Math.round(dy) };
}

/** 两个矩形的并集（最小外接矩形） */
export function unionRect(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/** 点在矩形内吗。右边界和下边界算在内，命中检测按闭区间处理 */
export function pointInRect(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/** 两个矩形的交集。不相交时返回 null */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/** bounds 是否与文档矩形完全重合（即"老式的铺满文档图层"） */
export function coversDoc(bounds: Rect, width: number, height: number): boolean {
  return bounds.x === 0 && bounds.y === 0 && bounds.width === width && bounds.height === height;
}

/** 文档坐标 -> 图层局部坐标 */
export function toLocal(bounds: Rect, x: number, y: number): { x: number; y: number } {
  return { x: x - bounds.x, y: y - bounds.y };
}

/** 图层局部坐标 -> 文档坐标 */
export function toDoc(bounds: Rect, x: number, y: number): { x: number; y: number } {
  return { x: x + bounds.x, y: y + bounds.y };
}

/**
 * 画布里非透明像素的外接矩形（画布局部坐标），全透明时返回 null。
 *
 * 注意与 bounds 的区别：bounds 是画布这块地占了文档的哪里，
 * 这里算的是画布上真正有内容的范围。图层撑大之后四周往往是空的，
 * 「图层边缘」和属性面板要显示的是后者——PS 显示的也是内容范围。
 */
export function contentBounds(canvas: HTMLCanvasElement): Rect | null {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return null;
  // 显示图层边缘时每帧都要全幅扫一遍 alpha，缩略图也走这里，是典型的反复读
  const { data } = ctx2dReadback(canvas).getImageData(0, 0, width, height);

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 图层内容在**文档坐标系**里的矩形，全透明时返回 null。
 * 内容范围（画布局部）加上图层位置，就是画布上看到的那一圈边缘。
 */
export function contentRect(layer: Layer): Rect | null {
  const local = contentBounds(layer.canvas);
  if (!local) return null;
  return { ...local, x: local.x + layer.bounds.x, y: local.y + layer.bounds.y };
}

/**
 * 换掉图层的画布，同时把 bounds 同步到新画布的尺寸。
 * 返回新的图层对象（不改原对象）。
 *
 * 换画布的地方一律走这个函数，不要手写 `{ ...layer, canvas }`：
 * 漏掉 bounds 会破坏 bounds.width === canvas.width 这条不变量，
 * 而 TypeScript 查不出来（两个字段都还在，只是对不上）。
 */
export function withCanvas(
  layer: Layer,
  canvas: HTMLCanvasElement,
  x = layer.bounds.x,
  y = layer.bounds.y,
): Layer {
  return { ...layer, canvas, bounds: boundsFor(canvas, x, y) };
}

/**
 * 让图层的 bounds 至少覆盖 rect，需要时把画布放大并把原像素搬到新位置。
 * 已经覆盖到了就原样返回同一个对象（调用方可用 === 判断有没有变）。
 *
 * 用途：绘制类操作都在文档坐标系里写像素，写之前先让图层覆盖住文档，
 * 之后 `文档坐标 - bounds.x/y` 就等于画布坐标。图层被移出画布之后
 * 再回来画一笔，就是靠这个把画布长回来的（PS 里图层也会这样自动长大）。
 *
 * 就地修改：不改。返回新的图层对象与新画布。
 */
export function expandToCover(layer: Layer, rect: Rect): Layer {
  const next = unionRect(layer.bounds, rect);
  if (
    next.x === layer.bounds.x &&
    next.y === layer.bounds.y &&
    next.width === layer.bounds.width &&
    next.height === layer.bounds.height
  ) {
    return layer;
  }
  // 这张会顶替 layer.canvas，得和原来那张一样在创建时就声明可读回
  const canvas = createReadbackCanvas(next.width, next.height);
  ctx2d(canvas).drawImage(layer.canvas, layer.bounds.x - next.x, layer.bounds.y - next.y);
  return { ...layer, canvas, bounds: next };
}
