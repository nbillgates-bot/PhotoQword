/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * Targa（TGA）编码器。
 *
 * 写 32 位未压缩 BGRA。PS 的 TGA 存储对话框有 16/24/32 位三档，
 * 32 位是唯一保留 alpha 的一档，也是这个格式今天还有人用的理由。
 *
 * 用「上下不翻转」的写法：TGA 头里第 17 字节的 bit5 是原点标志，
 * 置 1 表示第一行就是图像顶行。不置的话得像 BMP 那样倒着写行，
 * 两种写法都合法，这里选显式声明，少一处容易写错的循环。
 */

const UNCOMPRESSED_TRUECOLOR = 2;

export function encodeTga(image: ImageData): Bytes {
  const { width, height, data } = image;
  const writer = new ByteWriter(18 + width * height * 4);

  writer.u8(0); // 图像标识长度
  writer.u8(0); // 无调色板
  writer.u8(UNCOMPRESSED_TRUECOLOR);
  writer.fill(0, 5); // 调色板说明（无调色板时全 0）
  writer.u16LE(0); // 原点 x
  writer.u16LE(0); // 原点 y
  writer.u16LE(width);
  writer.u16LE(height);
  writer.u8(32); // 每像素位数
  // bit0-3 = alpha 位数(8)，bit5 = 原点在左上
  writer.u8(8 | 0x20);

  for (let i = 0; i < data.length; i += 4) {
    writer.u8(data[i + 2]); // B
    writer.u8(data[i + 1]); // G
    writer.u8(data[i]); // R
    writer.u8(data[i + 3]); // A
  }
  return writer.toBytes();
}
