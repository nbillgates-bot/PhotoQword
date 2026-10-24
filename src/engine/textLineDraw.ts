/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 画一行文字（含下划线），支持字符级颜色。
 *
 * 从 textRender 拆出来的原因：加了颜色段之后这件事本身就有分支
 * （整行单色走快路、多色按段切开），塞回去会让 textRender 超过文件行数上限。
 *
 * 纯绘制，不认识 store（规约 §2.1）。context 的 font / letterSpacing /
 * textAlign / textBaseline 由调用方绑定好。
 */

import type { TextData } from '../types';
import { alignShift } from './textRender';
import { colorAt, type ColorRun } from './textRuns';

/** 一行里的一个同色片段 */
interface Segment {
  text: string;
  /** 片段首字符在整行里的下标，用来量前缀宽度 */
  offset: number;
  color: string;
}

/** 按颜色把一行切成若干同色片段。整行同色时只有一段 */
function toSegments(line: string, runs: ColorRun[] | undefined, lineStart: number, base: string): Segment[] {
  const chars = [...line];
  const segments: Segment[] = [];

  let offset = 0;
  for (const char of chars) {
    const color = colorAt(runs, lineStart + offset, base);
    const last = segments[segments.length - 1];
    if (last && last.color === color) {
      last.text += char;
    } else {
      segments.push({ text: char, offset, color });
    }
    offset += char.length;
  }

  return segments;
}

/** 画下划线。位置压在基线下方约 0.1em，跟浏览器 text-decoration 一致 */
function drawUnderline(
  context: CanvasRenderingContext2D,
  fontSize: number,
  left: number,
  y: number,
  width: number,
): void {
  context.fillRect(left, y + fontSize * 0.1, width, Math.max(1, fontSize / 16));
}

interface DrawLineParams {
  context: CanvasRenderingContext2D;
  data: TextData;
  /** 这一行的文本 */
  line: string;
  /** 这一行首字符在原始内容里的下标，用来查颜色段 */
  lineStart: number;
  /** 落笔点（含对齐语义，见 alignShift） */
  x: number;
  /** 基线 y，不是行盒顶端 */
  y: number;
}

/**
 * 画一行文字。整行同色时走单次 fillText，与加颜色段之前的行为逐像素一致。
 *
 * 多色时按片段切开逐段画，位置靠「量前缀宽度」定：第 n 段的落笔点 =
 * 行左边 + 前 n-1 段合起来的宽度。不用逐段累加各自的实测宽度，因为那样
 * 会把字距和字偶间距的误差一段段攒起来；量前缀等于始终按整行的排版取位置。
 * 代价是跨段边界的字偶间距（kerning）没了 —— 两个字符分属不同颜色时
 * 浏览器渲染 HTML 也是这个结果，与编辑态的 textarea 表现一致。
 */
export function drawTextLine({ context, data, line, lineStart, x, y }: DrawLineParams): void {
  const runs = data.colorRuns;
  const segments = toSegments(line, runs, lineStart, data.color);

  // 快路：整行同色（没有颜色段的文字层永远走这里）
  if (segments.length <= 1) {
    context.fillStyle = segments[0]?.color ?? data.color;
    context.fillText(line, x, y);
    if (data.underline) {
      const width = context.measureText(line).width;
      drawUnderline(context, data.fontSize, x - alignShift(data.align, width), y, width);
    }
    return;
  }

  /*
   * 多色：先把落笔点还原成行左边。
   *
   * textAlign 是相对落笔点生效的，逐段画时每段都有自己的落笔点，
   * 没法再靠 textAlign 对齐整行 —— 所以这里临时切成 left，
   * 自己按前缀宽度算每段的绝对位置。
   */
  const totalWidth = context.measureText(line).width;
  const left = x - alignShift(data.align, totalWidth);
  const previousAlign = context.textAlign;
  context.textAlign = 'left';

  for (const segment of segments) {
    const prefixWidth = context.measureText(line.slice(0, segment.offset)).width;
    const segmentX = left + prefixWidth;
    context.fillStyle = segment.color;
    context.fillText(segment.text, segmentX, y);
    if (data.underline) {
      // 下划线跟着字符颜色走，PS 的下划线也是字符样式的一部分
      drawUnderline(context, data.fontSize, segmentX, y, context.measureText(segment.text).width);
    }
  }

  context.textAlign = previousAlign;
}
