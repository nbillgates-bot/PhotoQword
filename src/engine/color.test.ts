/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { cmykToRgb, hexToRgb, hsvToRgb, labToRgb, rgbToHex, rgbToHsv } from './color';

/**
 * 颜色空间转换。
 *
 * Lab 与 CMYK 是为导入色库加的：潘通那类专业色库在 .ase 里普遍存 Lab。
 * 断言只钉「结论性的关系」（哪个通道更大、是否落在 0..255），
 * 不钉具体小数 —— 换算里有白点适应和 gamma，钉死数值等于把测试绑在实现上（规约 §9）。
 */

/** 通道值必须是 0..255 的整数，且不能是 NaN（规约 §9：像素算完必须断言没有 NaN） */
function expectValidRgb(rgb: { r: number; g: number; b: number }) {
  for (const value of [rgb.r, rgb.g, rgb.b]) {
    expect(Number.isNaN(value)).toBe(false);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(255);
  }
}

describe('hex 与 RGB 往返', () => {
  it('六位 hex 往返不变', () => {
    expect(rgbToHex(hexToRgb('#3a7bd5'))).toBe('#3a7bd5');
  });

  it('三位 hex 展开成六位', () => {
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('非法 hex 退回黑色而不是 NaN', () => {
    expect(hexToRgb('#zzz')).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('HSV 往返', () => {
  it('红色往返保持', () => {
    expect(hsvToRgb(rgbToHsv({ r: 255, g: 0, b: 0 }))).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('灰色的饱和度为 0', () => {
    expect(rgbToHsv({ r: 128, g: 128, b: 128 }).s).toBe(0);
  });

  it('黑色不产生 NaN', () => {
    const hsv = rgbToHsv({ r: 0, g: 0, b: 0 });
    expect(Number.isNaN(hsv.h)).toBe(false);
    expect(Number.isNaN(hsv.s)).toBe(false);
    expectValidRgb(hsvToRgb(hsv));
  });
});

describe('cmykToRgb', () => {
  it('全 0 是白色', () => {
    expect(cmykToRgb(0, 0, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('K 为 1 是黑色', () => {
    expect(cmykToRgb(0, 0, 0, 1)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('纯青得到偏青的颜色（R 最低）', () => {
    const rgb = cmykToRgb(1, 0, 0, 0);
    expect(rgb.r).toBeLessThan(rgb.g);
    expect(rgb.r).toBeLessThan(rgb.b);
  });

  it('纯洋红得到 G 最低', () => {
    const rgb = cmykToRgb(0, 1, 0, 0);
    expect(rgb.g).toBeLessThan(rgb.r);
  });

  it('超范围输入被夹住，不产生越界值', () => {
    expectValidRgb(cmykToRgb(5, -3, 2, -1));
  });
});

describe('labToRgb', () => {
  it('L=100 a=b=0 是白色', () => {
    expect(labToRgb(100, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it('L=0 是黑色', () => {
    expect(labToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('a 为正偏红，为负偏绿', () => {
    const red = labToRgb(55, 70, 45);
    expect(red.r).toBeGreaterThan(red.g);
    const green = labToRgb(55, -60, 40);
    expect(green.g).toBeGreaterThan(green.r);
  });

  it('b 为正偏黄（蓝分量最低）', () => {
    const yellow = labToRgb(90, -5, 90);
    expect(yellow.b).toBeLessThan(yellow.r);
    expect(yellow.b).toBeLessThan(yellow.g);
  });

  it('b 为负偏蓝', () => {
    const blue = labToRgb(40, 20, -70);
    expect(blue.b).toBeGreaterThan(blue.r);
  });

  it('中性灰的三个通道接近相等', () => {
    const gray = labToRgb(50, 0, 0);
    expect(Math.abs(gray.r - gray.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(gray.g - gray.b)).toBeLessThanOrEqual(1);
  });

  it('L 越大越亮（单调）', () => {
    const dark = labToRgb(20, 0, 0);
    const mid = labToRgb(50, 0, 0);
    const light = labToRgb(80, 0, 0);
    expect(dark.r).toBeLessThan(mid.r);
    expect(mid.r).toBeLessThan(light.r);
  });

  it('超出 sRGB 色域的 Lab 被夹到边界，不越界也不是 NaN', () => {
    /*
     * 不少潘通色（荧光、金属）在 sRGB 里根本表示不出来，
     * 换算结果必须夹在 0..255，否则色块会画成黑块或整个渲染失败。
     */
    for (const [l, a, b] of [
      [100, 127, 127],
      [50, -128, -128],
      [0, 127, -128],
      [100, -128, 127],
    ]) {
      expectValidRgb(labToRgb(l, a, b));
    }
  });

  it('L 超出 0..100 被夹住', () => {
    expectValidRgb(labToRgb(500, 0, 0));
    expectValidRgb(labToRgb(-50, 0, 0));
  });
});
