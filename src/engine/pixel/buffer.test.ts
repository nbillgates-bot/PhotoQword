/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  clonePixelBuffer,
  createPixelBuffer,
  indexOf,
  readNorm,
  sameShape,
  writeNorm,
} from './buffer';
import { FORMAT_BYTES, FORMAT_MAX, allocPixelArray, isIntegerFormat } from './format';
import type { PixelFormat } from './format';

const FORMATS: PixelFormat[] = ['u8', 'u16', 'f32'];

describe('format', () => {
  it('满值与字节数逐格式对得上', () => {
    expect(FORMAT_MAX.u8).toBe(255);
    expect(FORMAT_MAX.u16).toBe(65535);
    expect(FORMAT_MAX.f32).toBe(1);
    expect(FORMAT_BYTES).toEqual({ u8: 1, u16: 2, f32: 4 });
  });

  it('只有 u8/u16 算整数格式', () => {
    expect(isIntegerFormat('u8')).toBe(true);
    expect(isIntegerFormat('u16')).toBe(true);
    expect(isIntegerFormat('f32')).toBe(false);
  });

  it('分配出的数组清零且长度正确', () => {
    for (const format of FORMATS) {
      const array = allocPixelArray(format, 8);
      expect(array.length).toBe(8);
      expect([...array].every((v) => v === 0)).toBe(true);
    }
  });

  it('长度非法时抛错而不是静默造出怪数组', () => {
    expect(() => allocPixelArray('u8', -1)).toThrow();
    expect(() => allocPixelArray('u8', Number.NaN)).toThrow();
  });
});

describe('createPixelBuffer', () => {
  it('长度 = 宽 × 高 × 通道数', () => {
    const rgba = createPixelBuffer(3, 2, 'u8', 4);
    expect(rgba.data.length).toBe(3 * 2 * 4);
    const gray = createPixelBuffer(3, 2, 'u16', 1);
    expect(gray.data.length).toBe(3 * 2);
  });

  it('尺寸取整且不为负', () => {
    const buffer = createPixelBuffer(-5, 2.7);
    expect(buffer.width).toBe(0);
    expect(buffer.height).toBe(2);
  });

  it('宽高为 1 的画布也成立（边界值）', () => {
    const buffer = createPixelBuffer(1, 1);
    expect(buffer.data.length).toBe(4);
    writeNorm(buffer, 0, 0, 3, 1);
    expect(readNorm(buffer, 0, 0, 3)).toBe(1);
  });
});

describe('indexOf', () => {
  it('按行优先计算下标', () => {
    const buffer = createPixelBuffer(4, 3);
    expect(indexOf(buffer, 0, 0)).toBe(0);
    expect(indexOf(buffer, 1, 0)).toBe(4);
    expect(indexOf(buffer, 0, 1)).toBe(16);
    // 末尾像素
    expect(indexOf(buffer, 3, 2)).toBe(44);
  });

  it('越界返回 -1，不做环绕', () => {
    const buffer = createPixelBuffer(2, 2);
    expect(indexOf(buffer, -1, 0)).toBe(-1);
    expect(indexOf(buffer, 0, -1)).toBe(-1);
    expect(indexOf(buffer, 2, 0)).toBe(-1);
    expect(indexOf(buffer, 0, 2)).toBe(-1);
  });
});

describe('归一化读写', () => {
  it('三种格式都能原样往返 0 / 0.5 / 1', () => {
    for (const format of FORMATS) {
      const buffer = createPixelBuffer(2, 2, format, 4);
      writeNorm(buffer, 1, 1, 0, 0);
      writeNorm(buffer, 1, 1, 1, 1);
      expect(readNorm(buffer, 1, 1, 0)).toBe(0);
      expect(readNorm(buffer, 1, 1, 1)).toBe(1);
      // 0.5 在整数格式上有量化误差，只要求接近
      writeNorm(buffer, 1, 1, 2, 0.5);
      expect(readNorm(buffer, 1, 1, 2)).toBeCloseTo(0.5, 2);
    }
  });

  it('u16 的精度确实高于 u8（这是引入高位深的意义）', () => {
    const small = 1 / 1000;
    const u8 = createPixelBuffer(1, 1, 'u8', 4);
    const u16 = createPixelBuffer(1, 1, 'u16', 4);
    writeNorm(u8, 0, 0, 0, small);
    writeNorm(u16, 0, 0, 0, small);
    const errU8 = Math.abs(readNorm(u8, 0, 0, 0) - small);
    const errU16 = Math.abs(readNorm(u16, 0, 0, 0) - small);
    expect(errU16).toBeLessThan(errU8);
  });

  it('超出 0..1 的值被夹紧，不溢出成环绕值', () => {
    const buffer = createPixelBuffer(1, 1, 'u8', 4);
    writeNorm(buffer, 0, 0, 0, 2);
    writeNorm(buffer, 0, 0, 1, -1);
    expect(readNorm(buffer, 0, 0, 0)).toBe(1);
    expect(readNorm(buffer, 0, 0, 1)).toBe(0);
  });

  it('NaN / Infinity 收敛为 0，且不留 NaN 在数组里', () => {
    for (const format of FORMATS) {
      const buffer = createPixelBuffer(1, 1, format, 4);
      writeNorm(buffer, 0, 0, 0, Number.NaN);
      writeNorm(buffer, 0, 0, 1, Number.POSITIVE_INFINITY);
      writeNorm(buffer, 0, 0, 2, Number.NEGATIVE_INFINITY);
      expect([...buffer.data].some((v) => Number.isNaN(v))).toBe(false);
      expect(readNorm(buffer, 0, 0, 0)).toBe(0);
    }
  });

  it('越界读返回 0，越界写被忽略而不是抛错', () => {
    const buffer = createPixelBuffer(1, 1, 'u8', 4);
    expect(readNorm(buffer, 5, 5, 0)).toBe(0);
    expect(() => writeNorm(buffer, 5, 5, 0, 1)).not.toThrow();
    expect([...buffer.data].every((v) => v === 0)).toBe(true);
  });

  it('访问不存在的通道不会串到相邻像素', () => {
    const gray = createPixelBuffer(2, 1, 'u8', 1);
    writeNorm(gray, 0, 0, 3, 1);
    expect(readNorm(gray, 0, 0, 3)).toBe(0);
    expect(readNorm(gray, 1, 0, 0)).toBe(0);
  });
});

describe('clonePixelBuffer', () => {
  it('内容相同但互不影响', () => {
    const source = createPixelBuffer(2, 2, 'u16', 4);
    writeNorm(source, 0, 0, 0, 1);
    const copy = clonePixelBuffer(source);
    expect(readNorm(copy, 0, 0, 0)).toBe(1);
    writeNorm(copy, 0, 0, 0, 0);
    expect(readNorm(source, 0, 0, 0)).toBe(1);
    expect(copy.data).not.toBe(source.data);
  });
});

describe('sameShape', () => {
  it('尺寸/格式/通道任一不同即为 false', () => {
    const base = createPixelBuffer(2, 2, 'u8', 4);
    expect(sameShape(base, createPixelBuffer(2, 2, 'u8', 4))).toBe(true);
    expect(sameShape(base, createPixelBuffer(3, 2, 'u8', 4))).toBe(false);
    expect(sameShape(base, createPixelBuffer(2, 3, 'u8', 4))).toBe(false);
    expect(sameShape(base, createPixelBuffer(2, 2, 'u16', 4))).toBe(false);
    expect(sameShape(base, createPixelBuffer(2, 2, 'u8', 1))).toBe(false);
  });
});
