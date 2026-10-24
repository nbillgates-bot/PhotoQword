/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * Netpbm 家族：PBM（黑白）/ PGM（灰度）/ PPM（彩色）。
 * PS 的「存储为」里合称 Portable Bit Map，扩展名 .pbm/.pgm/.ppm/.pnm/.pxm。
 *
 * 一律写二进制变体（P4/P5/P6）而不是 ASCII 变体（P1/P2/P3）：
 * ASCII 版把每个通道写成十进制文本，文件大 3~4 倍，没有任何好处。
 *
 * 三种都不支持 alpha，所以半透明像素先合到背景色上，与 BMP 24 位同理。
 */

export type NetpbmKind = 'pbm' | 'pgm' | 'ppm';

/** 亮度权重用 Rec.601，与 PS 灰度模式转换一致 */
function luma(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function encodeNetpbm(
  image: ImageData,
  kind: NetpbmKind,
  background: [number, number, number] = [255, 255, 255],
): Bytes {
  const { width, height, data } = image;
  const magic = kind === 'pbm' ? 'P4' : kind === 'pgm' ? 'P5' : 'P6';
  const writer = new ByteWriter(width * height * 3 + 32);

  // 头部：魔数、宽高，灰度和彩色还要写最大值
  writer.ascii(`${magic}\n${width} ${height}\n`);
  if (kind !== 'pbm') writer.ascii('255\n');

  if (kind === 'pbm') writeBilevel(writer, data, width, height, background);
  else writeSamples(writer, data, width, height, kind, background);

  return writer.toBytes();
}

/** 把像素合到背景色上，返回不透明的 RGB */
function flatten(
  data: Uint8ClampedArray,
  i: number,
  bg: [number, number, number],
): [number, number, number] {
  const alpha = data[i + 3] / 255;
  return [
    data[i] * alpha + bg[0] * (1 - alpha),
    data[i + 1] * alpha + bg[1] * (1 - alpha),
    data[i + 2] * alpha + bg[2] * (1 - alpha),
  ];
}

/** PGM 写一个灰度字节，PPM 写三个 RGB 字节 */
function writeSamples(
  w: ByteWriter,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  kind: 'pgm' | 'ppm',
  bg: [number, number, number],
): void {
  for (let p = 0; p < width * height; p += 1) {
    const [r, g, b] = flatten(data, p * 4, bg);
    if (kind === 'pgm') {
      w.u8(Math.round(luma(r, g, b)));
    } else {
      w.u8(Math.round(r));
      w.u8(Math.round(g));
      w.u8(Math.round(b));
    }
  }
}

/**
 * PBM：每像素 1 bit，每行独立按字节对齐。
 *
 * 注意 P4 的取值是**反的**：bit 为 1 表示黑色。
 * 按「1 = 白」写出来的图会整张反相，是这个格式最经典的坑。
 */
function writeBilevel(
  w: ByteWriter,
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: [number, number, number],
): void {
  for (let y = 0; y < height; y += 1) {
    let acc = 0;
    let bits = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = flatten(data, (y * width + x) * 4, bg);
      // 128 阈值二值化，比抖动简单且可预测
      const isBlack = luma(r, g, b) < 128;
      acc = (acc << 1) | (isBlack ? 1 : 0);
      bits += 1;
      if (bits === 8) {
        w.u8(acc);
        acc = 0;
        bits = 0;
      }
    }
    // 行尾不满 8 bit 的部分左移补齐，每行必须字节对齐
    if (bits > 0) w.u8(acc << (8 - bits));
  }
}
