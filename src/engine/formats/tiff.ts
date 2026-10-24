/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ByteWriter, type Bytes } from './byteWriter';

/**
 * 基线 TIFF 编码器，小端（II）、不压缩、RGBA 8 位。
 *
 * 不做 LZW / Deflate 压缩：LZW 要再写一套编码器，而 TIFF 的典型用途
 * 恰恰是「交给别的软件继续处理，不要有任何损失和额外解码成本」。
 * 文件更大是这个格式本来的取舍，PS 的 TIFF 选项里也允许不压缩。
 *
 * alpha 靠 ExtraSamples=2（非预乘 alpha）声明。缺这个标签的话
 * 大多数读图程序会把第四个通道当未知数据丢掉，透明区变成黑块。
 */

/** IFD 条目的字段类型 */
const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;

/** 用到的 TIFF 标签号 */
const TAG = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  xResolution: 282,
  yResolution: 283,
  resolutionUnit: 296,
  extraSamples: 338,
} as const;

/** 一条 IFD 记录。value 超过 4 字节时要另找地方存，由 layout 统一安排 */
interface Entry {
  tag: number;
  type: number;
  count: number;
  /** 直接放得下的值，或者外部数据（由 writer 决定落点） */
  value: number | number[];
}

/** 该类型单个分量占几字节 */
function typeSize(type: number): number {
  if (type === SHORT) return 2;
  if (type === LONG) return 4;
  if (type === RATIONAL) return 8;
  return 1;
}

export function encodeTiff(image: ImageData, dpi = 72): Bytes {
  const { width, height, data } = image;
  const pixelBytes = width * height * 4;

  const entries: Entry[] = [
    { tag: TAG.imageWidth, type: LONG, count: 1, value: width },
    { tag: TAG.imageLength, type: LONG, count: 1, value: height },
    { tag: TAG.bitsPerSample, type: SHORT, count: 4, value: [8, 8, 8, 8] },
    { tag: TAG.compression, type: SHORT, count: 1, value: 1 }, // 不压缩
    { tag: TAG.photometric, type: SHORT, count: 1, value: 2 }, // RGB
    // stripOffsets 的真实值要等布局算完才知道，先占位
    { tag: TAG.stripOffsets, type: LONG, count: 1, value: 0 },
    { tag: TAG.samplesPerPixel, type: SHORT, count: 1, value: 4 },
    { tag: TAG.rowsPerStrip, type: LONG, count: 1, value: height },
    { tag: TAG.stripByteCounts, type: LONG, count: 1, value: pixelBytes },
    { tag: TAG.xResolution, type: RATIONAL, count: 1, value: [dpi, 1] },
    { tag: TAG.yResolution, type: RATIONAL, count: 1, value: [dpi, 1] },
    { tag: TAG.resolutionUnit, type: SHORT, count: 1, value: 2 }, // 英寸
    { tag: TAG.extraSamples, type: SHORT, count: 1, value: 2 }, // 非预乘 alpha
  ];
  // TIFF 要求 IFD 条目按标签号升序，读图程序可以二分查找
  entries.sort((a, b) => a.tag - b.tag);

  /*
   * 布局：头(8) + IFD条目数(2) + 条目(12×n) + 下个IFD偏移(4) + 溢出区 + 像素。
   * 放不进 4 字节的值（如 4 个 SHORT 的 bitsPerSample、RATIONAL）存到溢出区。
   */
  const ifdStart = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let overflow = ifdStart + ifdSize;
  const overflowAt = new Map<number, number>();
  for (const entry of entries) {
    const bytes = typeSize(entry.type) * entry.count;
    if (bytes > 4) {
      overflowAt.set(entry.tag, overflow);
      overflow += bytes;
    }
  }
  const pixelStart = overflow;
  const strip = entries.find((e) => e.tag === TAG.stripOffsets);
  if (strip) strip.value = pixelStart;

  const w = new ByteWriter(pixelStart + pixelBytes);
  w.ascii('II'); // 小端
  w.u16LE(42); // TIFF 魔数
  w.u32LE(ifdStart);
  w.u16LE(entries.length);
  for (const entry of entries) writeEntry(w, entry, overflowAt.get(entry.tag));
  w.u32LE(0); // 没有下一个 IFD

  // 溢出区，顺序必须与上面算偏移时一致
  for (const entry of entries) {
    if (!overflowAt.has(entry.tag)) continue;
    const values = Array.isArray(entry.value) ? entry.value : [entry.value];
    for (const value of values) {
      if (entry.type === SHORT) w.u16LE(value);
      else w.u32LE(value);
    }
  }

  w.bytes(data);
  return w.toBytes();
}

/** 写一条 12 字节的 IFD 条目 */
function writeEntry(w: ByteWriter, entry: Entry, overflowOffset: number | undefined): void {
  w.u16LE(entry.tag);
  w.u16LE(entry.type);
  w.u32LE(entry.count);
  if (overflowOffset !== undefined) {
    w.u32LE(overflowOffset);
    return;
  }
  const value = Array.isArray(entry.value) ? entry.value[0] : entry.value;
  /*
   * 关键点：短类型要**左对齐**写在这 4 字节里。
   * SHORT 写完只占 2 字节，剩下 2 字节补 0；写成 u32LE 在小端下恰好等价，
   * 但 SHORT count=2 的情况必须分开写，否则第二个值会丢。
   */
  if (entry.type === SHORT) {
    w.u16LE(value);
    w.u16LE(Array.isArray(entry.value) && entry.count > 1 ? entry.value[1] : 0);
  } else {
    w.u32LE(value);
  }
}
