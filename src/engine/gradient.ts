/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point } from '../types';

/**
 * 渐变引擎：支持 PS 的 5 种渐变类型。
 *
 * 每个函数返回一个距离值 t ∈ [0, 1]，用于在颜色之间插值。
 */

/** 线性渐变：沿拖拽方向的投影 */
export function linearGradient(start: Point, end: Point, point: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return 0;
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2;
  return Math.max(0, Math.min(1, t));
}

/** 径向渐变：从起点到终点的距离映射 */
export function radialGradient(start: Point, end: Point, point: Point): number {
  const radius = Math.hypot(end.x - start.x, end.y - start.y);
  if (radius === 0) return 0;
  const dist = Math.hypot(point.x - start.x, point.y - start.y);
  return Math.min(1, dist / radius);
}

/** 角度渐变：按角度从 0 到 360 度旋转一圈 */
export function angleGradient(start: Point, end: Point, point: Point): number {
  const dx = point.x - start.x;
  const dy = point.y - start.y;
  // 起始方向作为 0 度
  const refAngle = Math.atan2(end.y - start.y, end.x - start.x);
  let angle = Math.atan2(dy, dx) - refAngle;
  // 归一化到 [0, 2π)
  if (angle < 0) angle += Math.PI * 2;
  return angle / (Math.PI * 2);
}

/** 对称渐变：线性渐变的镜像版本，从中心向两侧对称 */
export function reflectedGradient(start: Point, end: Point, point: Point): number {
  const t = linearGradient(start, end, point);
  // 映射到 [0, 0.5, 0] 对称分布
  return t <= 0.5 ? t * 2 : (1 - t) * 2;
}

/** 菱形渐变：按曼哈顿距离（横纵距离较大值）映射 */
export function diamondGradient(start: Point, end: Point, point: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.max(Math.abs(dx), Math.abs(dy));
  if (dist === 0) return 0;

  const px = point.x - start.x;
  const py = point.y - start.y;
  const pdist = Math.max(Math.abs(px), Math.abs(py));
  return Math.min(1, pdist / dist);
}

/** 根据渐变类型选择计算函数 */
export function computeGradientT(
  kind: 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond',
  start: Point,
  end: Point,
  point: Point,
): number {
  switch (kind) {
    case 'linear':
      return linearGradient(start, end, point);
    case 'radial':
      return radialGradient(start, end, point);
    case 'angle':
      return angleGradient(start, end, point);
    case 'reflected':
      return reflectedGradient(start, end, point);
    case 'diamond':
      return diamondGradient(start, end, point);
  }
}
