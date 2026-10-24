/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { firstBaselineOffset } from './textWrap';
import { ctx2d } from './canvasUtils';

/**
 * PSD 文字图层的**锚点换算**：文字引擎坐标 → 文档坐标。
 *
 * PSD 把文字的位置拆成两半存：
 * - pointBase / boxBounds 在**文字引擎自己的坐标系**里，通常就是 [0,0] 附近的小数；
 * - transform 是 6 个 float64 的仿射矩阵，负责把引擎坐标搬到文档上。
 *
 * 两半必须一起用。只拿引擎坐标、改用图层 bounds（PS 栅格化出来那块像素的外接矩形）
 * 当原点，是从前的做法，代价是：
 *   居中文字的落笔点应该是**中线**，而 ink 左边被当成了落笔点，
 *   renderText 又设了 textAlign='center'，于是文字绕自己的左边居中 ——
 *   一进编辑就整体左移半个行宽。右对齐则左移一整个行宽。
 *   左对齐看着没事纯属巧合（ink 左边恰好≈落笔点），所以一直没暴露。
 *
 * 矩阵缺失时返回 null，由调用方退回 ink 原点 —— 那是唯一还能用的信息。
 */
export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/** 6 个数的数组 → Affine。长度不够或含非有限数时返回 null（宁可退回 ink 原点也不算出 NaN） */
export function toAffine(transform: number[] | undefined): Affine | null {
  if (!transform || transform.length < 6) return null;
  if (!transform.slice(0, 6).every((value) => Number.isFinite(value))) return null;
  const [a, b, c, d, tx, ty] = transform as [number, number, number, number, number, number];
  return { a, b, c, d, tx, ty };
}

/** 映射一个点：(x, y) → (a·x + c·y + tx, b·x + d·y + ty) */
export function mapPoint(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.tx, y: m.b * x + m.d * y + m.ty };
}

/**
 * 首行基线 → 行盒顶端的距离。renderText 把 data.y 当行盒顶端用，
 * 而 PSD 的锚点落在**首行基线**上，差的就是这一段。
 *
 * 量不到字体度量时 firstBaselineOffset 自己会按字号估（见那边注释），
 * 所以这里只需要保证给它一个绑好字体的 context。
 */
export function baselineToTop(cssFont: string, fontSize: number, lineHeight: number): number {
  const context = ctx2d(document.createElement('canvas'));
  context.font = cssFont;
  return firstBaselineOffset(context, fontSize, lineHeight);
}

/**
 * 点文本的落笔点，文档坐标。
 *
 * 有矩阵时走矩阵：pointBase 过一遍仿射变换就是 PS 认的锚点，它落在首行基线上，
 * 再退一个 baselineToTop 换成 renderText 要的行盒顶端。
 * 横向直接就是落笔点本身 —— 居中时它是中线，右对齐时是右边，
 * 这正是 textAlign 需要的那个点，不能再拿 ink 左边冒充。
 *
 * 没矩阵时退回旧约定（ink 原点 + 引擎坐标）：那时候拿不到别的信息，
 * 而且左对齐的老文档在这条路径上表现不变。
 */
export function pointAnchor(opts: {
  m: Affine | null;
  pointBase: number[] | undefined;
  layerLeft: number;
  layerTop: number;
  cssFont: string;
  fontSize: number;
  lineHeight: number;
}): { x: number; y: number } {
  const { m, pointBase, layerLeft, layerTop, cssFont, fontSize, lineHeight } = opts;
  const baseX = pointBase?.[0] ?? 0;
  const baseY = pointBase?.[1] ?? 0;

  if (!m) return { x: layerLeft + baseX, y: layerTop + baseY };

  const baseline = mapPoint(m, baseX, baseY);
  return { x: baseline.x, y: baseline.y - baselineToTop(cssFont, fontSize, lineHeight) };
}

/**
 * 段落文本框，文档坐标。data.x/data.y 是框的左上角（textBox.ts 的约定），
 * 所以这里不需要退基线。
 *
 * 有矩阵时把四个角都映射一遍再取外接矩形：
 * - 轴对齐的矩阵下，宽高自动带上缩放（框在引擎里 100 宽、矩阵放大 2 倍 → 200）；
 *   只减 boxBounds 的话框会小一半，居中的字跟着往左缩。
 * - 旋转矩阵下我们的模型表达不了斜框，外接矩形是能给的最接近的结果。
 *
 * 宽高保底 1 且取整：canvas.width 不接受 0 和小数。
 */
export function boxAnchor(opts: {
  m: Affine | null;
  boxBounds: number[];
  layerLeft: number;
  layerTop: number;
}): { x: number; y: number; width: number; height: number } {
  const { m, boxBounds, layerLeft, layerTop } = opts;
  const [x0, y0, x1, y1] = boxBounds as [number, number, number, number];

  if (!m) {
    return {
      x: layerLeft + Math.min(x0, x1),
      y: layerTop + Math.min(y0, y1),
      width: Math.max(1, Math.round(Math.abs(x1 - x0))),
      height: Math.max(1, Math.round(Math.abs(y1 - y0))),
    };
  }

  const corners = [
    mapPoint(m, x0, y0),
    mapPoint(m, x1, y0),
    mapPoint(m, x1, y1),
    mapPoint(m, x0, y1),
  ];
  const xs = corners.map((point) => point.x);
  const ys = corners.map((point) => point.y);

  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return {
    x: left,
    y: top,
    width: Math.max(1, Math.round(Math.max(...xs) - left)),
    height: Math.max(1, Math.round(Math.max(...ys) - top)),
  };
}
