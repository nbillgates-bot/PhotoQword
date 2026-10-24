/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 多点触控的几何量：重心与张开度。
 *
 * 从 touchGestures.ts 里分出来，因为这两个是与「什么算手势」无关的纯几何 ——
 * 状态机管判定条件，这里只管算数，各自都能单独测。
 */

import type { Point } from '../types';

/** 一个在屏上的触点 */
export interface TouchPoint {
  /** PointerEvent.pointerId */
  id: number;
  /** 视口内坐标 */
  point: Point;
}

/** 各触点的重心。空集给 (0,0) */
export function centroid(points: TouchPoint[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  let x = 0;
  let y = 0;
  for (const item of points) {
    x += item.point.x;
    y += item.point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * 张开度：各触点到重心的平均距离。
 *
 * 双指时它恰好等于两指间距的一半，所以「新旧张开度之比」就是捏合倍率；
 * 用平均距离而不是两点间距，是为了三指及以上也能沿用同一个公式
 * ——落上第三根手指时不会因为公式换了而突然跳一下。
 *
 * 少于两指没有张开度，给 0（调用方据此跳过捏合判定）。
 */
export function spreadOf(points: TouchPoint[]): number {
  if (points.length < 2) return 0;
  const center = centroid(points);
  let total = 0;
  for (const item of points) {
    total += Math.hypot(item.point.x - center.x, item.point.y - center.y);
  }
  return total / points.length;
}
