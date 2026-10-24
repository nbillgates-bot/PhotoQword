/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { ByteWriter } from './byteWriter';

describe('ByteWriter', () => {
  it('u8 只取低 8 位', () => {
    const w = new ByteWriter();
    w.u8(0x41);
    w.u8(0x1ff); // 溢出的高位要被截掉
    expect([...w.toBytes()]).toEqual([0x41, 0xff]);
  });

  it('小端与大端顺序相反', () => {
    const le = new ByteWriter();
    le.u16LE(0x1234);
    le.u32LE(0x12345678);
    expect([...le.toBytes()]).toEqual([0x34, 0x12, 0x78, 0x56, 0x34, 0x12]);

    const be = new ByteWriter();
    be.u16BE(0x1234);
    be.u32BE(0x12345678);
    expect([...be.toBytes()]).toEqual([0x12, 0x34, 0x12, 0x34, 0x56, 0x78]);
  });

  it('u32 能表达超过 2^31 的值而不变成负数', () => {
    // 关键点：位运算在 JS 里按有符号 32 位算，0xff000000 很容易写成负数
    const w = new ByteWriter();
    w.u32LE(0xff000000);
    expect([...w.toBytes()]).toEqual([0x00, 0x00, 0x00, 0xff]);
  });

  it('offset 跟着写入递增，用来记回填位置', () => {
    const w = new ByteWriter();
    expect(w.offset).toBe(0);
    w.u32LE(0);
    expect(w.offset).toBe(4);
  });

  it('patchU32LE 回填已写过的位置', () => {
    const w = new ByteWriter();
    const at = w.offset;
    w.u32LE(0); // 占位
    w.ascii('xy');
    w.patchU32LE(at, 0x0a0b0c0d);
    expect([...w.toBytes()]).toEqual([0x0d, 0x0c, 0x0b, 0x0a, 0x78, 0x79]);
  });

  it('回填越界时抛错而不是静默写到缓冲区外', () => {
    const w = new ByteWriter();
    w.u8(1);
    expect(() => w.patchU32LE(0, 5)).toThrow(RangeError);
  });

  it('ascii 按字符码写，不做编码转换', () => {
    const w = new ByteWriter();
    w.ascii('BM');
    expect([...w.toBytes()]).toEqual([0x42, 0x4d]);
  });

  it('fill 填指定字节数', () => {
    const w = new ByteWriter();
    w.fill(0xaa, 3);
    expect([...w.toBytes()]).toEqual([0xaa, 0xaa, 0xaa]);
  });

  it('fill 0 个字节是空操作', () => {
    const w = new ByteWriter();
    w.u8(1);
    w.fill(0, 0);
    expect([...w.toBytes()]).toEqual([1]);
  });

  it('容量不足时自动增长，内容不丢', () => {
    // 初始容量给 16，写 100 字节强制走扩容路径
    const w = new ByteWriter(16);
    for (let i = 0; i < 100; i += 1) w.u8(i);
    const bytes = w.toBytes();
    expect(bytes).toHaveLength(100);
    expect(bytes[0]).toBe(0);
    expect(bytes[99]).toBe(99);
  });

  it('toBytes 是副本，取出后再写不影响已取出的数据', () => {
    const w = new ByteWriter();
    w.u8(1);
    const first = w.toBytes();
    w.u8(2);
    expect([...first]).toEqual([1]);
    expect([...w.toBytes()]).toEqual([1, 2]);
  });

  it('什么都没写时给空数组', () => {
    expect([...new ByteWriter().toBytes()]).toEqual([]);
  });
});
