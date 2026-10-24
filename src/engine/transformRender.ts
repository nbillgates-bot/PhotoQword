/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect } from '../types';
import { createReadbackCanvas, ctx2d } from './canvasUtils';
import { concatContextTransform, setContextTransform, IDENTITY } from './matrix';
import { boxMatrix, cornerPositions, type TransformState } from './transformBox';

/**
 * 自由变换的落像素部分：把源快照按变换矩阵画到目标画布上。
 *
 * 和 transformBox 分开：那边只算几何（框在哪、抓到哪个点），
 * 这边只碰画布。预览和确认走同一份代码，避免"预览一个样、确认另一个样"。
 */

/**
 * 变换后内容在**文档坐标系**里的整数外接矩形。
 *
 * 用它给图层画布定尺寸：PS 的图层像素是无界的，出了画布也留着，
 * 我们的画布有界，所以要主动长到装得下整块变换结果，否则确认那一刻
 * 出界的像素就被画布边界裁掉，再拖回来只剩一半。
 *
 * 取整用 floor/ceil 而不是 round：非整数坐标下抗锯齿会往外溢半个像素，
 * 往外取整才不会把边上那一行切掉；而坐标本来是整数时两者等价，
 * 不会凭空多出一圈空白。
 */
export function transformedBounds(state: TransformState): Rect {
  const corners = cornerPositions(state);
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);
  const x = Math.floor(Math.min(...xs));
  const y = Math.floor(Math.min(...ys));
  const right = Math.ceil(Math.max(...xs));
  const bottom = Math.ceil(Math.max(...ys));
  // 压成线或点时也要留一个像素，宽高为 0 的画布建不出来
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

/**
 * 把 origin 按 state 画进 target。offset 是 target 左上角在文档里的位置
 * （即图层 bounds.x/y），用来把文档坐标换算到画布坐标。
 *
 * 就地修改：清空 target 后重画。画完把矩阵复位成单位矩阵——
 * target 的 context 会被图层长期持有，留着脏矩阵会污染后续所有绘制。
 */
export function renderTransformed(
  target: HTMLCanvasElement,
  origin: HTMLCanvasElement,
  state: TransformState,
  offset: { x: number; y: number },
): void {
  ctx2d(target).clearRect(0, 0, target.width, target.height);
  drawTransformed(target, origin, state, offset);
}

/**
 * 同 renderTransformed，但**不清空** target，把结果叠加画上去。
 *
 * 选区变换要用它：每帧先画挖空选区后的背景，再把变换后的选区像素叠上去。
 * 若这一步也清画布，背景就被抹掉了，表现是变换时整层只剩被变换的那一块。
 */
export function drawTransformed(
  target: HTMLCanvasElement,
  origin: HTMLCanvasElement,
  state: TransformState,
  offset: { x: number; y: number },
): void {
  const context = ctx2d(target);
  context.save();
  // 这里必须用 concat 叠加：setTransform 会把上面这个平移冲掉
  context.translate(-offset.x, -offset.y);
  // 用矩阵而不是八参 drawImage：只有矩阵才能表达旋转和斜切
  concatContextTransform(context, boxMatrix(state, origin));
  context.drawImage(origin, 0, 0);
  context.restore();
  setContextTransform(context, IDENTITY);
}

/** 按 bounds 新建一张画布并把变换结果画上去，返回新画布（不动入参） */
export function renderTransformedTo(
  origin: HTMLCanvasElement,
  state: TransformState,
  bounds: Rect,
): HTMLCanvasElement {
  // 变换预览每次都用它顶替 layer.canvas / layer.mask，得在创建时就声明可读回
  const canvas = createReadbackCanvas(bounds.width, bounds.height);
  renderTransformed(canvas, origin, state, bounds);
  return canvas;
}
