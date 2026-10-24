/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Selection } from '../types';
import { createReadbackCanvas, ctx2d } from './canvasUtils';

/**
 * 浮动选区：用移动工具拖动选区时，把选中的像素"提起来"。
 *
 * 对应 PS 的行为：拖动开始时选区内的像素离开原位（留下透明），
 * 跟着鼠标走，抬手时落在新位置。
 *
 * 坐标系约定：选区蒙版是**文档坐标系**，图层画布是**图层局部坐标系**，
 * 两者相差 origin（即图层的 bounds.x / bounds.y）。图层被移动过后
 * origin 不为零，不做换算就会取错位置 —— 这里所有函数都显式接收 origin。
 */

/**
 * 提取选区内的像素到独立画布（不修改原画布）。
 *
 * @param source 源画布（图层画布，局部坐标系）
 * @param selection 选区（文档坐标系）
 * @param origin 图层在文档中的位置，用于把文档坐标换算到画布坐标
 * @returns 选区内的像素，画布尺寸等于选区 bounds
 */
export function extractSelectionOnly(
  source: HTMLCanvasElement,
  selection: Selection,
  origin: Point = { x: 0, y: 0 },
): HTMLCanvasElement {
  const { bounds } = selection;
  const { width, height } = bounds;
  // 文档坐标 → 画布局部坐标
  const sx = bounds.x - origin.x;
  const sy = bounds.y - origin.y;

  // 下面就要 getImageData 按蒙版衰减 alpha，而且它常被拿去当浮动选区反复读
  const extracted = createReadbackCanvas(width, height);
  const target = ctx2d(extracted);
  target.drawImage(source, sx, sy, width, height, 0, 0, width, height);

  // 按蒙版强度衰减 alpha，羽化边缘因此得到平滑过渡
  const image = target.getImageData(0, 0, width, height);
  const strength = maskStrength(selection, width, height);
  applyStrength(image, strength, false);
  target.putImageData(image, 0, 0);

  return extracted;
}

/**
 * 提取选区内的像素到独立画布，并把原画布对应位置清空。
 *
 * @param source 源画布（图层画布，局部坐标系）
 * @param selection 选区（文档坐标系）
 * @param origin 图层在文档中的位置，用于把文档坐标换算到画布坐标
 * @returns 选区内的像素，画布尺寸等于选区 bounds
 */
export function extractSelection(
  source: HTMLCanvasElement,
  selection: Selection,
  origin: Point = { x: 0, y: 0 },
): HTMLCanvasElement {
  const extracted = extractSelectionOnly(source, selection, origin);
  clearSelection(source, selection, origin);
  return extracted;
}

/**
 * 按选区把画布上对应的像素清成透明（就地修改 canvas）。
 * 羽化边缘按强度部分保留，不是硬切。
 */
export function clearSelection(
  canvas: HTMLCanvasElement,
  selection: Selection,
  origin: Point = { x: 0, y: 0 },
): void {
  const { bounds } = selection;
  const { width, height } = bounds;
  const sx = bounds.x - origin.x;
  const sy = bounds.y - origin.y;

  const context = ctx2d(canvas);
  const image = context.getImageData(sx, sy, width, height);
  const strength = maskStrength(selection, width, height);
  applyStrength(image, strength, true);
  context.putImageData(image, sx, sy);
}

/**
 * 把提起来的像素落到画布上（就地修改 canvas）。
 *
 * @param x 目标位置的文档坐标 x
 * @param y 目标位置的文档坐标 y
 * @param origin 图层在文档中的位置
 */
export function pasteSelection(
  canvas: HTMLCanvasElement,
  extracted: HTMLCanvasElement,
  x: number,
  y: number,
  origin: Point = { x: 0, y: 0 },
): void {
  ctx2d(canvas).drawImage(extracted, x - origin.x, y - origin.y);
}

/** 取选区 bounds 范围内的蒙版强度（alpha 通道），长度为 width*height */
function maskStrength(selection: Selection, width: number, height: number): Uint8ClampedArray {
  const { mask, bounds } = selection;
  const data = ctx2d(mask).getImageData(bounds.x, bounds.y, width, height).data;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0; i < out.length; i += 1) out[i] = data[i * 4 + 3];
  return out;
}

/**
 * 按强度调整 alpha。
 * invert=false：保留选中部分（提取用）；invert=true：擦掉选中部分（清除用）。
 */
function applyStrength(image: ImageData, strength: Uint8ClampedArray, invert: boolean): void {
  const { data } = image;
  for (let p = 0; p < strength.length; p += 1) {
    const s = strength[p];
    if (s === 0) {
      // 完全未选中：提取时清空，清除时原样保留
      if (!invert) data[p * 4 + 3] = 0;
      continue;
    }
    if (s === 255) {
      if (invert) data[p * 4 + 3] = 0;
      continue;
    }
    const keep = invert ? 1 - s / 255 : s / 255;
    data[p * 4 + 3] = Math.round(data[p * 4 + 3] * keep);
  }
}
