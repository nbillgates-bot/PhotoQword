/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { KERNELS, convolve, gaussianBlur } from './filters';
import { createCanvas, createImageData, ctx2d } from './canvasUtils';

function fill(image: ImageData, rgba: [number, number, number, number]): ImageData {
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = rgba[0];
    image.data[i + 1] = rgba[1];
    image.data[i + 2] = rgba[2];
    image.data[i + 3] = rgba[3];
  }
  return image;
}

function px(image: ImageData, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

describe('convolve', () => {
  it('返回新对象，不改动入参', () => {
    const input = fill(createImageData(8, 8), [10, 20, 30, 255]);
    const output = convolve(input, KERNELS.boxBlur);
    expect(output).not.toBe(input);
    expect(px(input, 4, 4)).toEqual([10, 20, 30, 255]);
  });

  it('均值模糊对纯色图无变化，且保留 alpha', () => {
    const input = fill(createImageData(8, 8), [90, 120, 150, 200]);
    const output = convolve(input, KERNELS.boxBlur);
    expect(px(output, 4, 4)).toEqual([90, 120, 150, 200]);
  });

  it('核权重和为 0 时不会除零产出 NaN（浮雕/边缘检测）', () => {
    const input = fill(createImageData(8, 8), [128, 128, 128, 255]);
    for (const kernel of [KERNELS.edge, KERNELS.emboss]) {
      const output = convolve(input, kernel);
      expect([...output.data].some((v) => Number.isNaN(v))).toBe(false);
    }
  });

  it('锐化会拉大边缘两侧的差值', () => {
    const input = createImageData(16, 16);
    fill(input, [80, 80, 80, 255]);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 8; x < 16; x += 1) {
        const i = (y * 16 + x) * 4;
        input.data[i] = 180;
        input.data[i + 1] = 180;
        input.data[i + 2] = 180;
      }
    }
    const output = convolve(input, KERNELS.sharpen);
    const before = px(input, 8, 8)[0] - px(input, 7, 8)[0];
    const after = px(output, 8, 8)[0] - px(output, 7, 8)[0];
    expect(after).toBeGreaterThan(before);
  });
});

describe('gaussianBlur', () => {
  it('返回新画布且尺寸不变', () => {
    const source = createCanvas(24, 16);
    const context = ctx2d(source);
    context.fillStyle = '#123456';
    context.fillRect(0, 0, 24, 16);
    const output = gaussianBlur(source, 2);
    expect(output).not.toBe(source);
    expect([output.width, output.height]).toEqual([24, 16]);
  });
});
