/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BrushShape } from '../types/tools';

/**
 * 笔刷光标环的几何计算。纯函数，不碰 canvas 也不认识 store。
 *
 * 为什么不用 CSS 光标：环的大小要跟着笔刷尺寸和缩放实时变，
 * 而 CSS 光标是固定图像，且各浏览器对光标尺寸有 32px 左右的上限，
 * 大笔刷根本画不出来。所以画在覆盖层上，把系统光标藏掉。
 */

/** 环在屏幕上小于这个像素数就没有意义了，退回十字 */
const MIN_VIEWPORT_RADIUS = 2;

export interface BrushRing {
  /** 环的半径，文档坐标 */
  radius: number;
  /** 方形笔刷画方框，圆形和柔边画圆 */
  square: boolean;
}

/**
 * 算出该画多大的环。返回 null 表示画不出有意义的环，调用方应当显示十字光标。
 *
 * size 是笔刷直径（文档像素），zoom 是当前缩放。缩得很小时环会退化成一个点，
 * 那时候环反而挡住了落笔位置，PS 也是切成精确十字。
 */
export function brushRingFor(size: number, zoom: number, shape: BrushShape): BrushRing | null {
  if (!Number.isFinite(size) || !Number.isFinite(zoom)) return null;
  if (size <= 0 || zoom <= 0) return null;

  const radius = size / 2;
  // 判定用屏幕半径：同一个笔刷缩小到看不见时就不该再画环
  if (radius * zoom < MIN_VIEWPORT_RADIUS) return null;

  return { radius, square: shape === 'square' };
}
