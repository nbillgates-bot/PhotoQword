/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 可增长的字节缓冲。手写二进制格式（BMP / TIFF / GIF / PCX…）全都用它。
 *
 * 为什么不直接用 DataView：这些格式里大量出现「先占位、算完长度再回填」
 * 和「边算边追加」，需要一个能记住位置、能回头改的写入器。
 * 每种格式各写一遍偏移量算术是屏山的起点（见 CLAUDE.md §1.1）。
 *
 * 字节序必须显式指定：BMP / TIFF(II) / GIF 是小端，TIFF(MM) / PSD 是大端，
 * 写错一个字段整个文件就打不开，所以方法名里带 LE / BE，不设默认值。
 */
/**
 * 编码结果的字节类型。
 *
 * 显式写成 Uint8Array<ArrayBuffer> 而不是裸 Uint8Array：后者的缓冲类型是
 * ArrayBufferLike，含 SharedArrayBuffer，而 Blob 的构造参数只接受 ArrayBuffer。
 * 在这里定死，下游所有编码器和 new Blob 都不用各自断言。
 */
export type Bytes = Uint8Array<ArrayBuffer>;

export class ByteWriter {
  private buffer: Bytes;
  private length = 0;

  constructor(initialCapacity = 1024) {
    this.buffer = new Uint8Array(Math.max(16, initialCapacity));
  }

  /** 当前已写入的字节数，也就是下一个字节的偏移 */
  get offset(): number {
    return this.length;
  }

  /** 容量不够就翻倍，保证 need 个字节能放下 */
  private ensure(need: number): void {
    const required = this.length + need;
    if (required <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < required) capacity *= 2;
    const grown = new Uint8Array(capacity);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
  }

  u8(value: number): void {
    this.ensure(1);
    this.buffer[this.length] = value & 0xff;
    this.length += 1;
  }

  u16LE(value: number): void {
    this.u8(value);
    this.u8(value >>> 8);
  }

  u16BE(value: number): void {
    this.u8(value >>> 8);
    this.u8(value);
  }

  u32LE(value: number): void {
    this.u16LE(value & 0xffff);
    this.u16LE(value >>> 16);
  }

  u32BE(value: number): void {
    this.u16BE(value >>> 16);
    this.u16BE(value & 0xffff);
  }

  /** 写一串字节 */
  bytes(source: ArrayLike<number>): void {
    this.ensure(source.length);
    this.buffer.set(source as Uint8Array, this.length);
    this.length += source.length;
  }

  /** 写 ASCII 字符串，不带结尾 0。用于文件魔数与 PDF 骨架 */
  ascii(text: string): void {
    this.ensure(text.length);
    for (let i = 0; i < text.length; i += 1) {
      this.buffer[this.length + i] = text.charCodeAt(i) & 0xff;
    }
    this.length += text.length;
  }

  /** 填 count 个 value，用于对齐填充 */
  fill(value: number, count: number): void {
    this.ensure(count);
    this.buffer.fill(value & 0xff, this.length, this.length + count);
    this.length += count;
  }

  /**
   * 回填已经写过的位置。
   * 典型用法：先 u32LE(0) 占个位记下 offset，算出真实长度后回来改。
   */
  patchU32LE(at: number, value: number): void {
    if (at + 4 > this.length) throw new RangeError('回填位置超出已写入范围'); // i18n-exempt: 契约性错误，写错代码才会触发
    this.buffer[at] = value & 0xff;
    this.buffer[at + 1] = (value >>> 8) & 0xff;
    this.buffer[at + 2] = (value >>> 16) & 0xff;
    this.buffer[at + 3] = (value >>> 24) & 0xff;
  }

  /** 取出结果。返回的是切片副本，之后再写不会影响已取出的数据 */
  toBytes(): Bytes {
    return this.buffer.slice(0, this.length) as Bytes;
  }
}
