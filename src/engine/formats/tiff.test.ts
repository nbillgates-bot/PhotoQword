/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { encodeTiff } from './tiff';
import { halfSplit, makeImage, solid, u16LE, u32LE } from './testImages';

/** 把 IFD 读成 tag -> {type, count, valueOrOffset} 的表 */
function readIfd(bytes: Uint8Array): Map<number, { type: number; count: number; raw: number }> {
  const ifdAt = u32LE(bytes, 4);
  const entryCount = u16LE(bytes, ifdAt);
  const map = new Map<number, { type: number; count: number; raw: number }>();
  for (let i = 0; i < entryCount; i += 1) {
    const at = ifdAt + 2 + i * 12;
    map.set(u16LE(bytes, at), {
      type: u16LE(bytes, at + 2),
      count: u32LE(bytes, at + 4),
      raw: u32LE(bytes, at + 8),
    });
  }
  return map;
}

describe('文件头与 IFD', () => {
  it('小端标记 II + 魔数 42', () => {
    const bytes = encodeTiff(solid(4, 4, [1, 2, 3]));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('II');
    expect(u16LE(bytes, 2)).toBe(42);
  });

  it('IFD 偏移指向 8（紧跟文件头）', () => {
    const bytes = encodeTiff(solid(2, 2, [0, 0, 0]));
    expect(u32LE(bytes, 4)).toBe(8);
  });

  it('IFD 条目按标签号升序，读图程序才能二分查找', () => {
    const bytes = encodeTiff(solid(2, 2, [0, 0, 0]));
    const ifdAt = u32LE(bytes, 4);
    const count = u16LE(bytes, ifdAt);
    const tags: number[] = [];
    for (let i = 0; i < count; i += 1) tags.push(u16LE(bytes, ifdAt + 2 + i * 12));
    expect(tags).toEqual([...tags].sort((a, b) => a - b));
  });

  it('IFD 之后的「下一个 IFD」指针为 0（只有一页）', () => {
    const bytes = encodeTiff(solid(2, 2, [0, 0, 0]));
    const ifdAt = u32LE(bytes, 4);
    const count = u16LE(bytes, ifdAt);
    expect(u32LE(bytes, ifdAt + 2 + count * 12)).toBe(0);
  });
});

describe('必需标签', () => {
  it('宽高、每通道位数、通道数都写对', () => {
    const ifd = readIfd(encodeTiff(solid(7, 5, [0, 0, 0])));
    expect(ifd.get(256)?.raw).toBe(7); // ImageWidth
    expect(ifd.get(257)?.raw).toBe(5); // ImageLength
    expect(ifd.get(277)?.raw).toBe(4); // SamplesPerPixel = RGBA
    expect(ifd.get(258)?.count).toBe(4); // BitsPerSample 有 4 个分量
  });

  it('声明不压缩、RGB 色彩空间', () => {
    const ifd = readIfd(encodeTiff(solid(2, 2, [0, 0, 0])));
    expect(ifd.get(259)?.raw).toBe(1); // Compression = none
    expect(ifd.get(262)?.raw).toBe(2); // Photometric = RGB
  });

  it('用 ExtraSamples 声明非预乘 alpha', () => {
    /*
     * 这条最关键：缺 ExtraSamples 的话大多数读图程序会把第四个通道
     * 当未知数据丢掉，透明区域会显示成黑块。
     */
    const ifd = readIfd(encodeTiff(solid(2, 2, [0, 0, 0])));
    expect(ifd.get(338)?.raw).toBe(2); // 2 = 非预乘 alpha
  });

  it('分辨率按 RATIONAL 存到溢出区，分子是 DPI', () => {
    const bytes = encodeTiff(solid(2, 2, [0, 0, 0]), 300);
    const ifd = readIfd(bytes);
    const at = ifd.get(282)!.raw; // XResolution 的偏移
    expect(u32LE(bytes, at)).toBe(300); // 分子
    expect(u32LE(bytes, at + 4)).toBe(1); // 分母
    expect(ifd.get(296)?.raw).toBe(2); // ResolutionUnit = 英寸
  });

  it('BitsPerSample 的 4 个分量都是 8，存在溢出区', () => {
    const bytes = encodeTiff(solid(2, 2, [0, 0, 0]));
    const at = readIfd(bytes).get(258)!.raw;
    expect([u16LE(bytes, at), u16LE(bytes, at + 2), u16LE(bytes, at + 4), u16LE(bytes, at + 6)])
      .toEqual([8, 8, 8, 8]);
  });
});

describe('像素数据', () => {
  it('StripOffsets 指向真正的像素起点，长度与声明一致', () => {
    const bytes = encodeTiff(solid(4, 3, [0, 0, 0]));
    const ifd = readIfd(bytes);
    const at = ifd.get(273)!.raw;
    const byteCount = ifd.get(279)!.raw;
    expect(byteCount).toBe(4 * 3 * 4);
    expect(bytes.length - at).toBe(byteCount);
  });

  it('像素是 RGBA 交错、逐行从上到下', () => {
    const bytes = encodeTiff(halfSplit(2, 1));
    const at = readIfd(bytes).get(273)!.raw;
    expect([...bytes.subarray(at, at + 4)]).toEqual([255, 0, 0, 255]);
    expect([...bytes.subarray(at + 4, at + 8)]).toEqual([0, 0, 255, 255]);
  });

  it('alpha 原样保留', () => {
    const bytes = encodeTiff(makeImage(1, 1, () => [10, 20, 30, 128]));
    const at = readIfd(bytes).get(273)!.raw;
    expect([...bytes.subarray(at, at + 4)]).toEqual([10, 20, 30, 128]);
  });

  it('RowsPerStrip 等于图高（整幅一条 strip）', () => {
    const ifd = readIfd(encodeTiff(solid(2, 6, [0, 0, 0])));
    expect(ifd.get(278)?.raw).toBe(6);
  });
});

describe('边界尺寸', () => {
  it('1×1 能编码', () => {
    const bytes = encodeTiff(solid(1, 1, [9, 9, 9]));
    const ifd = readIfd(bytes);
    expect(ifd.get(256)?.raw).toBe(1);
    expect(ifd.get(279)?.raw).toBe(4);
  });

  it('溢出区不与像素区重叠', () => {
    const bytes = encodeTiff(solid(3, 3, [0, 0, 0]));
    const ifd = readIfd(bytes);
    const pixelAt = ifd.get(273)!.raw;
    // BitsPerSample 的溢出数据（8 字节）必须整个落在像素起点之前
    const bitsAt = ifd.get(258)!.raw;
    expect(bitsAt + 8).toBeLessThanOrEqual(pixelAt);
  });

  it('字节值全部合法', () => {
    const bytes = encodeTiff(makeImage(4, 4, (x, y) => [x * 60, y * 60, 0, 255]));
    expect([...bytes].every((v) => Number.isInteger(v) && v >= 0 && v <= 255)).toBe(true);
  });
});
