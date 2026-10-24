/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point } from '../types';

/**
 * 2D 仿射矩阵，字段顺序与 canvas 的 setTransform(a,b,c,d,e,f) 一致：
 *
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * 用这套表示法而不是自己发明一套，是为了能直接喂给 setTransform，
 * 中间不用转换，也少一处出错的地方。
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** 平移 */
export function translation(tx: number, ty: number): Matrix {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

/** 缩放 */
export function scaling(sx: number, sy: number): Matrix {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
}

/** 旋转，角度用弧度，正值为顺时针（画布 y 轴向下，所以视觉上是顺时针） */
export function rotation(radians: number): Matrix {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/**
 * 斜切，参数是角度（弧度）。
 * kx 让竖边往右倾，ky 让横边往下倾，与 PS 的斜切方向一致。
 */
export function skewing(kx: number, ky: number): Matrix {
  return { a: 1, b: Math.tan(ky), c: Math.tan(kx), d: 1, e: 0, f: 0 };
}

/**
 * 矩阵相乘，语义是「先应用 second，再应用 first」。
 * 即 multiply(A, B) 作用在点上等价于 A(B(p))，与数学记号 A·B 一致。
 */
export function multiply(first: Matrix, second: Matrix): Matrix {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f,
  };
}

/**
 * 连乘，采用数学记号的顺序：compose(A, B, C) 等价于 A·B·C，
 * 作用在点上是 A(B(C(p)))，也就是**最右边的先应用**。
 *
 * 这样写出来的调用链能照着「源像素经过哪些步骤到达屏幕」倒着读，
 * 与 canvas 自身 translate/rotate 的叠加顺序也一致。
 */
export function compose(...steps: Matrix[]): Matrix {
  return steps.reduce((acc, step) => multiply(acc, step), IDENTITY);
}

/** 把点从局部坐标映到目标坐标 */
export function applyMatrix(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

/** 行列式，等于变换带来的面积缩放倍数 */
export function determinant(matrix: Matrix): number {
  return matrix.a * matrix.d - matrix.b * matrix.c;
}

/**
 * 逆矩阵。行列式为 0（矩形被压成一条线）时返回 null，
 * 调用方必须处理——这种状态下没法把指针位置反算回局部坐标。
 */
export function invert(matrix: Matrix): Matrix | null {
  const det = determinant(matrix);
  if (det === 0 || !Number.isFinite(det)) return null;
  const { a, b, c, d, e, f } = matrix;
  return {
    a: d / det,
    b: -b / det,
    c: -c / det,
    d: a / det,
    e: (c * f - d * e) / det,
    f: (b * e - a * f) / det,
  };
}

/** 把矩阵套到 canvas 上下文上（替换掉原有变换） */
export function setContextTransform(context: CanvasRenderingContext2D, matrix: Matrix): void {
  context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
}

/**
 * 把矩阵叠加到上下文已有的变换之上（不替换）。
 * 需要先平移再套变换矩阵时用这个 —— setContextTransform 会把平移冲掉。
 */
export function concatContextTransform(context: CanvasRenderingContext2D, matrix: Matrix): void {
  context.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
}
