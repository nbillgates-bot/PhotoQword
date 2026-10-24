/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 编码器测试用的图像脚手架。
 *
 * 与 tools/testKit.ts 同理：不含断言、不被应用代码引用，不会进产物。
 */
import { createCanvas, ctx2d } from '../canvasUtils';

/** 按回调逐像素填一张 ImageData。回调返回 [r,g,b,a] */
export function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number, number],
): ImageData {
  const image = ctx2d(createCanvas(width, height)).createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const i = (y * width + x) * 4;
      image.data[i] = r;
      image.data[i + 1] = g;
      image.data[i + 2] = b;
      image.data[i + 3] = a;
    }
  }
  return image;
}

/** 单色不透明图 */
export function solid(
  width: number,
  height: number,
  color: [number, number, number],
): ImageData {
  return makeImage(width, height, () => [color[0], color[1], color[2], 255]);
}

/** 左半红右半蓝，用来验证行内顺序和列方向 */
export function halfSplit(width: number, height: number): ImageData {
  return makeImage(width, height, (x) =>
    x < width / 2 ? [255, 0, 0, 255] : [0, 0, 255, 255],
  );
}

/** 上半不透明下半全透明，用来验证 alpha 与行方向 */
export function topOpaque(width: number, height: number): ImageData {
  return makeImage(width, height, (_, y) =>
    y < height / 2 ? [0, 255, 0, 255] : [0, 255, 0, 0],
  );
}

/** 从字节流里读小端 u16 / u32，断言头部字段时用 */
export function u16LE(bytes: Uint8Array, at: number): number {
  return bytes[at] | (bytes[at + 1] << 8);
}

export function u32LE(bytes: Uint8Array, at: number): number {
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + bytes[at + 3] * 0x1000000;
}
