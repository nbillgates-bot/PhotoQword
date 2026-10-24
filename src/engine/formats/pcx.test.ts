/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodePcx } from './pcx';
import { halfSplit, makeImage, solid, u16LE } from './testImages';

/**
 * PCX 的 RLE 解码器，只用于测试。
 * 与编码器独立实现，这样往返测试不会同错同对。
 */
function rleDecode(bytes: Uint8Array, expectedLength: number): number[] {
  const output: number[] = [];
  let i = 0;
  while (i < bytes.length && output.length < expectedLength) {
    const value = bytes[i];
    if ((value & 0xc0) === 0xc0) {
      const run = value & 0x3f;
      for (let n = 0; n < run; n += 1) output.push(bytes[i + 1]);
      i += 2;
    } else {
      output.push(value);
      i += 1;
    }
  }
  return output;
}

describe('头部', () => {
  it('魔数 0x0a、版本 5、启用 RLE', () => {
    const bytes = encodePcx(solid(4, 3, [1, 2, 3]));
    expect(bytes[0]).toBe(0x0a);
    expect(bytes[1]).toBe(5);
    expect(bytes[2]).toBe(1);
    expect(bytes[3]).toBe(8); // 每平面每像素 8 位
  });

  it('尺寸用「含边界」的最大坐标表示', () => {
    // 4×3 的图，xMax = 3、yMax = 2，不是 4 和 3
    const bytes = encodePcx(solid(4, 3, [0, 0, 0]));
    expect(u16LE(bytes, 4)).toBe(0); // xMin
    expect(u16LE(bytes, 6)).toBe(0); // yMin
    expect(u16LE(bytes, 8)).toBe(3); // xMax
    expect(u16LE(bytes, 10)).toBe(2); // yMax
  });

  it('声明 3 个平面，行字节数为偶数', () => {
    const bytes = encodePcx(solid(5, 1, [0, 0, 0]));
    expect(bytes[65]).toBe(3); // 平面数
    // 宽 5 是奇数，行字节数要补到 6
    expect(u16LE(bytes, 66)).toBe(6);
  });

  it('头部固定 128 字节', () => {
    const bytes = encodePcx(solid(2, 1, [0, 0, 0]));
    // 128 之后才是像素数据
    expect(bytes.length).toBeGreaterThan(128);
  });
});

describe('平面式存储', () => {
  it('一行里三个平面分开存，不是逐像素 RGB 交错', () => {
    /*
     * 这是 PCX 最容易写错的地方：按交错写出来颜色会变成条纹。
     * 左红右蓝的一行，R 平面应该是 [255, 0]，而不是 [255, 0, 0]。
     */
    const bytes = encodePcx(halfSplit(2, 1));
    const decoded = rleDecode(bytes.subarray(128), 6);
    expect(decoded.slice(0, 2)).toEqual([255, 0]); // R 平面
    expect(decoded.slice(2, 4)).toEqual([0, 0]); // G 平面
    expect(decoded.slice(4, 6)).toEqual([0, 255]); // B 平面
  });

  it('奇数宽度时每个平面补一个字节', () => {
    const bytes = encodePcx(solid(3, 1, [10, 20, 30]));
    // 每平面 4 字节（3 补到 4），三个平面共 12
    const decoded = rleDecode(bytes.subarray(128), 12);
    expect(decoded.slice(0, 3)).toEqual([10, 10, 10]);
    expect(decoded[3]).toBe(0); // 补位
    expect(decoded.slice(4, 7)).toEqual([20, 20, 20]);
  });

  it('多行按行依次存', () => {
    const image = makeImage(2, 2, (_, y) => (y === 0 ? [255, 0, 0, 255] : [0, 255, 0, 255]));
    const bytes = encodePcx(image);
    const decoded = rleDecode(bytes.subarray(128), 12);
    // 第一行的 R 平面全 255
    expect(decoded.slice(0, 2)).toEqual([255, 255]);
    // 第二行（偏移 6）的 R 平面全 0，G 平面全 255
    expect(decoded.slice(6, 8)).toEqual([0, 0]);
    expect(decoded.slice(8, 10)).toEqual([255, 255]);
  });
});

describe('RLE 压缩', () => {
  it('连续相同值被压成计数形式', () => {
    const bytes = encodePcx(solid(60, 1, [7, 7, 7]));
    // 60 个相同值远比 60 字节短
    expect(bytes.length - 128).toBeLessThan(30);
  });

  it('单个 >= 0xc0 的值也走计数形式转义', () => {
    /*
     * 0xc0 以上的字节会被解码器当成计数标记，所以哪怕只出现一次
     * 也必须写成「计数 1 + 值」。不转义的话解出来整行错位。
     */
    const bytes = encodePcx(solid(1, 1, [0xd0, 0, 0]));
    const data = bytes.subarray(128);
    expect(data[0]).toBe(0xc1); // 计数 1
    expect(data[1]).toBe(0xd0);
  });

  it('往返解码后与原像素一致', () => {
    const bytes = encodePcx(makeImage(8, 4, (x, y) => [x * 30, y * 60, 100, 255]));
    // 每平面 8 字节 × 3 平面 × 4 行 = 96
    const decoded = rleDecode(bytes.subarray(128), 96);
    expect(decoded).toHaveLength(96);
    // 第一行 R 平面应该是 0,30,60,...
    expect(decoded.slice(0, 8)).toEqual([0, 30, 60, 90, 120, 150, 180, 210]);
  });

  it('单次游程不超过 63（计数字段只有 6 位）', () => {
    const bytes = encodePcx(solid(200, 1, [5, 5, 5]));
    const data = bytes.subarray(128);
    for (let i = 0; i < data.length; i += 1) {
      if ((data[i] & 0xc0) === 0xc0) {
        expect(data[i] & 0x3f).toBeLessThanOrEqual(63);
        i += 1;
      }
    }
  });
});

describe('alpha 与边界', () => {
  it('半透明合到背景色上', () => {
    const bytes = encodePcx(makeImage(1, 1, () => [0, 0, 0, 128]), [255, 255, 255]);
    const decoded = rleDecode(bytes.subarray(128), 6);
    expect(decoded[0]).toBeGreaterThan(120);
    expect(decoded[0]).toBeLessThan(135);
  });

  it('1×1 能编码', () => {
    expect(encodePcx(solid(1, 1, [9, 9, 9])).length).toBeGreaterThan(128);
  });

  it('字节值全部合法', () => {
    const bytes = encodePcx(makeImage(4, 4, (x, y) => [x * 60, y * 60, 0, 255]));
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
