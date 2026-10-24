/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 像素缓冲区：引擎内部的统一像素表示。
 *
 * ## 为什么不直接用 ImageData
 *
 * ImageData 恒为 8 位交错（RGBARGBA…）的 Uint8ClampedArray，浏览器不提供别的选择。
 * 但 PS 的调整、滤镜、合成都在更高精度上算：连续几步 8 位运算会累积量化误差，
 * 曲线拉一次再压回来就已经出现色阶断层（banding）。
 * 所以引擎内部改用这一层，ImageData 退化成「读画布进来、写画布出去」的边界格式。
 *
 * ## 为什么分离通道（planar 而非 interleaved）
 *
 * 1. 单通道处理时内存连续，JS 引擎更容易把循环向量化。
 * 2. 只改 alpha（蒙版、锁定透明像素）时不必碰 RGB，省掉三倍读写。
 * 3. 对齐 PS 的通道模型：通道面板里 R/G/B/Alpha 本来就是各自独立的灰度图。
 *
 * ## 取值约定（重要）
 *
 * 每种精度的满值不同，混用会得到全黑或全白：
 * - 8  位：Uint8Array，  0..255
 * - 16 位：Uint16Array， 0..65535
 * - 32 位：Float32Array，0..1（浮点，允许超出 1 用于 HDR 中间结果）
 *
 * 跨精度运算前一律先用 toUnit / fromUnit 归一到 0..1，不要手写 /255。
 */

/** 单通道的存储数组，三种精度各对应一种 TypedArray */
export type ChannelData = Uint8Array | Uint16Array | Float32Array;

/** 通道位深。32 表示 32 位浮点，不是 32 位整数 */
export type PixelDepth = 8 | 16 | 32;

/** 通道名，顺序与 ImageData 一致，便于交错/分离互转时对齐 */
export const CHANNEL_KEYS = ['r', 'g', 'b', 'a'] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];

/**
 * 像素缓冲区。四个通道各自一份数组，长度均为 width * height。
 * 像素 (x, y) 的红色分量在 r[y * width + x]。
 */
export interface PixelBuffer {
  width: number;
  height: number;
  depth: PixelDepth;
  r: ChannelData;
  g: ChannelData;
  b: ChannelData;
  a: ChannelData;
}

/** 各精度的满值（不透明/纯白对应的数值） */
export function maxValue(depth: PixelDepth): number {
  if (depth === 8) return 255;
  if (depth === 16) return 65535;
  return 1;
}

/** 把某精度的原始值归一到 0..1 */
export function toUnit(value: number, depth: PixelDepth): number {
  return depth === 32 ? value : value / maxValue(depth);
}

/**
 * 把 0..1 还原成某精度的原始值。
 * 整数精度要四舍五入，否则写进 Uint8Array 会被截断（0.9 变 0，暗一档）。
 */
export function fromUnit(unit: number, depth: PixelDepth): number {
  if (depth === 32) return unit;
  return Math.round(unit * maxValue(depth));
}

/** 按精度建一个通道数组，初值全 0（全透明黑） */
function allocChannel(length: number, depth: PixelDepth): ChannelData {
  if (depth === 8) return new Uint8Array(length);
  if (depth === 16) return new Uint16Array(length);
  return new Float32Array(length);
}

/**
 * 建一个全透明的缓冲区。
 * 宽高至少为 1，与 createCanvas 的约定一致（0 尺寸画布在部分浏览器上取不到上下文）。
 */
export function createPixelBuffer(
  width: number,
  height: number,
  depth: PixelDepth = 8,
): PixelBuffer {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const length = w * h;
  return {
    width: w,
    height: h,
    depth,
    r: allocChannel(length, depth),
    g: allocChannel(length, depth),
    b: allocChannel(length, depth),
    a: allocChannel(length, depth),
  };
}

/** 深拷贝，四个通道都复制一份新数组 */
export function clonePixelBuffer(source: PixelBuffer): PixelBuffer {
  return {
    width: source.width,
    height: source.height,
    depth: source.depth,
    r: source.r.slice(),
    g: source.g.slice(),
    b: source.b.slice(),
    a: source.a.slice(),
  };
}
