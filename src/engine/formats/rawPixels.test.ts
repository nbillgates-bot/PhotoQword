/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeRawPixels } from './rawPixels';
import { halfSplit, makeImage, solid } from './testImages';

describe('encodeRawPixels', () => {
  it('就是裸 RGBA，没有头也没有魔数', () => {
    const bytes = encodeRawPixels(makeImage(1, 1, () => [10, 20, 30, 40]));
    expect([...bytes]).toEqual([10, 20, 30, 40]);
  });

  it('长度恒等于宽×高×4', () => {
    expect(encodeRawPixels(solid(5, 3, [0, 0, 0]))).toHaveLength(60);
  });

  it('顺序是逐行从上到下、行内从左到右', () => {
    const bytes = encodeRawPixels(halfSplit(2, 1));
    expect([...bytes.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...bytes.subarray(4, 8)]).toEqual([0, 0, 255, 255]);
  });

  it('返回的是副本，改动它不影响源 ImageData', () => {
    // 契约（CLAUDE.md §2.4）：这个函数返回新对象，不就地改入参
    const image = solid(2, 1, [10, 20, 30]);
    const bytes = encodeRawPixels(image);
    bytes[0] = 99;
    expect(image.data[0]).toBe(10);
  });

  it('1×1 能编码', () => {
    expect(encodeRawPixels(solid(1, 1, [1, 2, 3]))).toHaveLength(4);
  });

  it('全透明图也照原样输出，不被压掉', () => {
    const bytes = encodeRawPixels(makeImage(2, 1, () => [1, 2, 3, 0]));
    expect([...bytes]).toEqual([1, 2, 3, 0, 1, 2, 3, 0]);
  });
});
