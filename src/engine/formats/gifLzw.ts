/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Bytes } from './byteWriter';

/**
 * GIF 的 LZW 编码器。
 *
 * GIF 用的是变长码字的 LZW：码长从 minCodeSize+1 起步，字典写满就 +1，
 * 到 12 位封顶后发一个 clear 码把字典清空重来。码字按**低位在前**塞进
 * 字节流，这一点和大多数位流写法相反，写错的话解出来是一片雪花。
 *
 * 不引第三方 gif 库：整个编码器就这么百来行，而依赖要多带一份
 * 量化 + 编码的实现进包，还得核对它有没有用到我们禁用的 API。
 */

/** 码长上限，GIF 规范定死 12 位 */
const MAX_CODE_SIZE = 12;

/** 按 GIF 的子块格式打包：每块最多 255 字节，前面一字节写长度，0 收尾 */
export function toSubBlocks(bytes: Uint8Array): Bytes {
  const blockCount = Math.ceil(bytes.length / 255);
  const output = new Uint8Array(bytes.length + blockCount + 1);
  let read = 0;
  let write = 0;
  while (read < bytes.length) {
    const size = Math.min(255, bytes.length - read);
    output[write] = size;
    output.set(bytes.subarray(read, read + size), write + 1);
    read += size;
    write += size + 1;
  }
  output[write] = 0; // 块终止符
  return output.subarray(0, write + 1) as Bytes;
}

/** 低位在前的位流写入器 */
class BitWriter {
  private bytes: number[] = [];
  private acc = 0;
  private bits = 0;

  write(code: number, length: number): void {
    this.acc |= code << this.bits;
    this.bits += length;
    while (this.bits >= 8) {
      this.bytes.push(this.acc & 0xff);
      this.acc >>>= 8;
      this.bits -= 8;
    }
  }

  /** 收尾：不满一字节的剩余位也要输出，否则最后几个码字丢掉 */
  finish(): Bytes {
    if (this.bits > 0) this.bytes.push(this.acc & 0xff);
    return new Uint8Array(this.bytes);
  }
}

/**
 * 把调色板下标序列 LZW 编码。
 * minCodeSize 是表达调色板所需的位数（2..8），GIF 规定至少 2。
 */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Bytes {
  const clearCode = 1 << minCodeSize;
  const endCode = clearCode + 1;

  const writer = new BitWriter();
  let codeSize = minCodeSize + 1;
  let nextCode = endCode + 1;
  /*
   * 字典用「前缀码 << 8 | 后继字节」当键。
   * 定长 key 让它能进 Map 而不必拼字符串，省掉每像素一次字符串分配。
   */
  let dict = new Map<number, number>();

  writer.write(clearCode, codeSize);

  if (indices.length === 0) {
    writer.write(endCode, codeSize);
    return writer.finish();
  }

  let prefix = indices[0];
  for (let i = 1; i < indices.length; i += 1) {
    const next = indices[i];
    const key = (prefix << 8) | next;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    writer.write(prefix, codeSize);
    if (nextCode < 1 << MAX_CODE_SIZE) {
      dict.set(key, nextCode);
      // 字典刚好写满当前码长能表达的范围时加一位
      if (nextCode === 1 << codeSize && codeSize < MAX_CODE_SIZE) codeSize += 1;
      nextCode += 1;
    } else {
      // 12 位满了：清字典重来，否则后续码字无法表达
      writer.write(clearCode, codeSize);
      dict = new Map();
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    }
    prefix = next;
  }

  writer.write(prefix, codeSize);
  writer.write(endCode, codeSize);
  return writer.finish();
}
