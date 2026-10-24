/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeBmp } from './bmp';
import { halfSplit, makeImage, solid, topOpaque, u16LE, u32LE } from './testImages';

/**
 * BMP 的三个经典坑，每个都有专门的用例钉住：
 * 行是自下而上、每行补齐 4 字节、32 位要用 V4 头才能声明 alpha。
 */

describe('文件头', () => {
  it('以 BM 开头，声明的文件长度与实际字节数一致', () => {
    const bytes = encodeBmp(solid(4, 4, [10, 20, 30]), 24);
    expect(bytes[0]).toBe(0x42); // 'B'
    expect(bytes[1]).toBe(0x4d); // 'M'
    expect(u32LE(bytes, 2)).toBe(bytes.length);
  });

  it('像素起点偏移指向真正的像素区', () => {
    const bytes = encodeBmp(solid(2, 2, [1, 2, 3]), 24);
    const offset = u32LE(bytes, 10);
    // 14 字节文件头 + 40 字节信息头
    expect(offset).toBe(54);
    // 2×2 的 24 位图每行 6 字节补到 8，共 16 字节像素
    expect(bytes.length - offset).toBe(16);
  });

  it('宽高写在信息头里', () => {
    const bytes = encodeBmp(solid(7, 3, [0, 0, 0]), 24);
    expect(u32LE(bytes, 18)).toBe(7);
    expect(u32LE(bytes, 22)).toBe(3);
    expect(u16LE(bytes, 28)).toBe(24); // 位深
  });

  it('32 位走 V4 头并声明 alpha 掩码', () => {
    const bytes = encodeBmp(solid(2, 2, [0, 0, 0]), 32);
    expect(u32LE(bytes, 14)).toBe(108); // V4 头长度
    expect(u16LE(bytes, 28)).toBe(32);
    expect(u32LE(bytes, 30)).toBe(3); // BI_BITFIELDS
    // alpha 掩码必须是最高字节，否则读图程序会把 alpha 当填充丢掉
    expect(u32LE(bytes, 66)).toBe(0xff000000);
  });
});

describe('像素布局', () => {
  it('通道顺序是 BGR 而不是 RGB', () => {
    const bytes = encodeBmp(solid(1, 1, [10, 20, 30]), 24);
    const at = u32LE(bytes, 10);
    expect(bytes[at]).toBe(30); // B
    expect(bytes[at + 1]).toBe(20); // G
    expect(bytes[at + 2]).toBe(10); // R
  });

  it('行是自下而上：图像最后一行排在字节流最前面', () => {
    // 上半绿不透明、下半全透明；24 位下透明处会被合到白底
    const bytes = encodeBmp(topOpaque(2, 2), 24, [255, 255, 255]);
    const at = u32LE(bytes, 10);
    // 字节流第一行 = 图像底行 = 透明 → 合成后是白
    expect([bytes[at], bytes[at + 1], bytes[at + 2]]).toEqual([255, 255, 255]);
    // 每行 2 像素×3 字节 = 6，补齐到 8
    const second = at + 8;
    expect([bytes[second], bytes[second + 1], bytes[second + 2]]).toEqual([0, 255, 0]);
  });

  it('行内从左到右', () => {
    const bytes = encodeBmp(halfSplit(2, 1), 24);
    const at = u32LE(bytes, 10);
    // 左红：BGR = 0,0,255
    expect([bytes[at], bytes[at + 1], bytes[at + 2]]).toEqual([0, 0, 255]);
    // 右蓝：BGR = 255,0,0
    expect([bytes[at + 3], bytes[at + 4], bytes[at + 5]]).toEqual([255, 0, 0]);
  });

  it('每行补齐到 4 字节边界', () => {
    // 3 像素 × 3 字节 = 9，要补到 12
    const bytes = encodeBmp(solid(3, 2, [1, 2, 3]), 24);
    const at = u32LE(bytes, 10);
    expect(bytes.length - at).toBe(24); // 12 × 2 行
    // 补位是 0
    expect([bytes[at + 9], bytes[at + 10], bytes[at + 11]]).toEqual([0, 0, 0]);
  });

  it('宽度正好是 4 的倍数时不补位', () => {
    const bytes = encodeBmp(solid(4, 1, [1, 2, 3]), 32);
    const at = u32LE(bytes, 10);
    expect(bytes.length - at).toBe(16); // 4 像素 × 4 字节，无补位
  });
});

describe('alpha 处理', () => {
  it('32 位原样保留 alpha', () => {
    const bytes = encodeBmp(makeImage(1, 1, () => [10, 20, 30, 128]), 32);
    const at = u32LE(bytes, 10);
    expect(bytes[at + 3]).toBe(128);
  });

  it('24 位把半透明像素合到背景色上，而不是直接丢掉 alpha', () => {
    // 50% 的黑合到白底上应该得到中灰；直接丢 alpha 会得到纯黑
    const bytes = encodeBmp(makeImage(1, 1, () => [0, 0, 0, 128]), 24, [255, 255, 255]);
    const at = u32LE(bytes, 10);
    expect(bytes[at]).toBeGreaterThan(120);
    expect(bytes[at]).toBeLessThan(135);
  });

  it('全透明像素在 24 位下变成纯背景色', () => {
    const bytes = encodeBmp(makeImage(1, 1, () => [0, 255, 0, 0]), 24, [255, 0, 0]);
    const at = u32LE(bytes, 10);
    expect([bytes[at], bytes[at + 1], bytes[at + 2]]).toEqual([0, 0, 255]); // BGR 的红
  });
});

describe('边界尺寸', () => {
  it('1×1 能编码', () => {
    const bytes = encodeBmp(solid(1, 1, [5, 5, 5]), 24);
    expect(u32LE(bytes, 2)).toBe(bytes.length);
    expect(u32LE(bytes, 18)).toBe(1);
  });

  it('1 像素宽的长条不塌边', () => {
    const bytes = encodeBmp(solid(1, 8, [5, 5, 5]), 24);
    const at = u32LE(bytes, 10);
    // 每行 3 字节补到 4，共 32
    expect(bytes.length - at).toBe(32);
  });

  it('输出里不含 NaN 变成的 0 以外的异常值', () => {
    const bytes = encodeBmp(makeImage(3, 3, (x, y) => [x * 80, y * 80, 0, 200]), 32);
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
