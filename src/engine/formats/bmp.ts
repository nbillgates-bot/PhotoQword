/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * BMP 编码器（Windows 位图）。
 *
 * PS 的 BMP 存储支持 24 位不透明和 32 位带 alpha 两档，这里都给。
 * 32 位走 BITMAPV4HEADER（108 字节头 + BI_BITFIELDS），因为
 * 经典的 40 字节 BITMAPINFOHEADER 没有地方声明 alpha 通道的位置，
 * 很多读图程序会把第四个字节当填充直接丢掉。
 *
 * 关键坑：BMP 的像素行是**自下而上**存的，且每行要补齐到 4 字节。
 * 两者都错过一次就会看到画面上下翻转或者逐行斜切。
 */

/** 24 位不含 alpha；32 位含 alpha */
export type BmpDepth = 24 | 32;

const FILE_HEADER = 14;
const INFO_HEADER = 40;
const V4_HEADER = 108;

/**
 * 把 ImageData 编成 BMP 字节。
 *
 * depth=32 时保留 alpha；depth=24 时按 background 把半透明像素合到底色上
 * （BMP 24 位没有 alpha，直接丢弃会让半透明区域凭空变亮或变暗）。
 */
export function encodeBmp(
  image: ImageData,
  depth: BmpDepth = 24,
  background: [number, number, number] = [255, 255, 255],
): Bytes {
  const { width, height, data } = image;
  const bytesPerPixel = depth === 32 ? 4 : 3;
  // 每行补齐到 4 字节边界
  const rowSize = Math.ceil((width * bytesPerPixel) / 4) * 4;
  const pixelBytes = rowSize * height;
  const headerSize = depth === 32 ? V4_HEADER : INFO_HEADER;
  const offset = FILE_HEADER + headerSize;

  const writer = new ByteWriter(offset + pixelBytes);
  writeFileHeader(writer, offset + pixelBytes, offset);
  if (depth === 32) writeV4Header(writer, width, height, pixelBytes);
  else writeInfoHeader(writer, width, height, pixelBytes);
  writePixels(writer, data, width, height, rowSize, depth, background);
  return writer.toBytes();
}

function writeFileHeader(w: ByteWriter, fileSize: number, offset: number): void {
  w.ascii('BM');
  w.u32LE(fileSize);
  w.u32LE(0); // 保留字段
  w.u32LE(offset);
}

function writeInfoHeader(w: ByteWriter, width: number, height: number, pixelBytes: number): void {
  w.u32LE(INFO_HEADER);
  w.u32LE(width);
  w.u32LE(height);
  w.u16LE(1); // planes
  w.u16LE(24); // bitsPerPixel
  w.u32LE(0); // BI_RGB
  w.u32LE(pixelBytes);
  w.u32LE(2835); // 72 DPI 换成 px/m
  w.u32LE(2835);
  w.u32LE(0); // colors used
  w.u32LE(0); // colors important
}

function writeV4Header(w: ByteWriter, width: number, height: number, pixelBytes: number): void {
  w.u32LE(V4_HEADER);
  w.u32LE(width);
  w.u32LE(height);
  w.u16LE(1); // planes
  w.u16LE(32); // bitsPerPixel
  w.u32LE(3); // BI_BITFIELDS
  w.u32LE(pixelBytes);
  w.u32LE(2835);
  w.u32LE(2835);
  w.u32LE(0);
  w.u32LE(0);
  // RGBA 各通道掩码（LE 所以顺序是 ABGR）
  w.u32LE(0x00ff0000); // R
  w.u32LE(0x0000ff00); // G
  w.u32LE(0x000000ff); // B
  w.u32LE(0xff000000); // A
  w.ascii('Win '); // CSType
  w.fill(0, 36); // CIEXYZTRIPLE endpoints
  w.u32LE(0); // gamma R/G/B
  w.u32LE(0);
  w.u32LE(0);
}

function writePixels(
  w: ByteWriter,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  rowSize: number,
  depth: BmpDepth,
  bg: [number, number, number],
): void {
  const [bgR, bgG, bgB] = bg;
  // BMP 像素行从底到顶，所以倒着走
  for (let y = height - 1; y >= 0; y -= 1) {
    let written = 0;
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (depth === 32) {
        w.u8(b);
        w.u8(g);
        w.u8(r);
        w.u8(a);
        written += 4;
      } else {
        // 24 位把半透明像素合到背景上（PS 的做法）
        const alpha = a / 255;
        w.u8(Math.round(b * alpha + bgB * (1 - alpha)));
        w.u8(Math.round(g * alpha + bgG * (1 - alpha)));
        w.u8(Math.round(r * alpha + bgR * (1 - alpha)));
        written += 3;
      }
    }
    // 行尾补齐到 4 字节边界
    while (written < rowSize) {
      w.u8(0);
      written += 1;
    }
  }
}
