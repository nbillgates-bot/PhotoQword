/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * PixelBuffer：与位深无关的像素容器。
 *
 * ImageData 是它的一个特例（u8 + 4 通道）。算法层统一走归一化读写
 * （readNorm/writeNorm，一律 0..1 进出），这样同一份代码在 8/16/32 位下
 * 都成立，不用为每个位深各写一遍。
 */

import { allocPixelArray, isIntegerFormat, FORMAT_MAX } from './format';
import type { PixelArray, PixelFormat } from './format';

/** 通道数。4 = RGBA，1 = 灰度（蒙版/通道用） */
export type ChannelCount = 1 | 4;

export interface PixelBuffer {
  width: number;
  height: number;
  format: PixelFormat;
  channels: ChannelCount;
  /** 长度恒为 width * height * channels */
  data: PixelArray;
}

/** 建一段全零（全透明）的缓冲 */
export function createPixelBuffer(
  width: number,
  height: number,
  format: PixelFormat = 'u8',
  channels: ChannelCount = 4,
): PixelBuffer {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  return { width: w, height: h, format, channels, data: allocPixelArray(format, w * h * channels) };
}

/** 某像素在 data 里的起始下标。越界返回 -1，由调用方决定怎么处理 */
export function indexOf(buffer: PixelBuffer, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) return -1;
  return (y * buffer.width + x) * buffer.channels;
}

/**
 * 读一个通道，返回归一化的 0..1。
 * 越界或通道不存在时返回 0（等同于透明/黑），与 canvas 采样出界的行为一致。
 */
export function readNorm(buffer: PixelBuffer, x: number, y: number, channel: number): number {
  const base = indexOf(buffer, x, y);
  if (base < 0 || channel < 0 || channel >= buffer.channels) return 0;
  return buffer.data[base + channel] / FORMAT_MAX[buffer.format];
}

/**
 * 写一个通道，入参为归一化的 0..1。
 *
 * 整数格式必须在这里夹紧并四舍五入：Uint8ClampedArray 会把 NaN 悄悄变成 0，
 * 画面只是黑一块，不报错也不崩，是最难查的一类 bug。所以 NaN 一律当 0 处理，
 * 且让它在这一层就地收敛，而不是流到后面去。
 */
export function writeNorm(
  buffer: PixelBuffer,
  x: number,
  y: number,
  channel: number,
  value: number,
): void {
  const base = indexOf(buffer, x, y);
  if (base < 0 || channel < 0 || channel >= buffer.channels) return;
  const safe = Number.isFinite(value) ? value : 0;
  const clamped = safe < 0 ? 0 : safe > 1 ? 1 : safe;
  const scaled = clamped * FORMAT_MAX[buffer.format];
  buffer.data[base + channel] = isIntegerFormat(buffer.format) ? Math.round(scaled) : scaled;
}

/** 同尺寸同格式的深拷贝 */
export function clonePixelBuffer(buffer: PixelBuffer): PixelBuffer {
  const copy = createPixelBuffer(buffer.width, buffer.height, buffer.format, buffer.channels);
  copy.data.set(buffer.data as unknown as ArrayLike<number>);
  return copy;
}

/** 两段缓冲的尺寸/格式/通道是否完全一致，逐像素运算前先校验 */
export function sameShape(a: PixelBuffer, b: PixelBuffer): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.format === b.format &&
    a.channels === b.channels
  );
}
