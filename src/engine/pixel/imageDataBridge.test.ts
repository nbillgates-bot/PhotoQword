/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { createImageData } from '../canvasUtils';
import { createPixelBuffer, readNorm, writeNorm } from './buffer';
import { fromImageData, toImageData } from './imageDataBridge';
import type { PixelFormat } from './format';

/** 造一张带已知像素的 ImageData */
function sample(): ImageData {
  const image = createImageData(2, 1);
  // 像素 0：不透明红；像素 1：半透明中灰
  image.data.set([255, 0, 0, 255, 128, 128, 128, 128]);
  return image;
}

describe('fromImageData', () => {
  it('u8 走快路径，字节原样搬过来', () => {
    const buffer = fromImageData(sample(), 'u8');
    expect(buffer.format).toBe('u8');
    expect(buffer.channels).toBe(4);
    expect([...buffer.data]).toEqual([255, 0, 0, 255, 128, 128, 128, 128]);
  });

  it('升到 u16 / f32 后归一化数值不变', () => {
    const image = sample();
    for (const format of ['u16', 'f32'] as PixelFormat[]) {
      const buffer = fromImageData(image, format);
      expect(readNorm(buffer, 0, 0, 0)).toBeCloseTo(1, 5);
      expect(readNorm(buffer, 0, 0, 1)).toBeCloseTo(0, 5);
      expect(readNorm(buffer, 1, 0, 3)).toBeCloseTo(128 / 255, 5);
    }
  });

  it('转换结果里没有 NaN', () => {
    const buffer = fromImageData(sample(), 'f32');
    expect([...buffer.data].some((v) => Number.isNaN(v))).toBe(false);
  });
});

describe('toImageData', () => {
  it('u8 往返无损', () => {
    const image = sample();
    const back = toImageData(fromImageData(image, 'u8'));
    expect([...back.data]).toEqual([...image.data]);
  });

  it('经 u16 / f32 往返后 8 位数值仍然一致', () => {
    const image = sample();
    for (const format of ['u16', 'f32'] as PixelFormat[]) {
      const back = toImageData(fromImageData(image, format));
      expect([...back.data]).toEqual([...image.data]);
    }
  });

  it('单通道缓冲按灰度铺开，alpha 置满（蒙版就是这么显示的）', () => {
    const gray = createPixelBuffer(2, 1, 'u8', 1);
    writeNorm(gray, 0, 0, 0, 1);
    writeNorm(gray, 1, 0, 0, 0);
    const image = toImageData(gray);
    expect([...image.data]).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });

  it('尺寸为 1×1 时也成立（边界值）', () => {
    const buffer = createPixelBuffer(1, 1, 'u8', 4);
    writeNorm(buffer, 0, 0, 3, 1);
    const image = toImageData(buffer);
    expect(image.width).toBe(1);
    expect(image.height).toBe(1);
    expect(image.data[3]).toBe(255);
  });

  it('输出里不含 NaN', () => {
    const buffer = createPixelBuffer(2, 2, 'f32', 4);
    writeNorm(buffer, 0, 0, 0, 0.25);
    const image = toImageData(buffer);
    expect([...image.data].some((v) => Number.isNaN(v))).toBe(false);
  });
});
