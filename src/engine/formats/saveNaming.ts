/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { needsPsb } from '../psdNaming';
import { FORMATS, type FormatDef } from './registry';

/**
 * 存储文件名的生成与整理。
 *
 * 从 psdNaming 拆出来的原因：格式从 PSD 一种变成十几种之后，
 * 「该用哪个扩展名」要查注册表，而 psdNaming 是 PSD 专属的低层模块，
 * 让它反向依赖注册表会形成环。
 */

/** 所有已知扩展名，用于识别并剥掉用户敲的扩展名 */
const KNOWN_EXTS = new Set(FORMATS.flatMap((item) => [item.ext, ...(item.altExts ?? [])]));

/** Windows 上非法的文件名字符。POSIX 只禁 / 和 NUL，取两者的并集最保险 */
const ILLEGAL_CHARS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

/**
 * 剥掉末尾的已知扩展名。
 * 只认注册表里的扩展名，所以「封面.终稿」这种名字不会被误剥成「封面」。
 */
export function stripKnownExt(name: string): string {
  const match = /^(.*)\.([a-z0-9]+)$/i.exec(name);
  if (!match) return name;
  return KNOWN_EXTS.has(match[2].toLowerCase()) ? match[1] : name;
}

/**
 * 清理用户敲的名字：去首尾空白、剔非法字符与控制字符、剥掉已知扩展名。
 * 清成空时退回 fallback，避免存出一个只有扩展名的文件。
 *
 * 逐字符判码位而不是用正则字符类：正则要写 \x00-\x1f 这种转义，
 * 一旦源文件里落进裸控制字节，整个文件会被工具链当二进制处理。
 */
export function cleanBaseName(input: string, fallback = '未命名'): string { // i18n-exempt: 兜底值，正常路径由调用方按语言传入
  let output = '';
  for (const char of stripKnownExt(input.trim())) {
    const code = char.codePointAt(0) ?? 0;
    // C0 控制字符与 DEL
    if (code < 0x20 || code === 0x7f) continue;
    if (ILLEGAL_CHARS.has(char)) continue;
    output += char;
  }
  return output.trim() || fallback;
}

/**
 * 该格式在这个文档上实际该用的扩展名。
 *
 * 唯一的特例是 PSD：单边超过 30000 px 时 PSD 存不下，必须换成 PSB。
 * PS 里这种文档的存储对话框也不给 PSD 选项。
 */
export function extensionFor(format: FormatDef, doc: { width: number; height: number }): string {
  if (format.id === 'psd' && needsPsb(doc)) return 'psb';
  return format.ext;
}

/** 拼出完整文件名 */
export function buildSaveName(
  input: string,
  format: FormatDef,
  doc: { width: number; height: number },
  fallback = '未命名', // i18n-exempt: 兜底值，正常路径由调用方按语言传入
): string {
  return `${cleanBaseName(input, fallback)}.${extensionFor(format, doc)}`;
}
