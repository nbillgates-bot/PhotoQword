/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { quantize } from './gifQuantize';
import { halfSplit, makeImage, solid, topOpaque } from './testImages';

/** 从调色板里取第 index 个颜色 */
function colorAt(palette: Uint8Array, index: number): [number, number, number] {
  return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2]];
}

describe('色数与下标', () => {
  it('单色图只占一个调色板项', () => {
    const result = quantize(solid(4, 4, [10, 20, 30]));
    expect(result.colorCount).toBe(1);
    expect(colorAt(result.palette, 0)).toEqual([10, 20, 30]);
    // 所有像素都指向同一项
    expect([...result.indices].every((i) => i === 0)).toBe(true);
  });

  it('两色图分成两项，且颜色被准确保留', () => {
    const result = quantize(halfSplit(4, 2));
    expect(result.colorCount).toBe(2);
    const colors = [colorAt(result.palette, 0), colorAt(result.palette, 1)];
    expect(colors).toContainEqual([255, 0, 0]);
    expect(colors).toContainEqual([0, 0, 255]);
  });

  it('每个像素的下标指向的颜色与原色一致（两色时应无损）', () => {
    const image = halfSplit(4, 2);
    const result = quantize(image);
    for (let p = 0; p < 8; p += 1) {
      const expected: [number, number, number] = [
        image.data[p * 4],
        image.data[p * 4 + 1],
        image.data[p * 4 + 2],
      ];
      expect(colorAt(result.palette, result.indices[p])).toEqual(expected);
    }
  });

  it('颜色数超过上限时压到上限以内', () => {
    // 每个像素一个不同颜色，共 300 个，要压到 256
    const image = makeImage(300, 1, (x) => [x % 256, (x * 7) % 256, (x * 13) % 256, 255]);
    const result = quantize(image, 256);
    expect(result.colorCount).toBeLessThanOrEqual(256);
    expect([...result.indices].every((i) => i < result.colorCount)).toBe(true);
  });

  it('可以要求更少的色数', () => {
    const image = makeImage(64, 1, (x) => [x * 4, 0, 0, 255]);
    const result = quantize(image, 8);
    expect(result.colorCount).toBeLessThanOrEqual(8);
  });
});

describe('透明处理', () => {
  it('没有透明像素时不占透明槽', () => {
    const result = quantize(solid(2, 2, [1, 2, 3]));
    expect(result.transparentIndex).toBe(-1);
  });

  it('有透明像素时留出一个透明槽，透明像素都指向它', () => {
    const result = quantize(topOpaque(2, 4));
    expect(result.transparentIndex).toBeGreaterThanOrEqual(0);
    // 下半是透明的
    for (let p = 4; p < 8; p += 1) {
      expect(result.indices[p]).toBe(result.transparentIndex);
    }
    // 上半不是
    for (let p = 0; p < 4; p += 1) {
      expect(result.indices[p]).not.toBe(result.transparentIndex);
    }
  });

  it('半透明按阈值二选一，GIF 没有中间档', () => {
    // alpha 100 < 128 算透明，alpha 200 >= 128 算不透明
    const image = makeImage(2, 1, (x) => [0, 0, 0, x === 0 ? 100 : 200]);
    const result = quantize(image);
    expect(result.indices[0]).toBe(result.transparentIndex);
    expect(result.indices[1]).not.toBe(result.transparentIndex);
  });

  it('全透明的图也给出至少一个调色板项，否则 GIF 头写不出来', () => {
    const result = quantize(makeImage(2, 2, () => [0, 0, 0, 0]));
    expect(result.colorCount).toBeGreaterThanOrEqual(1);
    expect(result.transparentIndex).toBeGreaterThanOrEqual(0);
  });

  it('透明槽占掉一个名额，不透明色最多 255 种', () => {
    const image = makeImage(300, 1, (x) => [
      x % 256,
      (x * 7) % 256,
      (x * 13) % 256,
      x === 0 ? 0 : 255,
    ]);
    const result = quantize(image, 256);
    expect(result.colorCount).toBeLessThanOrEqual(256);
  });
});

describe('渐变不塌成实色', () => {
  it('灰阶渐变量化后仍保留多个层次', () => {
    /*
     * 这条防的是「取出现最多的 N 色」那种做法：渐变上每色出现次数相同，
     * 那种算法会整片塌成一两色。中位切分必须分出多个层次来。
     */
    const image = makeImage(64, 1, (x) => [x * 4, x * 4, x * 4, 255]);
    const result = quantize(image, 16);
    const used = new Set(result.indices);
    expect(used.size).toBeGreaterThan(8);
  });

  it('量化后的颜色落在原始范围内，没有溢出或 NaN', () => {
    const image = makeImage(32, 1, (x) => [x * 8, 128, 255 - x * 8, 255]);
    const result = quantize(image, 8);
    const slots = result.palette.subarray(0, result.colorCount * 3);
    expect([...slots].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});

describe('边界尺寸', () => {
  it('1×1 图', () => {
    const result = quantize(solid(1, 1, [9, 9, 9]));
    expect(result.colorCount).toBe(1);
    expect(result.indices).toHaveLength(1);
  });

  it('indices 长度恒等于像素数', () => {
    const result = quantize(solid(5, 3, [0, 0, 0]));
    expect(result.indices).toHaveLength(15);
  });
});
