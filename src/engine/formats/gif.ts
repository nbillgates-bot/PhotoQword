/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';
import { quantize } from './gifQuantize';
import { lzwEncode, toSubBlocks } from './gifLzw';

/**
 * GIF89a 编码器（单帧）。
 *
 * 只写单帧：多帧动画要有时间轴面板才有意义，而我们还没有。
 * PS 存单张图为 GIF 也就是这个结果。
 *
 * 有透明像素时写图形控制扩展声明透明色下标 —— 缺这一段的话
 * 透明区会显示成调色板里那个颜色的实色块。
 */

/** 调色板长度必须是 2 的幂，GIF 头里存的是 log2 */
function paletteBits(colorCount: number): number {
  let bits = 1;
  while (1 << bits < colorCount) bits += 1;
  // GIF 的全局颜色表最小 2 色（1 位）
  return Math.min(8, Math.max(1, bits));
}

export function encodeGif(image: ImageData): Bytes {
  const { width, height } = image;
  const { palette, indices, colorCount, transparentIndex } = quantize(image, 256);

  const bits = paletteBits(colorCount);
  const paletteSize = 1 << bits;

  const w = new ByteWriter(width * height + paletteSize * 3 + 64);

  w.ascii('GIF89a');
  // 逻辑屏幕描述符
  w.u16LE(width);
  w.u16LE(height);
  // bit7 = 有全局颜色表，bit0-2 = 表大小
  w.u8(0x80 | (bits - 1));
  w.u8(0); // 背景色下标
  w.u8(0); // 像素宽高比：不指定

  // 全局颜色表，不足的槽位补 0
  w.bytes(palette.subarray(0, Math.min(palette.length, paletteSize * 3)));
  const written = Math.min(palette.length, paletteSize * 3);
  if (written < paletteSize * 3) w.fill(0, paletteSize * 3 - written);

  if (transparentIndex >= 0) writeGraphicControl(w, transparentIndex);
  writeImageBlock(w, width, height, indices, bits);

  w.ascii(';'); // 文件终止符
  return w.toBytes();
}

/** 图形控制扩展：声明透明色下标 */
function writeGraphicControl(w: ByteWriter, transparentIndex: number): void {
  w.u8(0x21); // 扩展起始符
  w.u8(0xf9); // 图形控制标签
  w.u8(4); // 块长
  w.u8(0x01); // bit0 = 有透明色
  w.u16LE(0); // 延迟（帧间隔），单帧为 0
  w.u8(transparentIndex);
  w.u8(0); // 块终止符
}

/** 图像数据块：LZW 压缩并打包成子块 */
function writeImageBlock(
  w: ByteWriter,
  width: number,
  height: number,
  indices: Uint8Array,
  bits: number,
): void {
  w.u8(0x2c); // 图像分隔符
  w.u16LE(0); // 左偏移
  w.u16LE(0); // 上偏移
  w.u16LE(width);
  w.u16LE(height);
  w.u8(0); // 无局部颜色表、非交错
  w.u8(Math.max(2, bits)); // LZW 最小码长，GIF 规定至少 2
  const compressed = lzwEncode(indices, Math.max(2, bits));
  w.bytes(toSubBlocks(compressed));
}
