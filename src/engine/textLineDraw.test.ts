/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { wrapTextRanges } from './textWrap';
import { drawTextLine } from './textLineDraw';
import { ctx2d } from './canvasUtils';
import type { TextData } from '../types';

/** 每个字符固定宽 10，让区间与位置可以精确断言 */
const measure = (text: string) => text.length * 10;

const DATA: TextData = {
  content: '',
  fontFamily: 'sans-serif',
  fontSize: 20,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#000000',
  lineHeight: 1.2,
  letterSpacing: 0,
  x: 0,
  y: 0,
};

describe('wrapTextRanges 行区间', () => {
  it('无换行时单行覆盖全文', () => {
    expect(wrapTextRanges(measure, 'abc', 0)).toEqual([{ text: 'abc', start: 0, end: 3 }]);
  });

  it('硬换行的行区间跳过换行符本身', () => {
    const lines = wrapTextRanges(measure, 'ab\ncd', 0);
    expect(lines).toEqual([
      { text: 'ab', start: 0, end: 2 },
      { text: 'cd', start: 3, end: 5 },
    ]);
  });

  it('区间能按原文切回本行文本', () => {
    const content = '一二三\n四五\n\n六';
    for (const line of wrapTextRanges(measure, content, 0)) {
      expect(content.slice(line.start, line.end)).toBe(line.text);
    }
  });

  it('软折行的区间连续、不吃字符', () => {
    // 每字 10 宽，限宽 30 -> 每行 3 字
    const lines = wrapTextRanges(measure, 'abcdefgh', 30);
    expect(lines[0]).toEqual({ text: 'abc', start: 0, end: 3 });
    expect(lines[1]).toEqual({ text: 'def', start: 3, end: 6 });
  });

  it('软折 + 硬换行混排时区间仍能切回原文', () => {
    const content = 'abcdefgh\nijklmn';
    for (const line of wrapTextRanges(measure, content, 30)) {
      expect(content.slice(line.start, line.end)).toBe(line.text);
    }
  });

  it('空行保留为零长区间', () => {
    const lines = wrapTextRanges(measure, 'a\n\nb', 0);
    expect(lines[1]).toEqual({ text: '', start: 2, end: 2 });
  });
});

/** 画一行到干净画布上，返回上下文与画布 */
function drawOnce(data: TextData, line: string, lineStart = 0) {
  const element = document.createElement('canvas');
  element.width = 400;
  element.height = 80;
  const context = ctx2d(element);
  context.font = `${data.fontSize}px sans-serif`;
  context.textBaseline = 'top';
  drawTextLine({ context, data, line, lineStart, x: 0, y: 0 });
  return { context, element };
}

/** 统计画布上出现过的不透明颜色种类（忽略抗锯齿的半透明边缘） */
function opaqueColors(context: CanvasRenderingContext2D): Set<string> {
  const { data } = context.getImageData(0, 0, 400, 80);
  const found = new Set<string>();
  for (let i = 0; i < data.length; i += 4) {
    // 只看接近全不透明的像素，抗锯齿边缘的混色不算独立颜色
    if (data[i + 3] < 250) continue;
    found.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  }
  return found;
}

describe('drawTextLine 字符级颜色', () => {
  it('没有颜色段时整行只有基色', () => {
    const { context } = drawOnce({ ...DATA, color: '#ff0000' }, 'AAAA');
    /*
     * 不断言颜色集合恰好等于 {255,0,0}：抗锯齿会画出 254,0,0 这类
     * 全不透明但略偏的像素，钉死具体值等于把测试绑在栅格化实现上（规约 §9）。
     * 真正要证明的是「没有第二个色系」，所以查蓝绿分量。
     */
    for (const color of opaqueColors(context)) {
      const [, g, b] = color.split(',').map(Number);
      expect(g).toBe(0);
      expect(b).toBe(0);
    }
    expect(opaqueColors(context).size).toBeGreaterThan(0);
  });

  it('给后半段上色后画面上同时存在两种颜色', () => {
    const data: TextData = {
      ...DATA,
      color: '#ff0000',
      colorRuns: [{ start: 2, end: 4, color: '#0000ff' }],
    };
    const colors = opaqueColors(drawOnce(data, 'AAAA').context);
    expect(colors.has('255,0,0')).toBe(true);
    expect(colors.has('0,0,255')).toBe(true);
  });

  it('只给选中的那几个字上色，其余字保持基色', () => {
    // 整段染蓝的话红色就一个都不剩了 —— 这正是用户报的第 2 个问题
    const data: TextData = {
      ...DATA,
      color: '#ff0000',
      colorRuns: [{ start: 0, end: 4, color: '#0000ff' }],
    };
    const colors = opaqueColors(drawOnce(data, 'AAAA').context);
    expect(colors.has('255,0,0')).toBe(false);
    expect(colors.has('0,0,255')).toBe(true);
  });

  it('颜色段按 lineStart 偏移，第二行的字取到自己的颜色', () => {
    // 颜色段 [4,8) 对应第二行，画第一行（lineStart=0）时不该染色
    const data: TextData = {
      ...DATA,
      color: '#ff0000',
      colorRuns: [{ start: 4, end: 8, color: '#0000ff' }],
    };
    expect(opaqueColors(drawOnce(data, 'AAAA', 0).context).has('0,0,255')).toBe(false);
    expect(opaqueColors(drawOnce(data, 'BBBB', 4).context).has('0,0,255')).toBe(true);
  });

  it('居中与右对齐下多色行不跑出画布', () => {
    for (const align of ['center', 'right'] as const) {
      const data: TextData = {
        ...DATA,
        align,
        colorRuns: [{ start: 0, end: 1, color: '#00ff00' }],
      };
      const element = document.createElement('canvas');
      element.width = 400;
      element.height = 80;
      const context = ctx2d(element);
      context.font = `${data.fontSize}px sans-serif`;
      context.textBaseline = 'top';
      context.textAlign = align;
      // 落笔点放在画布中间/右边，与 renderText 的约定一致
      const x = align === 'center' ? 200 : 400;
      drawTextLine({ context, data, line: 'AAAA', lineStart: 0, x, y: 0 });
      expect(opaqueColors(context).has('0,255,0')).toBe(true);
    }
  });

  it('画完不改动上下文的 textAlign', () => {
    const element = document.createElement('canvas');
    element.width = 400;
    element.height = 80;
    const context = ctx2d(element);
    context.font = '20px sans-serif';
    context.textAlign = 'center';
    const data: TextData = { ...DATA, colorRuns: [{ start: 0, end: 1, color: '#00ff00' }] };
    drawTextLine({ context, data, line: 'AB', lineStart: 0, x: 200, y: 20 });
    // 多色路径内部会临时切成 left，画完必须还原，否则后面几行会错位
    expect(context.textAlign).toBe('center');
  });

  it('下划线跟着字符颜色走', () => {
    const data: TextData = {
      ...DATA,
      underline: true,
      color: '#ff0000',
      colorRuns: [{ start: 0, end: 2, color: '#0000ff' }],
    };
    const colors = opaqueColors(drawOnce(data, 'AAAA').context);
    expect(colors.has('255,0,0')).toBe(true);
    expect(colors.has('0,0,255')).toBe(true);
  });
});
