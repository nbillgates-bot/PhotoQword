/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeTga } from './tga';
import { halfSplit, makeImage, solid, u16LE } from './testImages';

describe('encodeTga', () => {
  it('头部声明未压缩真彩、32 位', () => {
    const bytes = encodeTga(solid(4, 3, [1, 2, 3]));
    expect(bytes[1]).toBe(0); // 无调色板
    expect(bytes[2]).toBe(2); // 未压缩真彩
    expect(u16LE(bytes, 12)).toBe(4); // 宽
    expect(u16LE(bytes, 14)).toBe(3); // 高
    expect(bytes[16]).toBe(32); // 位深
  });

  it('声明原点在左上，这样行不用倒着写', () => {
    const bytes = encodeTga(solid(2, 2, [0, 0, 0]));
    // bit5 置 1 = 第一行就是图像顶行；bit0-3 = alpha 位数
    expect(bytes[17] & 0x20).toBe(0x20);
    expect(bytes[17] & 0x0f).toBe(8);
  });

  it('通道顺序是 BGRA', () => {
    const bytes = encodeTga(makeImage(1, 1, () => [10, 20, 30, 40]));
    expect([...bytes.subarray(18, 22)]).toEqual([30, 20, 10, 40]);
  });

  it('行内从左到右', () => {
    const bytes = encodeTga(halfSplit(2, 1));
    // 左红 → BGRA 0,0,255,255；右蓝 → 255,0,0,255
    expect([...bytes.subarray(18, 22)]).toEqual([0, 0, 255, 255]);
    expect([...bytes.subarray(22, 26)]).toEqual([255, 0, 0, 255]);
  });

  it('alpha 原样保留，不做预乘', () => {
    const bytes = encodeTga(makeImage(1, 1, () => [255, 255, 255, 128]));
    expect(bytes[18]).toBe(255); // 白仍是白
    expect(bytes[21]).toBe(128);
  });

  it('字节数 = 18 字节头 + 宽×高×4', () => {
    expect(encodeTga(solid(5, 4, [0, 0, 0]))).toHaveLength(18 + 5 * 4 * 4);
  });

  it('1×1 能编码', () => {
    expect(encodeTga(solid(1, 1, [9, 9, 9]))).toHaveLength(22);
  });

  it('字节值全部合法', () => {
    const bytes = encodeTga(makeImage(4, 4, (x, y) => [x * 60, y * 60, 0, 200]));
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
