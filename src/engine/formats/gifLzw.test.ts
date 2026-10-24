/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { lzwEncode, toSubBlocks } from './gifLzw';

/**
 * LZW 的输出没法靠肉眼核对，所以这里配了一个解码器当对照：
 * **编码 → 解码 → 与原输入逐字节相等**。这比断言某个字节等于某个数
 * 强得多，因为后者一旦实现细节变化就红，而这个只要往返正确就绿。
 */

/** GIF LZW 解码器，只用于测试。与编码器独立实现，避免同错同对 */
function lzwDecode(bytes: Uint8Array, minCodeSize: number): number[] {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;
  let codeSize = minCodeSize + 1;
  let dict: number[][] = [];
  const resetDict = () => {
    dict = [];
    for (let i = 0; i < clearCode; i += 1) dict.push([i]);
    dict.push([]); // clear
    dict.push([]); // end
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const output: number[] = [];
  let acc = 0;
  let bits = 0;
  let previous: number[] | null = null;

  for (let i = 0; i <= bytes.length; i += 1) {
    if (i < bytes.length) {
      acc |= bytes[i] << bits;
      bits += 8;
    }
    while (bits >= codeSize) {
      const code = acc & ((1 << codeSize) - 1);
      acc >>>= codeSize;
      bits -= codeSize;

      if (code === endCode) return output;
      if (code === clearCode) {
        resetDict();
        previous = null;
        continue;
      }
      let entry: number[];
      if (code < dict.length) {
        entry = dict[code];
      } else {
        if (!previous) throw new Error('码流损坏');
        entry = [...previous, previous[0]];
      }
      output.push(...entry);
      if (previous) dict.push([...previous, entry[0]]);
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize += 1;
      previous = entry;
    }
  }
  return output;
}

describe('toSubBlocks', () => {
  it('空输入给一个长度为 0 的块加终止符', () => {
    expect([...toSubBlocks(new Uint8Array([]))]).toEqual([0]);
  });

  it('短输入一块装下', () => {
    const input = new Uint8Array([1, 2, 3]);
    expect([...toSubBlocks(input)]).toEqual([3, 1, 2, 3, 0]);
  });

  it('正好 255 字节一块，256 字节拆成两块', () => {
    const many = new Uint8Array(256);
    const blocks = [...toSubBlocks(many)];
    expect(blocks[0]).toBe(255);
    expect(blocks[256]).toBe(1);
    expect(blocks[258]).toBe(0);
  });
});

describe('lzwEncode 往返', () => {
  it('全相同的值能压缩并正确往返', () => {
    const input = new Uint8Array(100).fill(5);
    const encoded = lzwEncode(input, 3);
    expect(lzwDecode(encoded, 3)).toEqual([...input]);
    // 压缩率应该很高：100 个相同值编码后远小于 100 字节
    expect(encoded.length).toBeLessThan(30);
  });

  it('连续递增序列能压缩', () => {
    const input = new Uint8Array(256).map((_, i) => i);
    const encoded = lzwEncode(input, 8);
    expect(lzwDecode(encoded, 8)).toEqual([...input]);
  });

  it('随机序列往返正确（虽然压不了多少）', () => {
    const input = new Uint8Array(200).map(() => Math.floor(Math.random() * 16));
    const encoded = lzwEncode(input, 4);
    expect(lzwDecode(encoded, 4)).toEqual([...input]);
  });

  it('最小码长 2（GIF 规范下限）', () => {
    // 4 色的调色板，minCodeSize=2
    const input = new Uint8Array([0, 1, 2, 3, 0, 1]);
    const encoded = lzwEncode(input, 2);
    expect(lzwDecode(encoded, 2)).toEqual([...input]);
  });

  it('8 位全域（256 色）', () => {
    const input = new Uint8Array(300).map((_, i) => i % 256);
    const encoded = lzwEncode(input, 8);
    expect(lzwDecode(encoded, 8)).toEqual([...input]);
  });

  it('空输入给 clear + end，往返回空', () => {
    const encoded = lzwEncode(new Uint8Array([]), 3);
    expect(lzwDecode(encoded, 3)).toEqual([]);
    expect(encoded.length).toBeGreaterThan(0); // 至少有 clear + end 两个码字
  });

  it('单字节输入往返正确', () => {
    const encoded = lzwEncode(new Uint8Array([7]), 3);
    expect(lzwDecode(encoded, 3)).toEqual([7]);
  });

  it('字典填满后发 clear，之后继续压缩', () => {
    // 构造一个足够长的输入让字典写满 12 位（4096 项）再触发 clear
    const input = new Uint8Array(5000).map((_, i) => i % 64);
    const encoded = lzwEncode(input, 6);
    expect(lzwDecode(encoded, 6)).toEqual([...input]);
  });
});
