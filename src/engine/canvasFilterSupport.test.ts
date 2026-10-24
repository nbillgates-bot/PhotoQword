/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { blurCanvas, blurImageData, supportsCanvasFilter } from './canvasFilterSupport';
import { createCanvas, createImageData, ctx2d } from './canvasUtils';

/** 造一张全部填成同一 RGBA 的 ImageData */
function solidImage(size: number, rgba: [number, number, number, number]): ImageData {
  const image = createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = rgba[0];
    image.data[i + 1] = rgba[1];
    image.data[i + 2] = rgba[2];
    image.data[i + 3] = rgba[3];
  }
  return image;
}

function pixelAt(image: ImageData, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
}

describe('supportsCanvasFilter', () => {
  it('返回布尔值且结果稳定（有缓存）', () => {
    const first = supportsCanvasFilter();
    expect(typeof first).toBe('boolean');
    expect(supportsCanvasFilter()).toBe(first);
  });
});

describe('blurImageData', () => {
  it('半径小于 1 时不修改数据', () => {
    const image = solidImage(4, [123, 0, 0, 255]);
    blurImageData(image, 0.2);
    expect(pixelAt(image, 0, 0)).toEqual([123, 0, 0, 255]);
  });

  it('纯色不透明区域模糊后颜色不变（不会整体变暗）', () => {
    const image = solidImage(24, [200, 60, 30, 255]);
    blurImageData(image, 4);
    expect(pixelAt(image, 12, 12)).toEqual([200, 60, 30, 255]);
  });

  it('透明背景上的白块模糊后边缘不出现黑边', () => {
    const image = createImageData(32, 32);
    for (let y = 12; y < 20; y += 1) {
      for (let x = 12; x < 20; x += 1) {
        const i = (y * 32 + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = 255;
      }
    }
    blurImageData(image, 3);
    const [r, g, b, a] = pixelAt(image, 10, 16);
    // 关键点：alpha 被摊薄了，但 RGB 必须仍是白色，否则就是没做预乘的黑边 bug
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(255);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(240);
    expect(b).toBeGreaterThan(240);
  });

  it('不透明黑底上的白块：RGB 被模糊成渐变，alpha 保持不透明', () => {
    // 用不透明底色才能验证颜色本身的混合；透明底下 RGB 会被还原成原色，看不出渐变
    const image = solidImage(16, [0, 0, 0, 255]);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const i = (y * 16 + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
      }
    }
    blurImageData(image, 3);
    const left = pixelAt(image, 6, 8);
    const mid = pixelAt(image, 8, 8);
    const right = pixelAt(image, 10, 8);
    expect(left[0]).toBeGreaterThan(mid[0]);
    expect(mid[0]).toBeGreaterThan(right[0]);
    expect(mid[3]).toBe(255);
    expect([...image.data].some((v) => Number.isNaN(v))).toBe(false);
  });

  it('透明底上的硬边缘：渐变体现在 alpha 上', () => {
    const image = createImageData(16, 16);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const i = (y * 16 + x) * 4;
        image.data[i] = 255;
        image.data[i + 1] = 255;
        image.data[i + 2] = 255;
        image.data[i + 3] = 255;
      }
    }
    blurImageData(image, 3);
    expect(pixelAt(image, 6, 8)[3]).toBeGreaterThan(pixelAt(image, 8, 8)[3]);
    expect(pixelAt(image, 8, 8)[3]).toBeGreaterThan(pixelAt(image, 10, 8)[3]);
  });
});

describe('blurCanvas', () => {
  it('返回新画布且尺寸一致，不改动原画布', () => {
    const source = createCanvas(20, 12);
    const context = ctx2d(source);
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 10, 12);

    const before = ctx2d(source).getImageData(0, 0, 20, 12).data.slice(0, 4);
    const output = blurCanvas(source, 3);

    expect(output).not.toBe(source);
    expect(output.width).toBe(20);
    expect(output.height).toBe(12);
    expect([...ctx2d(source).getImageData(0, 0, 20, 12).data.slice(0, 4)]).toEqual([...before]);
  });

  it('模糊后硬边界变成渐变（不透明底，两条路径结果都应成立）', () => {
    const source = createCanvas(32, 8);
    const context = ctx2d(source);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 32, 8);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 16, 8);

    const output = blurCanvas(source, 4);
    const data = ctx2d(output).getImageData(0, 0, 32, 8);
    expect(pixelAt(data, 12, 4)[0]).toBeGreaterThan(pixelAt(data, 16, 4)[0]);
    expect(pixelAt(data, 16, 4)[0]).toBeGreaterThan(pixelAt(data, 20, 4)[0]);
  });
});
