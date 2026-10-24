/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { normalizePoints, type CurvePoint } from './curves';

/** 曲线编辑网格的边长，同时也是色阶取值范围，1:1 省掉一层换算 */
export const CURVE_SIZE = 256;
/** 命中控制点的半径（曲线坐标下） */
export const HIT_RADIUS = 8;

/**
 * 画布坐标 → 曲线坐标。
 * y 轴要翻转：画布向下为正，而色阶向上为亮。
 */
export function toCurvePoint(x: number, y: number): CurvePoint {
  const clamp = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return { x: clamp(x), y: clamp(255 - y) };
}

/** 返回命中的控制点下标，没命中返回 -1 */
export function hitPoint(points: CurvePoint[], target: CurvePoint): number {
  for (let i = 0; i < points.length; i += 1) {
    if (Math.hypot(points[i].x - target.x, points[i].y - target.y) <= HIT_RADIUS) return i;
  }
  return -1;
}

/** 加一个控制点，返回排好序的点集和新点所在的下标 */
export function addControlPoint(
  points: CurvePoint[],
  target: CurvePoint,
): { points: CurvePoint[]; index: number } {
  const next = normalizePoints([...points.filter((p) => p.x !== target.x), target]);
  return { points: next, index: next.indexOf(target) };
}

/**
 * 把第 index 个控制点移到 target，返回新点集和它移动后的下标。
 *
 * 三条约束，都是为了让拖拽随时可逆：
 * - 首尾两点锁 x，只能上下拖。PS 的端点也不能横向拖出定义域。
 * - 中间点的 x 夹在 1..254，不许压到端点身上。否则它会把端点顶掉、
 *   自己变成新端点，x 从此锁死，这一次拖拽就再也拖不回来。
 * - 被拖的点永远保留，同 x 的其他中间点让位。否则拖过头会把自己
 *   去重掉，下标变成 -1，拖拽同样失灵。
 */
export function moveControlPoint(
  points: CurvePoint[],
  index: number,
  target: CurvePoint,
): { points: CurvePoint[]; index: number } {
  if (index < 0 || index >= points.length) return { points, index: -1 };

  const isEnd = index === 0 || index === points.length - 1;
  const moved: CurvePoint = isEnd
    ? { x: points[index].x, y: target.y }
    : { x: Math.min(254, Math.max(1, target.x)), y: target.y };

  const rest = points.filter((point, i) => i !== index && point.x !== moved.x);
  const next = normalizePoints([...rest, moved]);
  return { points: next, index: next.indexOf(moved) };
}

/** 删掉第 index 个控制点。首尾两点必须留着，否则曲线没有定义域 */
export function removeControlPoint(points: CurvePoint[], index: number): CurvePoint[] {
  if (index <= 0 || index >= points.length - 1) return points;
  return points.filter((_, i) => i !== index);
}
