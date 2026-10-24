/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Rect } from '../types';
import {
  applyMatrix,
  compose,
  invert,
  rotation,
  scaling,
  skewing,
  translation,
  type Matrix,
} from './matrix';

/**
 * 自由变换的状态。
 *
 * 拆成「轴对齐矩形 + 旋转 + 斜切」而不是直接存一个矩阵，是因为
 * 拖控制点改尺寸时需要知道未旋转的宽高才能算对——从合成矩阵里
 * 反解这些量既麻烦又会在退化情况下丢信息。
 */
export interface TransformState {
  /** 未旋转、未斜切时的外框（文档坐标） */
  rect: Rect;
  /** 旋转角，弧度，正值顺时针 */
  angle: number;
  /** 水平斜切角，弧度 */
  skewX: number;
  /** 垂直斜切角，弧度 */
  skewY: number;
}

/** 八个控制点 + 框内 + 旋转区 */
export type BoxHandle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'inside'
  | 'rotate'
  | null;

export function createTransformState(rect: Rect): TransformState {
  return { rect, angle: 0, skewX: 0, skewY: 0 };
}

/** 框的中心（文档坐标）。旋转和斜切都绕它进行，与 PS 默认的参考点一致 */
export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * 源像素 → 文档坐标的合成矩阵。
 *
 * compose 是最右先应用，所以源像素实际经过：移到以中心为原点 →
 * 缩放到目标尺寸 → 斜切 → 旋转 → 移到文档位置。斜切排在旋转之前，
 * 这样斜切角始终相对框自身的边而不是屏幕水平线，跟 PS 一致。
 *
 * source 是源画布尺寸；rect 为零宽高时缩放退化，行列式为 0，
 * 调用方拿这个结果去 invert 会得到 null。
 */
export function boxMatrix(state: TransformState, source: { width: number; height: number }): Matrix {
  const { rect, angle, skewX, skewY } = state;
  const center = centerOf(rect);
  const sx = source.width === 0 ? 0 : rect.width / source.width;
  const sy = source.height === 0 ? 0 : rect.height / source.height;

  return compose(
    translation(center.x, center.y),
    rotation(angle),
    skewing(skewX, skewY),
    scaling(sx, sy),
    translation(-source.width / 2, -source.height / 2),
  );
}

/**
 * 局部框坐标 → 文档坐标。局部坐标以框中心为原点、未旋转未斜切，
 * 范围是 ±width/2、±height/2。命中判定和控制点位置都在这套坐标里算。
 */
export function localToDoc(state: TransformState): Matrix {
  const center = centerOf(state.rect);
  return compose(
    translation(center.x, center.y),
    rotation(state.angle),
    skewing(state.skewX, state.skewY),
  );
}

/** 文档坐标 → 局部框坐标。退化时返回 null */
export function docToLocal(state: TransformState): Matrix | null {
  return invert(localToDoc(state));
}

/** 八个控制点在局部坐标下的位置 */
const LOCAL_HANDLES: Array<{ handle: Exclude<BoxHandle, 'inside' | 'rotate' | null>; hx: number; hy: number }> = [
  { handle: 'nw', hx: -0.5, hy: -0.5 },
  { handle: 'n', hx: 0, hy: -0.5 },
  { handle: 'ne', hx: 0.5, hy: -0.5 },
  { handle: 'e', hx: 0.5, hy: 0 },
  { handle: 'se', hx: 0.5, hy: 0.5 },
  { handle: 's', hx: 0, hy: 0.5 },
  { handle: 'sw', hx: -0.5, hy: 0.5 },
  { handle: 'w', hx: -0.5, hy: 0 },
];

/** 控制点在文档坐标下的位置，供命中判定和绘制共用 */
export function handlePositions(
  state: TransformState,
): Array<{ handle: Exclude<BoxHandle, 'inside' | 'rotate' | null>; point: Point }> {
  const matrix = localToDoc(state);
  const { width, height } = state.rect;
  return LOCAL_HANDLES.map(({ handle, hx, hy }) => ({
    handle,
    point: applyMatrix(matrix, { x: hx * width, y: hy * height }),
  }));
}

/** 框的四个角，按 nw→ne→se→sw 顺序，用于描边和框内判定 */
export function cornerPositions(state: TransformState): Point[] {
  const matrix = localToDoc(state);
  const { width, height } = state.rect;
  return [
    { x: -0.5, y: -0.5 },
    { x: 0.5, y: -0.5 },
    { x: 0.5, y: 0.5 },
    { x: -0.5, y: 0.5 },
  ].map((corner) => applyMatrix(matrix, { x: corner.x * width, y: corner.y * height }));
}

/** 命中控制点的容忍距离（视口像素） */
const HIT_RADIUS = 8;
/** 框外这么宽的一圈算旋转区，与 PS 把光标移到框外就能转一致 */
const ROTATE_BAND = 24;

/**
 * 判定指针落在哪里。zoom 用来把容忍半径换算回文档坐标。
 *
 * 优先级：控制点 > 框内 > 框外旋转区。四个角优先于四条边，
 * 因为角能同时改宽高，功能更强，瞄准角时不该被边抢走。
 */
export function hitTransform(state: TransformState, point: Point, zoom: number): BoxHandle {
  const tolerance = HIT_RADIUS / zoom;
  const positions = handlePositions(state);

  // 角在前、边在后，靠 LOCAL_HANDLES 的顺序保证不了，显式分两轮
  const corners = positions.filter((item) => item.handle.length === 2);
  const edges = positions.filter((item) => item.handle.length === 1);
  for (const item of [...corners, ...edges]) {
    if (Math.hypot(point.x - item.point.x, point.y - item.point.y) < tolerance) return item.handle;
  }

  const toLocal = docToLocal(state);
  if (!toLocal) return null; // 框被压成线，只剩控制点可抓

  const local = applyMatrix(toLocal, point);
  const halfWidth = Math.abs(state.rect.width) / 2;
  const halfHeight = Math.abs(state.rect.height) / 2;
  const margin = HIT_RADIUS / zoom;

  if (
    Math.abs(local.x) <= Math.max(0, halfWidth - margin) &&
    Math.abs(local.y) <= Math.max(0, halfHeight - margin)
  ) {
    return 'inside';
  }

  const band = ROTATE_BAND / zoom;
  if (Math.abs(local.x) <= halfWidth + band && Math.abs(local.y) <= halfHeight + band) {
    return 'rotate';
  }

  return null;
}
