/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect, Selection } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';

/**
 * 平移选区：蒙版内容整体搬到新位置，形状（矩形/椭圆/羽化）保持不变。
 *
 * 对应 PS 里用选框工具拖动选区内部：蚂蚁线走，像素不动，
 * 变的只是"哪些像素被选中"。
 *
 * 蒙版和文档同尺寸，所以移出画布的部分会被裁掉 —— 这与 PS 一致
 * （PS 的选区也不能存在于画布之外）。因为会裁，bounds 不能简单地加偏移，
 * 必须和文档矩形求交，否则蚂蚁线会画到画布外、且 bounds 与蒙版实际范围不符，
 * 后续命中检测就会把空白处判定成"在选区内"。
 *
 * @returns 平移后的新选区；整个选区都被移出画布时返回 null
 */
export function translateSelection(
  selection: Selection,
  dx: number,
  dy: number,
): Selection | null {
  const { mask, bounds } = selection;

  const moved: Rect = {
    x: bounds.x + dx,
    y: bounds.y + dy,
    width: bounds.width,
    height: bounds.height,
  };
  const clipped = intersectRect(moved, { x: 0, y: 0, width: mask.width, height: mask.height });
  // 全部移出画布：选区没了，交给调用方决定怎么处理
  if (!clipped) return null;

  const newMask = createCanvas(mask.width, mask.height);
  ctx2d(newMask).drawImage(mask, dx, dy);

  return { mask: newMask, bounds: clipped };
}

/** 两个矩形求交，无交集返回 null */
function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}
