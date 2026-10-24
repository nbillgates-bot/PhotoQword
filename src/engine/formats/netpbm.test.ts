/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeNetpbm } from './netpbm';
import { halfSplit, makeImage, solid } from './testImages';

/** 取头部文本（到最大值那行结束），用来断言魔数和尺寸 */
function header(bytes: Uint8Array, lines: number): string {
  let seen = 0;
  let end = 0;
  while (end < bytes.length && seen < lines) {
    if (bytes[end] === 0x0a) seen += 1;
    end += 1;
  }
  return String.fromCharCode(...bytes.subarray(0, end));
}

describe('PPM（彩色）', () => {
  it('魔数 P6，头里写宽高和最大值', () => {
    const bytes = encodeNetpbm(solid(4, 3, [1, 2, 3]), 'ppm');
    expect(header(bytes, 3)).toBe('P6\n4 3\n255\n');
  });

  it('像素是 RGB 交错，逐行从上到下', () => {
    const bytes = encodeNetpbm(halfSplit(2, 1), 'ppm');
    const at = header(bytes, 3).length;
    expect([...bytes.subarray(at, at + 6)]).toEqual([255, 0, 0, 0, 0, 255]);
  });

  it('字节数 = 头 + 宽×高×3', () => {
    const bytes = encodeNetpbm(solid(3, 2, [0, 0, 0]), 'ppm');
    expect(bytes.length - header(bytes, 3).length).toBe(18);
  });
});

describe('PGM（灰度）', () => {
  it('魔数 P5，每像素一个字节', () => {
    const bytes = encodeNetpbm(solid(2, 2, [255, 255, 255]), 'pgm');
    expect(header(bytes, 3)).toBe('P5\n2 2\n255\n');
    expect(bytes.length - header(bytes, 3).length).toBe(4);
  });

  it('按 Rec.601 权重转灰度，不是简单平均', () => {
    // 纯绿的亮度权重是 0.587，简单平均会给 85
    const bytes = encodeNetpbm(solid(1, 1, [0, 255, 0]), 'pgm');
    const at = header(bytes, 3).length;
    expect(bytes[at]).toBe(150); // round(0.587 * 255)
  });
});

describe('PBM（黑白）', () => {
  it('魔数 P4，头里没有最大值那一行', () => {
    const bytes = encodeNetpbm(solid(8, 1, [0, 0, 0]), 'pbm');
    expect(header(bytes, 2)).toBe('P4\n8 1\n');
  });

  it('1 表示黑（P4 的取值是反的）', () => {
    /*
     * 这条防的是最经典的 PBM 坑：按「1 = 白」写出来整张图反相。
     * 全黑的一行 8 像素应该是 0xff，不是 0x00。
     */
    const black = encodeNetpbm(solid(8, 1, [0, 0, 0]), 'pbm');
    expect(black[black.length - 1]).toBe(0xff);

    const white = encodeNetpbm(solid(8, 1, [255, 255, 255]), 'pbm');
    expect(white[white.length - 1]).toBe(0x00);
  });

  it('每行独立按字节对齐，不满 8 位的左移补齐', () => {
    // 宽 4 的两行，每行占 1 字节（而不是两行合起来占 1 字节）
    const bytes = encodeNetpbm(solid(4, 2, [0, 0, 0]), 'pbm');
    const at = header(bytes, 2).length;
    expect(bytes.length - at).toBe(2);
    // 4 个黑像素左对齐：1111 0000
    expect(bytes[at]).toBe(0xf0);
  });

  it('按 128 阈值二值化', () => {
    // 亮度 127 以下算黑，128 以上算白
    const dark = encodeNetpbm(solid(8, 1, [100, 100, 100]), 'pbm');
    expect(dark[dark.length - 1]).toBe(0xff);
    const light = encodeNetpbm(solid(8, 1, [200, 200, 200]), 'pbm');
    expect(light[light.length - 1]).toBe(0x00);
  });
});

describe('alpha 与边界', () => {
  it('半透明像素合到背景色上，不是直接丢 alpha', () => {
    // 50% 黑合到白底应该得中灰；丢 alpha 会得纯黑
    const bytes = encodeNetpbm(
      makeImage(1, 1, () => [0, 0, 0, 128]),
      'pgm',
      [255, 255, 255],
    );
    const at = header(bytes, 3).length;
    expect(bytes[at]).toBeGreaterThan(120);
    expect(bytes[at]).toBeLessThan(135);
  });

  it('全透明变成纯背景色', () => {
    const bytes = encodeNetpbm(
      makeImage(1, 1, () => [0, 0, 0, 0]),
      'ppm',
      [255, 0, 0],
    );
    const at = header(bytes, 3).length;
    expect([...bytes.subarray(at, at + 3)]).toEqual([255, 0, 0]);
  });

  it('1×1 三种格式都能编码', () => {
    for (const kind of ['pbm', 'pgm', 'ppm'] as const) {
      expect(encodeNetpbm(solid(1, 1, [5, 5, 5]), kind).length).toBeGreaterThan(0);
    }
  });

  it('字节值全部合法', () => {
    const bytes = encodeNetpbm(makeImage(5, 5, (x, y) => [x * 50, y * 50, 0, 255]), 'ppm');
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
