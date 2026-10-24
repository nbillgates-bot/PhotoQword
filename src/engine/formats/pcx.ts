/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * PCX 编码器（ZSoft Paintbrush）。
 *
 * 写版本 5、24 位真彩（3 个平面 × 8 位），带 PCX 自己的 RLE 压缩。
 * PS 的 PCX 存储就是这一档。
 *
 * 两个容易写错的地方：
 * 1. **平面是分开存的**——一行里先是整行的 R，再整行的 G，再整行的 B，
 *    不是逐像素 RGB 交错。按交错写出来颜色会整体错位成条纹。
 * 2. 每个平面的行字节数（bytesPerLine）必须是**偶数**，奇数宽度要补一字节。
 *
 * PCX 不支持 alpha，半透明像素合到背景色上。
 */

const RLE_MAX_RUN = 63;

export function encodePcx(
  image: ImageData,
  background: [number, number, number] = [255, 255, 255],
): Bytes {
  const { width, height, data } = image;
  // 每平面每行的字节数，必须为偶数
  const bytesPerLine = width % 2 === 0 ? width : width + 1;
  const writer = new ByteWriter(128 + width * height * 3);

  writeHeader(writer, width, height, bytesPerLine);

  // 一行三个平面，逐行处理
  const plane = new Uint8Array(bytesPerLine);
  for (let y = 0; y < height; y += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      plane.fill(0);
      for (let x = 0; x < width; x += 1) {
        const i = (y * width + x) * 4;
        const alpha = data[i + 3] / 255;
        const value = data[i + channel] * alpha + background[channel] * (1 - alpha);
        plane[x] = Math.round(value);
      }
      writeRleLine(writer, plane);
    }
  }
  return writer.toBytes();
}

function writeHeader(w: ByteWriter, width: number, height: number, bytesPerLine: number): void {
  w.u8(0x0a); // ZSoft 魔数
  w.u8(5); // 版本 5：支持 24 位
  w.u8(1); // RLE 编码
  w.u8(8); // 每平面每像素位数
  w.u16LE(0); // xMin
  w.u16LE(0); // yMin
  w.u16LE(width - 1); // xMax（含）
  w.u16LE(height - 1); // yMax（含）
  w.u16LE(72); // 水平 DPI
  w.u16LE(72); // 垂直 DPI
  w.fill(0, 48); // EGA 调色板，真彩色时不用
  w.u8(0); // 保留
  w.u8(3); // 平面数：R/G/B
  w.u16LE(bytesPerLine);
  w.u16LE(1); // 调色板解释：彩色
  w.u16LE(width); // 屏幕尺寸
  w.u16LE(height);
  w.fill(0, 54); // 填充到 128 字节
}

/**
 * PCX 的 RLE：高两位都为 1 的字节表示「重复计数」，随后一个字节是值。
 * 所以单个字节只要 >= 0xc0 就必须也走计数形式转义，否则会被读成计数标记。
 */
function writeRleLine(w: ByteWriter, line: Uint8Array): void {
  let i = 0;
  while (i < line.length) {
    const value = line[i];
    let run = 1;
    while (i + run < line.length && line[i + run] === value && run < RLE_MAX_RUN) {
      run += 1;
    }
    if (run > 1 || value >= 0xc0) {
      w.u8(0xc0 | run);
      w.u8(value);
    } else {
      w.u8(value);
    }
    i += run;
  }
}
