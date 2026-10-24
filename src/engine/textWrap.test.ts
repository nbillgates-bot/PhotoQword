/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { firstBaselineOffset, wrapText } from './textWrap';
import { ctx2d } from './canvasUtils';

/**
 * 折行规则是「编辑态与提交后排版一致」的地基，必须精确到断在哪个字。
 * 所以注入一个假 measure（每个宽字符 10、其余 5），断言具体断点而不是行数区间 ——
 * 真实 measureText 在无字体环境下返回 0，什么都断言不出来。
 */
const measure: (text: string) => number = (text) => {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code >= 0x4e00 && code <= 0x9fff ? 10 : 5;
  }
  return width;
};

describe('wrapText 硬换行', () => {
  it('按换行符分段', () => {
    expect(wrapText(measure, 'a\nb', 100)).toEqual(['a', 'b']);
  });

  it('保留中间空行', () => {
    expect(wrapText(measure, 'a\n\nb', 100)).toEqual(['a', '', 'b']);
  });

  it('末尾换行产生一个空行，光标才停在下一行', () => {
    expect(wrapText(measure, 'a\n', 100)).toEqual(['a', '']);
  });

  it('空内容是一行空串，不是零行', () => {
    expect(wrapText(measure, '', 100)).toEqual(['']);
  });
});

describe('wrapText 汉字逐字折行', () => {
  // 一个汉字宽 10，宽度 35 只放得下 3 个
  it('放不下就在字之间断，不回退到远处的空格', () => {
    expect(wrapText(measure, '一二三四五', 35)).toEqual(['一二三', '四五']);
  });

  it('前面有空格也不会把整行拽回去', () => {
    // 回退到空格会得到 ['甲', '一二三四五']，那正是提交后排版跳变的 bug
    expect(wrapText(measure, '甲 一二三四五', 35)).toEqual(['甲 一二', '三四五']);
  });

  it('刚好等于边界宽度时不折行', () => {
    expect(wrapText(measure, '一二三', 30)).toEqual(['一二三']);
  });
});

describe('wrapText 拉丁词在空白处断', () => {
  it('整词挪到下一行，不从词中间劈开', () => {
    expect(wrapText(measure, 'aaa bbb', 20)).toEqual(['aaa ', 'bbb']);
  });

  it('行尾空白悬挂，不算进溢出', () => {
    // 'aaa ' 含空格宽 20，超了 15；但去掉行尾空白只有 15，正好放下
    expect(wrapText(measure, 'aaa bbb', 15)).toEqual(['aaa ', 'bbb']);
  });

  it('单词自己就超宽时按字符硬断', () => {
    expect(wrapText(measure, 'abcdef', 15)).toEqual(['abc', 'def']);
  });

  it('中英混排在语种交界处也能断', () => {
    expect(wrapText(measure, 'ab一二', 20)).toEqual(['ab一', '二']);
  });
});

describe('wrapText 边界值', () => {
  it('宽度为 0 时只保留硬换行，不死循环', () => {
    expect(wrapText(measure, 'ab\ncd', 0)).toEqual(['ab', 'cd']);
  });

  it('宽度为负数时同样不死循环', () => {
    expect(wrapText(measure, 'ab', -5)).toEqual(['ab']);
  });

  it('宽度小于单个字符也能收敛，且每行非空', () => {
    const lines = wrapText(measure, '一二三', 1);
    expect(lines).toEqual(['一', '二', '三']);
  });

  it('折行不丢字符也不重复字符', () => {
    const content = '一二三四五六七八九十';
    expect(wrapText(measure, content, 35).join('')).toBe(content);
  });

  it('纯空白段落原样保留，不被压成空行', () => {
    expect(wrapText(measure, '   ', 10)).toEqual(['   ']);
  });
});

describe('firstBaselineOffset', () => {
  const context = () => {
    const element = document.createElement('canvas');
    return ctx2d(element);
  };

  /*
   * 有无 fontBoundingBox* 两条路径的结论都要成立，所以只断言「是有限数、
   * 落在行盒内」这类不依赖具体字体度量的性质（规约 §9）。
   */
  it('是有限数，不产生 NaN', () => {
    expect(Number.isFinite(firstBaselineOffset(context(), 48, 1.2))).toBe(true);
  });

  it('基线落在行盒高度之内', () => {
    const offset = firstBaselineOffset(context(), 48, 1.2);
    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThanOrEqual(48 * 1.2);
  });

  it('行高变大时基线整体下移半个行距差', () => {
    const tight = firstBaselineOffset(context(), 48, 1);
    const loose = firstBaselineOffset(context(), 48, 2);
    expect(loose - tight).toBeCloseTo(24, 5);
  });

  it('字号为 1 的极端值仍是有限正数', () => {
    expect(firstBaselineOffset(context(), 1, 1.2)).toBeGreaterThan(0);
  });

  it('行高小于 1 时基线可能上移，但不会是 NaN', () => {
    expect(Number.isFinite(firstBaselineOffset(context(), 48, 0.5))).toBe(true);
  });
});
