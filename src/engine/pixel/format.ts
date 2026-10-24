/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 像素格式定义：把「每通道多少位」从算法里剥出来。
 *
 * 现状是全项目直接吃 ImageData（Uint8ClampedArray），8 位写死在类型里，
 * 滤镜/调整反复叠加会累积量化误差，也没法承载 PS 的 16/32 位工作流。
 * 这里先定义容器与归一化读写，算法层改成按 0..1 进出之后就与位深无关。
 */

/** 每通道位深。u8 对应现有 ImageData，u16/f32 为后续高精度管线预留 */
export type PixelFormat = 'u8' | 'u16' | 'f32';

/** 各格式的底层数组类型 */
export type PixelArray = Uint8ClampedArray | Uint16Array | Float32Array;

/** 各格式的满值（归一化的分母）。f32 直接用 0..1，不需要缩放 */
export const FORMAT_MAX: Record<PixelFormat, number> = {
  u8: 255,
  u16: 65535,
  f32: 1,
};

/** 每通道字节数，用于估算内存占用 */
export const FORMAT_BYTES: Record<PixelFormat, number> = {
  u8: 1,
  u16: 2,
  f32: 4,
};

/** 按格式分配一段清零的通道数组 */
export function allocPixelArray(format: PixelFormat, length: number): PixelArray {
  if (length < 0 || !Number.isFinite(length)) {
    throw new Error(`非法的像素数组长度: ${length}`); // i18n-exempt: 契约性错误，调用方传错了长度
  }
  const size = Math.floor(length);
  if (format === 'u8') return new Uint8ClampedArray(size);
  if (format === 'u16') return new Uint16Array(size);
  return new Float32Array(size);
}

/** 该格式是否为整数类型。整数类型写入时要四舍五入并夹紧 */
export function isIntegerFormat(format: PixelFormat): boolean {
  return format === 'u8' || format === 'u16';
}
