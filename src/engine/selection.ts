/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Rect, Selection } from '../types';
import type { SelectionMode, WandSampleSize } from '../types/tools';
import { createReadbackCanvas, ctx2d } from './canvasUtils';
import { blurImageData, supportsCanvasFilter } from './canvasFilterSupport';

/** 计算蒙版中非零像素的外接矩形；无选中像素时返回全 0 */
export function maskBounds(mask: HTMLCanvasElement): Rect {
  const { width, height } = mask;
  const data = ctx2d(mask).getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 选区边缘的公共参数，对应 PS 选项栏上的「羽化」和「消除锯齿」。
 *
 * 两者是独立的：羽化是把边缘按半径糊开，消除锯齿只管边缘那一圈
 * 要不要保留半透明过渡。PS 里可以同时开，羽化的效果会盖过锯齿。
 */
export interface SelectionEdgeOptions {
  /** 羽化半径，文档像素 */
  feather?: number;
  /** 消除锯齿，默认开。关掉得到 PS 那种硬锯齿边 */
  antiAlias?: boolean;
}

/**
 * 关掉消除锯齿：把蒙版边缘的半透明像素二值化。
 *
 * canvas 的 fill 永远是抗锯齿的，没有开关可以关，所以只能画完之后再硬化——
 * alpha ≥ 128 算选中，其余丢弃。这与 PS「消除锯齿」取消勾选时的结果一致。
 */
function hardenMask(image: ImageData): void {
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] >= 128 ? 255 : 0;
  }
}

/** 由绘制回调生成蒙版并组装为 Selection */
export function buildSelection(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D) => void,
  edge: SelectionEdgeOptions = {},
): Selection | null {
  const feather = edge.feather ?? 0;
  const antiAlias = edge.antiAlias ?? true;
  // 选区蒙版天生是反复读的：这里就要 getImageData 做羽化/硬化，之后
  // maskBounds、maskStrength、maskToAlpha 每一笔描边都会再读一遍
  const mask = createReadbackCanvas(width, height);
  const context = ctx2d(mask);
  context.fillStyle = '#ffffff';
  /*
   * 只有「羽化 + 消除锯齿开着」才走原生 filter：这条路是在绘制时一次成型的，
   * 插不进硬化那一步。要硬化就必须落到 ImageData 上自己算。
   */
  const native = feather > 0 && antiAlias && supportsCanvasFilter();
  if (native) context.filter = `blur(${feather}px)`;
  draw(context);
  if (native) context.filter = 'none';
  if (!native && (feather > 0 || !antiAlias)) {
    const image = context.getImageData(0, 0, width, height);
    // 顺序不能反：先羽化再硬化的话，羽化出来的过渡带会被二值化掉，等于没羽化
    if (!antiAlias) hardenMask(image);
    if (feather > 0) blurImageData(image, feather);
    context.putImageData(image, 0, 0);
  }
  const bounds = maskBounds(mask);
  if (bounds.width === 0 || bounds.height === 0) return null;
  return { mask, bounds };
}

/**
 * 矩形选区。
 *
 * 矩形边界天然落在整像素上，不存在斜边，所以消除锯齿开不开都一样——
 * PS 也正是因此把矩形选框的「消除锯齿」勾选框置灰。
 */
export function rectSelection(
  width: number,
  height: number,
  rect: Rect,
  edge: SelectionEdgeOptions = {},
): Selection | null {
  return buildSelection(
    width,
    height,
    (c) => c.fillRect(rect.x, rect.y, rect.width, rect.height),
    edge,
  );
}

/** 椭圆选区 */
export function ellipseSelection(
  width: number,
  height: number,
  rect: Rect,
  edge: SelectionEdgeOptions = {},
): Selection | null {
  return buildSelection(
    width,
    height,
    (c) => {
      c.beginPath();
      c.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        Math.abs(rect.width / 2),
        Math.abs(rect.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      c.fill();
    },
    edge,
  );
}

/** 套索（多边形）选区 */
export function lassoSelection(
  width: number,
  height: number,
  points: Point[],
  edge: SelectionEdgeOptions = {},
): Selection | null {
  if (points.length < 3) return null;
  return buildSelection(
    width,
    height,
    (c) => {
      c.beginPath();
      c.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) c.lineTo(points[i].x, points[i].y);
      c.closePath();
      c.fill();
    },
    edge,
  );
}

/** 按运算方式合并新旧选区 */
export function combineSelection(
  previous: Selection | null,
  next: Selection | null,
  mode: SelectionMode,
): Selection | null {
  if (mode === 'new' || !previous) return next;
  if (!next) return previous;
  // 合并结果又是一张选区蒙版，和 buildSelection 那张一样会被反复读
  const merged = createReadbackCanvas(previous.mask.width, previous.mask.height);
  const context = ctx2d(merged);
  context.drawImage(previous.mask, 0, 0);
  const op: GlobalCompositeOperation =
    mode === 'add' ? 'source-over' : mode === 'subtract' ? 'destination-out' : 'source-in';
  context.globalCompositeOperation = op;
  context.drawImage(next.mask, 0, 0);
  const bounds = maskBounds(merged);
  if (bounds.width === 0 || bounds.height === 0) return null;
  return { mask: merged, bounds };
}

/** 全选 */
export function selectAll(width: number, height: number): Selection | null {
  return rectSelection(width, height, { x: 0, y: 0, width, height });
}

/** 反选 */
export function invertSelection(selection: Selection): Selection | null {
  const { width, height } = selection.mask;
  const inverted = createReadbackCanvas(width, height);
  const context = ctx2d(inverted);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(selection.mask, 0, 0);
  const bounds = maskBounds(inverted);
  if (bounds.width === 0 || bounds.height === 0) return null;
  return { mask: inverted, bounds };
}

/** 魔棒参数，对应 PS 选项栏上的容差、取样大小、连续、消除锯齿 */
export interface WandOptions {
  /** 容差 0–100 */
  tolerance: number;
  /**
   * 取样大小。1 = 取样点（只比对单像素），其余值是方形区域边长。
   * PS 列的是 取样点 | 3x3 | 5x5 | 11x11 | 31x31 | 51x51 | 101x101。
   * 大尺寸能对抗噪点，小尺寸能精细贴合边缘。
   */
  sampleSize?: WandSampleSize;
  /** 只选相连的一片，关掉则全图同色都选 */
  contiguous: boolean;
  /** 消除锯齿，默认开 */
  antiAlias?: boolean;
}

/**
 * 魔棒的消除锯齿：把硬边软化成一圈部分覆盖，但不让选区长大。
 *
 * 洪水填充是逐像素判定的，出来的蒙版只有 0 和 255 两个值，边缘是硬锯齿。
 * 直接对它做模糊会把 alpha 渗到原本没选中的像素上，选区凭空胀一圈——
 * PS 的消除锯齿不会改变选区覆盖的范围，只会给边界像素一个部分覆盖度。
 * 所以模糊之后再和原始蒙版取较小值：内部仍是 255，外部仍是 0，
 * 只有原本就选中的那一圈边界像素拿到中间值。
 */
function softenMaskEdge(image: ImageData): void {
  const original = new Uint8ClampedArray(image.data);
  blurImageData(image, 1);
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > original[i]) data[i] = original[i];
  }
}

/**
 * 从点附近的方形区域取颜色平均。
 * sampleSize 是边长，1 表示只取单点，3 表示 3×3 区域，以此类推。
 * PS 的做法是取值时就算好平均，和容差比的是平均之后的值。
 */
function sampleAverage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  size: number,
): [number, number, number, number] {
  if (size === 1) {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  }
  const half = Math.floor(size / 2);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  let count = 0;
  for (let dy = -half; dy <= half; dy += 1) {
    const sy = y + dy;
    if (sy < 0 || sy >= height) continue;
    for (let dx = -half; dx <= half; dx += 1) {
      const sx = x + dx;
      if (sx < 0 || sx >= width) continue;
      const i = (sy * width + sx) * 4;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      a += data[i + 3];
      count += 1;
    }
  }
  if (count === 0) return [0, 0, 0, 0];
  return [r / count, g / count, b / count, a / count];
}

/**
 * 魔棒：从起点按颜色容差做洪水填充（或全图同色匹配）生成选区。
 */
export function wandSelection(
  source: HTMLCanvasElement,
  start: Point,
  { tolerance, sampleSize = 1, contiguous, antiAlias = true }: WandOptions,
): Selection | null {
  const { width, height } = source;
  const sx = Math.floor(start.x);
  const sy = Math.floor(start.y);
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;

  const src = ctx2d(source).getImageData(0, 0, width, height).data;
  const target = sampleAverage(src, width, height, sx, sy, sampleSize);
  const limit = (tolerance / 100) * 255 * 2;

  const mask = createReadbackCanvas(width, height);
  const maskCtx = ctx2d(mask);
  const out = maskCtx.createImageData(width, height);

  const matches = (index: number): boolean => {
    const d =
      Math.abs(src[index] - target[0]) +
      Math.abs(src[index + 1] - target[1]) +
      Math.abs(src[index + 2] - target[2]) +
      Math.abs(src[index + 3] - target[3]);
    return d <= limit;
  };

  const paint = (pixel: number) => {
    out.data[pixel] = 255;
    out.data[pixel + 1] = 255;
    out.data[pixel + 2] = 255;
    out.data[pixel + 3] = 255;
  };

  if (!contiguous) {
    for (let i = 0; i < src.length; i += 4) if (matches(i)) paint(i);
  } else {
    floodFill(width, height, sx, sy, matches, paint);
  }

  if (antiAlias) softenMaskEdge(out);
  maskCtx.putImageData(out, 0, 0);
  const bounds = maskBounds(mask);
  if (bounds.width === 0 || bounds.height === 0) return null;
  return { mask, bounds };
}

/**
 * 四邻域扫描线洪水填充。用显式栈避免递归爆栈，
 * 供魔棒与油漆桶共用。
 */
export function floodFill(
  width: number,
  height: number,
  startX: number,
  startY: number,
  matches: (pixelIndex: number) => boolean,
  paint: (pixelIndex: number) => void,
): void {
  const visited = new Uint8Array(width * height);
  const stack: number[] = [startX, startY];
  while (stack.length > 0) {
    const y = stack.pop() as number;
    const x = stack.pop() as number;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const flat = y * width + x;
    if (visited[flat]) continue;
    const pixel = flat * 4;
    if (!matches(pixel)) continue;
    visited[flat] = 1;
    paint(pixel);
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

/** 把选区蒙版作为裁剪应用到目标上下文（后续绘制只作用于选区内） */
export function clipToSelection(
  context: CanvasRenderingContext2D,
  selection: Selection | null,
): void {
  if (!selection) return;
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(selection.mask, 0, 0);
}
