/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 色板文件解析：Adobe Swatch Exchange（.ase）与 Photoshop 色板（.aco）。
 *
 * 为什么需要它：潘通等专有色库不能内置（色号与配方有知识产权，要授权；
 * Adobe 自己也在 2022 年把潘通从 PS 里移除了，改成单独订阅）。
 * 正当的做法是让用户导入**自己的正版色库文件** —— 这也是现在 PS 的工作方式。
 *
 * 这两个格式本身有公开规范，实现解析器不涉及任何色库数据。
 * 纯函数，只吃 ArrayBuffer 吐数据，不认识 DOM 也不认识 store（规约 §2.1）。
 */

import { cmykToRgb, hsvToRgb, labToRgb, rgbToHex } from './color';
import type { ColorSwatch } from './colorLibraries';

/** 解析结果。失败不抛异常，返回 reasonKey 让调用方决定怎么提示（I18N.md §3） */
export interface SwatchParseResult {
  swatches: ColorSwatch[];
  /** 失败原因的词条 key，成功时为 undefined */
  reasonKey?: string;
}

/** 读 UTF-16BE 字符串，len 是字符数（不是字节数） */
function readUtf16(view: DataView, offset: number, len: number): string {
  let text = '';
  for (let i = 0; i < len; i += 1) {
    const code = view.getUint16(offset + i * 2);
    // 结尾的 NUL 是格式的一部分，不要带进名字里
    if (code !== 0) text += String.fromCharCode(code);
  }
  return text;
}

/** 四字节 ASCII 标签，用来认色彩空间 */
function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

/**
 * .ase 的一个颜色项：名字 + 色彩空间 + 分量（32 位浮点）。
 * 返回 null 表示这一项的色彩空间不认识，跳过它而不是让整个文件失败。
 */
function aseColor(view: DataView, offset: number): ColorSwatch | null {
  const nameLength = view.getUint16(offset);
  const name = readUtf16(view, offset + 2, nameLength);
  let cursor = offset + 2 + nameLength * 2;

  const space = readTag(view, cursor);
  cursor += 4;

  const f = (index: number) => view.getFloat32(cursor + index * 4);

  switch (space) {
    case 'RGB ':
      return { hex: rgbToHex({ r: f(0) * 255, g: f(1) * 255, b: f(2) * 255 }), name };
    case 'CMYK':
      return { hex: rgbToHex(cmykToRgb(f(0), f(1), f(2), f(3))), name };
    case 'LAB ':
      // ASE 里 L 存成 0..1，a/b 是 -128..127 的实际值
      return { hex: rgbToHex(labToRgb(f(0) * 100, f(1), f(2))), name };
    case 'Gray': {
      const level = f(0) * 255;
      return { hex: rgbToHex({ r: level, g: level, b: level }), name };
    }
    default:
      return null;
  }
}

/**
 * 解析 Adobe Swatch Exchange（.ase）。
 *
 * 结构：'ASEF' + 版本(4) + 块数(4)，之后是块序列。
 * 块 = 类型(2) + 长度(4) + 内容；类型 0x0001 是颜色，0xc001/0xc002 是组的起止。
 * 组只用来分类，这里摊平成一个列表 —— 面板本来就按行铺，不需要组层级。
 */
export function parseAse(buffer: ArrayBuffer): SwatchParseResult {
  const view = new DataView(buffer);
  if (buffer.byteLength < 12 || readTag(view, 0) !== 'ASEF') {
    return { swatches: [], reasonKey: 'swatch.notAse' };
  }

  const swatches: ColorSwatch[] = [];
  const blockCount = view.getUint32(8);
  let cursor = 12;

  for (let i = 0; i < blockCount; i += 1) {
    // 块头要 6 字节，剩不下就说明文件截断了，停在这儿把已读到的交出去
    if (cursor + 6 > buffer.byteLength) break;
    const type = view.getUint16(cursor);
    const length = view.getUint32(cursor + 2);
    const body = cursor + 6;

    if (type === 0x0001) {
      const swatch = aseColor(view, body);
      if (swatch) swatches.push(swatch);
    }

    // 用块自带的长度跳转，不自己算 —— 长度字段是格式的一部分，比推算可靠
    cursor = body + length;
  }

  return swatches.length ? { swatches } : { swatches: [], reasonKey: 'swatch.empty' };
}

/**
 * .aco 的一个颜色：色彩空间(2) + 四个 u16 分量。
 *
 * 各空间的分量含义不一样，尤其 CMYK 是**反的**（0 表示满墨），
 * 这一条最容易写错，写反了颜色会整体反相。
 */
function acoColor(view: DataView, offset: number): string | null {
  const space = view.getUint16(offset);
  const w = (index: number) => view.getUint16(offset + 2 + index * 2);
  // 有符号分量（Lab 的 a/b）要按补码读
  const s = (index: number) => view.getInt16(offset + 2 + index * 2);

  switch (space) {
    case 0: // RGB：0..65535
      return rgbToHex({ r: w(0) / 257, g: w(1) / 257, b: w(2) / 257 });
    case 1: // HSB：H 是 0..65535 对应 0..360，S/B 是 0..65535 对应 0..1
      return rgbToHex(hsvToRgb({ h: (w(0) / 65535) * 360, s: w(1) / 65535, v: w(2) / 65535 }));
    case 2: // CMYK：0 = 满墨，65535 = 无墨，所以要取反
      return rgbToHex(
        cmykToRgb(1 - w(0) / 65535, 1 - w(1) / 65535, 1 - w(2) / 65535, 1 - w(3) / 65535),
      );
    case 7: // Lab：L 是 0..10000，a/b 是 -12800..12700（都放大了 100 倍）
      return rgbToHex(labToRgb(w(0) / 100, s(1) / 100, s(2) / 100));
    case 8: {
      // 灰度：0..10000
      const level = (w(0) / 10000) * 255;
      return rgbToHex({ r: level, g: level, b: level });
    }
    default:
      return null;
  }
}

/**
 * 解析 Photoshop 色板（.aco）。
 *
 * 格式的特点：一个文件里**先是 v1 段，紧接着可能还有一段 v2**。
 * v1 只有色值，v2 在每个色值后面多带一个名字 —— 潘通色号就在 v2 的名字里，
 * 所以要优先取 v2，没有 v2 才退回 v1。
 *
 * v1：版本(2)=1 + 数量(2) + 数量×10 字节
 * v2：版本(2)=2 + 数量(2) + 数量×(10 + 名字长度(4) + 名字×2) 字节
 */
export function parseAco(buffer: ArrayBuffer): SwatchParseResult {
  const view = new DataView(buffer);
  if (buffer.byteLength < 4) return { swatches: [], reasonKey: 'swatch.notAco' };

  const version = view.getUint16(0);
  if (version !== 1 && version !== 2) return { swatches: [], reasonKey: 'swatch.notAco' };

  const count = view.getUint16(2);
  if (!count) return { swatches: [], reasonKey: 'swatch.empty' };

  // 先按 v1 读一遍，它总在最前面，也是 v2 缺失时的兜底
  const v1: ColorSwatch[] = [];
  let cursor = 4;
  for (let i = 0; i < count && cursor + 10 <= buffer.byteLength; i += 1) {
    const hex = acoColor(view, cursor);
    if (hex) v1.push({ hex });
    cursor += 10;
  }

  // v1 段之后如果还有内容，那就是带名字的 v2 段
  const v2 = cursor + 4 <= buffer.byteLength ? parseAcoV2(view, cursor, buffer.byteLength) : null;
  const swatches = v2?.length ? v2 : v1;

  return swatches.length ? { swatches } : { swatches: [], reasonKey: 'swatch.empty' };
}

/** 读 v2 段（带名字）。结构不对就返回 null，让调用方退回 v1 */
function parseAcoV2(view: DataView, start: number, byteLength: number): ColorSwatch[] | null {
  if (view.getUint16(start) !== 2) return null;

  const count = view.getUint16(start + 2);
  const swatches: ColorSwatch[] = [];
  let cursor = start + 4;

  for (let i = 0; i < count; i += 1) {
    // 10 字节色值 + 4 字节名字长度，读不下就是截断了
    if (cursor + 14 > byteLength) return swatches.length ? swatches : null;
    const hex = acoColor(view, cursor);
    cursor += 10;

    const nameLength = view.getUint32(cursor);
    cursor += 4;
    if (cursor + nameLength * 2 > byteLength) return swatches.length ? swatches : null;

    const name = readUtf16(view, cursor, nameLength);
    cursor += nameLength * 2;

    if (hex) swatches.push(name ? { hex, name } : { hex });
  }

  return swatches;
}

/** 按文件名后缀分派解析器。认不出后缀就两个都试一遍 */
export function parseSwatchFile(name: string, buffer: ArrayBuffer): SwatchParseResult {
  const lower = name.toLowerCase();
  if (lower.endsWith('.ase')) return parseAse(buffer);
  if (lower.endsWith('.aco')) return parseAco(buffer);

  // 后缀不认识：靠内容认。ASEF 魔数很好认，认不出就当 aco 试
  const ase = parseAse(buffer);
  if (ase.swatches.length) return ase;
  const aco = parseAco(buffer);
  return aco.swatches.length ? aco : { swatches: [], reasonKey: 'swatch.unsupported' };
}
