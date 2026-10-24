/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp } from './canvasUtils';
import type { LevelsChannelId } from './levels';

/**
 * 曲线。
 *
 * 控制点是 (输入, 输出) 对，都在 0..255。点与点之间用单调三次插值，
 * 保证曲线不会在两点之间反向弯出去——普通 Catmull-Rom 会过冲，
 * 表现为提亮暗部时高光反而先掉一截，PS 的曲线不会这样。
 *
 * 与色阶共用通道概念（rgb 复合 + 单通道），也共用"查找表 + 像素循环查表"的做法。
 */

export interface CurvePoint {
  /** 输入值 0..255 */
  x: number;
  /** 输出值 0..255 */
  y: number;
}

export type CurvesParams = Record<LevelsChannelId, CurvePoint[]>;

/** 默认是一条对角直线，两个端点 */
export function defaultCurve(): CurvePoint[] {
  return [
    { x: 0, y: 0 },
    { x: 255, y: 255 },
  ];
}

export function defaultCurves(): CurvesParams {
  return {
    rgb: defaultCurve(),
    r: defaultCurve(),
    g: defaultCurve(),
    b: defaultCurve(),
  };
}

/** 是不是没动过的对角线 */
export function isIdentityCurve(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  return (
    points[0].x === 0 && points[0].y === 0 && points[1].x === 255 && points[1].y === 255
  );
}

/** 按 x 排序并去掉重复的 x，插值要求 x 严格递增 */
export function normalizePoints(points: CurvePoint[]): CurvePoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const out: CurvePoint[] = [];
  for (const point of sorted) {
    const last = out.at(-1);
    // 同一个 x 上只保留后加入的那个，与 PS 拖点覆盖的行为一致
    if (last && last.x === point.x) out[out.length - 1] = point;
    else out.push(point);
  }
  return out;
}

/**
 * 生成 256 项查找表。
 *
 * 用 Fritsch-Carlson 单调三次插值：先算各段斜率，再把切线限制在
 * 不会产生过冲的范围内。少于两点时退化成直线。
 */
export function buildCurveLut(points: CurvePoint[]): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const p = normalizePoints(points);

  if (p.length === 0) {
    for (let i = 0; i < 256; i += 1) lut[i] = i;
    return lut;
  }
  if (p.length === 1) {
    for (let i = 0; i < 256; i += 1) lut[i] = clamp(p[0].y, 0, 255);
    return lut;
  }

  const tangents = monotoneTangents(p);

  let segment = 0;
  for (let i = 0; i < 256; i += 1) {
    // 端点之外保持水平，与 PS 一致（曲线不外推）
    if (i <= p[0].x) {
      lut[i] = clamp(p[0].y, 0, 255);
      continue;
    }
    if (i >= p[p.length - 1].x) {
      lut[i] = clamp(p[p.length - 1].y, 0, 255);
      continue;
    }
    // i 单调递增，段索引只需往前走，不必每次二分
    while (segment < p.length - 2 && i > p[segment + 1].x) segment += 1;
    lut[i] = clamp(hermite(p[segment], p[segment + 1], tangents[segment], tangents[segment + 1], i), 0, 255);
  }
  return lut;
}

/**
 * 各控制点处的切线斜率，做过单调性限制。
 * 不限制的话曲线会在陡缓交界处冲出控制点包围的范围。
 */
function monotoneTangents(p: CurvePoint[]): number[] {
  const n = p.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = p[i + 1].x - p[i].x;
    slopes.push(dx === 0 ? 0 : (p[i + 1].y - p[i].y) / dx);
  }

  const tangents: number[] = new Array(n);
  tangents[0] = slopes[0];
  tangents[n - 1] = slopes[n - 2];
  for (let i = 1; i < n - 1; i += 1) {
    const a = slopes[i - 1];
    const b = slopes[i];
    // 斜率变号处必须把切线压平，否则一定过冲
    tangents[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }

  // Fritsch-Carlson：把切线限制在 3 倍段斜率之内
  for (let i = 0; i < n - 1; i += 1) {
    const s = slopes[i];
    if (s === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i] / s;
    const beta = tangents[i + 1] / s;
    const norm = Math.hypot(alpha, beta);
    if (norm > 3) {
      const scale = 3 / norm;
      tangents[i] = scale * alpha * s;
      tangents[i + 1] = scale * beta * s;
    }
  }
  return tangents;
}

/** 一段三次 Hermite 插值 */
function hermite(p0: CurvePoint, p1: CurvePoint, m0: number, m1: number, x: number): number {
  const h = p1.x - p0.x;
  if (h === 0) return p1.y;
  const t = (x - p0.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0.y +
    (t3 - 2 * t2 + t) * h * m0 +
    (-2 * t3 + 3 * t2) * p1.y +
    (t3 - t2) * h * m1
  );
}

/** 复合通道叠在单通道之后，与色阶顺序一致 */
function combinedCurveLut(single: CurvePoint[], composite: CurvePoint[]): Uint8ClampedArray {
  const first = buildCurveLut(single);
  if (isIdentityCurve(composite)) return first;
  const second = buildCurveLut(composite);
  const merged = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) merged[i] = second[first[i]];
  return merged;
}

/** 就地应用曲线 */
export function applyCurves(image: ImageData, params: CurvesParams): void {
  const untouched =
    isIdentityCurve(params.rgb) &&
    isIdentityCurve(params.r) &&
    isIdentityCurve(params.g) &&
    isIdentityCurve(params.b);
  if (untouched) return;

  const lutR = combinedCurveLut(params.r, params.rgb);
  const lutG = combinedCurveLut(params.g, params.rgb);
  const lutB = combinedCurveLut(params.b, params.rgb);

  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    data[i] = lutR[data[i]];
    data[i + 1] = lutG[data[i + 1]];
    data[i + 2] = lutB[data[i + 2]];
  }
}
