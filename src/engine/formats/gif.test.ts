/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeGif } from './gif';
import { halfSplit, makeImage, solid, topOpaque, u16LE } from './testImages';

/**
 * GIF 文件结构的断言。
 *
 * 逐字节比对整个文件没有意义（LZW 的输出随实现细节变），所以这里断言的是
 * **结构契约**：魔数、逻辑屏幕描述符里的宽高、颜色表大小声明与实际长度一致、
 * 有透明像素时必须出现图形控制扩展、文件以 0x3b 收尾。
 */

/** 从头部读全局颜色表的色数 */
function paletteSize(bytes: Uint8Array): number {
  return 1 << ((bytes[10] & 0x07) + 1);
}

/** 全局颜色表之后的第一个字节偏移 */
function afterPalette(bytes: Uint8Array): number {
  return 13 + paletteSize(bytes) * 3;
}

describe('文件结构', () => {
  it('以 GIF89a 开头', () => {
    const bytes = encodeGif(solid(2, 2, [1, 2, 3]));
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
  });

  it('逻辑屏幕尺寸等于图像尺寸', () => {
    const bytes = encodeGif(solid(7, 5, [0, 0, 0]));
    expect(u16LE(bytes, 6)).toBe(7);
    expect(u16LE(bytes, 8)).toBe(5);
  });

  it('声明有全局颜色表', () => {
    const bytes = encodeGif(solid(2, 2, [0, 0, 0]));
    expect(bytes[10] & 0x80).toBe(0x80);
  });

  it('全局颜色表长度与头里声明的一致', () => {
    const bytes = encodeGif(halfSplit(4, 2));
    // 两色 → 声明 2 色（1 位），表占 6 字节
    expect(paletteSize(bytes)).toBeGreaterThanOrEqual(2);
    // 表之后必须还有内容（图像块），不能刚好读完
    expect(bytes.length).toBeGreaterThan(afterPalette(bytes));
  });

  it('以 0x3b 收尾', () => {
    const bytes = encodeGif(solid(3, 3, [5, 5, 5]));
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });
});

describe('透明声明', () => {
  it('有透明像素时写图形控制扩展', () => {
    const bytes = encodeGif(topOpaque(2, 4));
    const at = afterPalette(bytes);
    // 0x21 0xf9 是图形控制扩展的引子
    expect(bytes[at]).toBe(0x21);
    expect(bytes[at + 1]).toBe(0xf9);
    // 第 4 个字节的 bit0 置 1 表示启用透明色
    expect(bytes[at + 3] & 0x01).toBe(0x01);
  });

  it('没有透明像素时不写图形控制扩展，直接是图像块', () => {
    const bytes = encodeGif(solid(2, 2, [1, 2, 3]));
    const at = afterPalette(bytes);
    // 0x2c 是图像分隔符
    expect(bytes[at]).toBe(0x2c);
  });

  it('图像块声明的尺寸与图像一致', () => {
    const bytes = encodeGif(solid(6, 4, [0, 0, 0]));
    const at = afterPalette(bytes);
    expect(bytes[at]).toBe(0x2c);
    expect(u16LE(bytes, at + 5)).toBe(6); // 宽
    expect(u16LE(bytes, at + 7)).toBe(4); // 高
  });

  it('LZW 最小码长至少为 2（GIF 规范要求）', () => {
    // 单色图只需 1 位，但规范规定最小码长不得小于 2
    const bytes = encodeGif(solid(2, 2, [0, 0, 0]));
    const at = afterPalette(bytes);
    // 图像块布局：分隔符(1) 左(2) 上(2) 宽(2) 高(2) 标志(1) 最小码长(1)
    expect(bytes[at + 9]).toBe(0); // 标志：无局部颜色表、非交错
    expect(bytes[at + 10]).toBeGreaterThanOrEqual(2);
  });
});

describe('边界尺寸', () => {
  it('1×1 能编码', () => {
    const bytes = encodeGif(solid(1, 1, [7, 8, 9]));
    expect(u16LE(bytes, 6)).toBe(1);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it('全透明图能编码且不崩', () => {
    const bytes = encodeGif(makeImage(3, 3, () => [0, 0, 0, 0]));
    expect(String.fromCharCode(...bytes.subarray(0, 6))).toBe('GIF89a');
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it('256 色以上的图能编码', () => {
    const bytes = encodeGif(makeImage(40, 40, (x, y) => [x * 6, y * 6, (x + y) * 3, 255]));
    expect(paletteSize(bytes)).toBeLessThanOrEqual(256);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
  });

  it('字节值全部落在 0-255，没有 NaN 变成的异常', () => {
    const bytes = encodeGif(makeImage(8, 8, (x, y) => [x * 30, y * 30, 0, 255]));
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
