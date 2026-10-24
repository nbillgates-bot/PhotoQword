/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { alignShift, fontString, getTextBounds, renderText, resolveWeight } from './textRender';
import { BOLD_WEIGHT, NORMAL_WEIGHT } from './fontWeights';
import { ctx2d } from './canvasUtils';
import { hasNaN } from './testUtils';
import type { TextData } from '../types';

/**
 * 文字渲染与命中范围。
 *
 * getTextBounds 是文字工具的命中判定依据，直接决定「点已有文字能不能进编辑」。
 * 断言刻意写成相对关系而不是具体像素值：measureText 在不同环境（有无真实字体）
 * 返回值差别很大，写死数值等于把测试绑在运行环境上（规约 §9）。
 */

const BASE: TextData = {
  content: '文字',
  fontFamily: 'sans-serif',
  fontSize: 32,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#000000',
  lineHeight: 1.2,
  letterSpacing: 0,
  x: 10,
  y: 20,
};

function canvas(width = 200, height = 200): HTMLCanvasElement {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

const text = (patch: Partial<TextData> = {}): TextData => ({ ...BASE, ...patch });

describe('fontString', () => {
  it('普通字体是「字重 字号 字族」', () => {
    // BASE 的 fontFamily 就是 sans-serif，通用族本身不再套一层引号
    expect(fontString(text())).toBe('400 32px sans-serif');
  });

  it('粗体走 700 字重', () => {
    expect(fontString(text({ bold: true }))).toContain('700');
  });

  it('斜体带 italic 前缀', () => {
    expect(fontString(text({ italic: true }))).toMatch(/^italic /);
  });

  it('粗斜体同时生效', () => {
    const result = fontString(text({ bold: true, italic: true }));
    expect(result).toBe('italic 700 32px sans-serif');
  });

  /*
   * 家族名必须带通用族兜底。少了它，字体缺失时浏览器会用自己的默认字体，
   * 而 canvas 上是画死的像素、textarea 是实时排版，两边掉下去的时机不同——
   * 表现就是点进文字编辑那一下字体变了。
   */
  it('具名字体后面接通用族兜底', () => {
    expect(fontString(text({ fontFamily: 'Noto Sans SC' }))).toBe(
      '400 32px "Noto Sans SC", sans-serif',
    );
    expect(fontString(text({ fontFamily: 'Noto Serif SC' }))).toBe(
      '400 32px "Noto Serif SC", serif',
    );
  });

  it('canvas 认这个字符串，赋值后不被丢弃', () => {
    // 拼错的 font 会被 canvas 静默忽略、保留上一次的值，那样排版就全错了
    const context = ctx2d(canvas());
    context.font = '10px monospace';
    context.font = fontString(text({ fontFamily: 'Noto Sans SC' }));
    expect(context.font).not.toBe('10px monospace');
    expect(context.font).toContain('32px');
  });

  /*
   * 数值字重要真的进 CSS 串。漏了这一步，Light 层导进来虽然 TextData 记着 300，
   * canvas 上画出来还是 400 —— 面板显示的和画面上的不一致，是最难解释的一类 bug。
   */
  it('数值字重写进 font 串', () => {
    expect(fontString(text({ fontWeight: 300 }))).toBe('300 32px sans-serif');
    expect(fontString(text({ fontWeight: 500 }))).toBe('500 32px sans-serif');
  });

  it('字重和斜体、具名字族能同时成立', () => {
    // 具名字族会补通用族兜底，所以只断言字重那一段，不写死整串（规约 §9）
    const result = fontString(text({ fontWeight: 600, italic: true, fontFamily: 'Noto Sans SC' }));
    expect(result).toMatch(/^italic 600 32px /);
  });
});

/*
 * bold 布尔量和数值字重是两个维度，PS 里也是这样：字体样式下拉框选 Light，
 * 再按仿粗体按钮，得到的是「比 Light 粗」，不是「变回 Regular」。
 * 所以这里取 max 而不是让布尔量覆盖数值。
 */
describe('resolveWeight', () => {
  it('没按粗体时就用数值字重', () => {
    expect(resolveWeight(text({ fontWeight: 300 }))).toBe(300);
    expect(resolveWeight(text({ fontWeight: 500 }))).toBe(500);
    expect(resolveWeight(text({ fontWeight: 900 }))).toBe(900);
  });

  it('按了粗体时把轻字重抬到 700', () => {
    expect(resolveWeight(text({ fontWeight: 300, bold: true }))).toBe(BOLD_WEIGHT);
    expect(resolveWeight(text({ fontWeight: NORMAL_WEIGHT, bold: true }))).toBe(BOLD_WEIGHT);
  });

  it('按了粗体不会把更重的字重压下来', () => {
    // Heavy 上按粗体应该还是 Heavy，压回 700 等于「按粗体反而变细了」
    expect(resolveWeight(text({ fontWeight: 900, bold: true }))).toBe(900);
    expect(resolveWeight(text({ fontWeight: 800, bold: true }))).toBe(800);
  });

  it('字重缺失时退回布尔量推出来的值', () => {
    // 加 fontWeight 之前存下的文档和历史快照里没有这个字段，读回来得能兜住
    const legacy = (bold: boolean): TextData => {
      const data = text({ bold });
      delete (data as Partial<TextData>).fontWeight;
      return data;
    };
    expect(resolveWeight(legacy(false))).toBe(NORMAL_WEIGHT);
    expect(resolveWeight(legacy(true))).toBe(BOLD_WEIGHT);
  });

  it('脏字重值被夹住，不会漏出 NaN 或越界数', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -100, 5000]) {
      const result = resolveWeight(text({ fontWeight: bad }));
      expect(Number.isNaN(result)).toBe(false);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(900);
    }
  });
});

/*
 * 落笔点 ↔ 框左边的换算。这套位移原本散在四处，漏一处就会让那种对齐的文字整体偏出去，
 * 表现是「点在字上进不了编辑」和「一进编辑文字就跳位」。
 */
describe('alignShift', () => {
  it('左对齐不退，落笔点就是框的左边', () => {
    expect(alignShift('left', 120)).toBe(0);
  });

  it('居中退半个宽', () => {
    expect(alignShift('center', 120)).toBe(60);
  });

  it('右对齐退一整个宽', () => {
    expect(alignShift('right', 120)).toBe(120);
  });

  it('宽度为 0 时三种对齐都不退', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      expect(alignShift(align, 0)).toBe(0);
    }
  });

  it('小数宽度不取整', () => {
    expect(alignShift('center', 121)).toBe(60.5);
  });

  it('落笔点减去位移，再按对齐摆回去，还是原来那个落笔点', () => {
    // 这条描述的就是 getTextBounds / textBoxLocal / TextEditor 共同依赖的往返关系
    const pen = 200;
    const width = 121;
    for (const align of ['left', 'center', 'right'] as const) {
      const boxLeft = pen - alignShift(align, width);
      expect(boxLeft + alignShift(align, width)).toBeCloseTo(pen);
      // 框左边永远不会跑到落笔点右边
      expect(boxLeft).toBeLessThanOrEqual(pen);
    }
  });
});

describe('getTextBounds 原点', () => {
  it('边界框左上角就是文字的 x/y', () => {
    const bounds = getTextBounds(text({ x: 37, y: 51 }), canvas());
    expect(bounds).toMatchObject({ x: 37, y: 51 });
  });

  it('原点为 0 也成立', () => {
    const bounds = getTextBounds(text({ x: 0, y: 0 }), canvas());
    expect(bounds).toMatchObject({ x: 0, y: 0 });
  });
});

/**
 * 报的 bug：PSD 里居中的文字层，点在字上进不了编辑。
 * 根因是 renderText 设了 textAlign，data.x 是落笔点不是框的左边，
 * 而 getTextBounds 一直当成左边返回，命中框整体偏了半个行宽。
 */
describe('getTextBounds 的对齐位移', () => {
  it('左对齐：x 就是落笔点', () => {
    expect(getTextBounds(text({ align: 'left', x: 100 }), canvas()).x).toBe(100);
  });

  it('居中：框的左边退半个宽度', () => {
    const bounds = getTextBounds(text({ align: 'center', x: 100 }), canvas());
    expect(bounds.x).toBeCloseTo(100 - bounds.width / 2, 5);
  });

  it('右对齐：框的左边退一整个宽度', () => {
    const bounds = getTextBounds(text({ align: 'right', x: 100 }), canvas());
    expect(bounds.x).toBeCloseTo(100 - bounds.width, 5);
  });

  it('三种对齐的落笔点都落在框内', () => {
    // 这一条才是命中检测真正关心的：点在文字上一定要算命中
    for (const align of ['left', 'center', 'right'] as const) {
      const data = text({ align, x: 100, y: 20 });
      const bounds = getTextBounds(data, canvas());
      expect(data.x).toBeGreaterThanOrEqual(bounds.x);
      expect(data.x).toBeLessThanOrEqual(bounds.x + bounds.width);
    }
  });

  it('三种对齐算出来的宽高一致，只有 x 不同', () => {
    const left = getTextBounds(text({ align: 'left', x: 100 }), canvas());
    const center = getTextBounds(text({ align: 'center', x: 100 }), canvas());
    const right = getTextBounds(text({ align: 'right', x: 100 }), canvas());

    expect(center.width).toBe(left.width);
    expect(right.width).toBe(left.width);
    expect(center.y).toBe(left.y);
    expect(right.y).toBe(left.y);
  });

  it('段落文本不做位移，x/y 本来就是框的左上角', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const data = text({ align, x: 100, y: 20, width: 300, height: 80 });
      expect(getTextBounds(data, canvas()).x).toBe(100);
    }
  });

  it('位移后的分量仍然是有限数', () => {
    const bounds = getTextBounds(text({ align: 'center', content: '' }), canvas());
    for (const value of Object.values(bounds)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});

describe('getTextBounds 尺寸', () => {
  it('所有分量都是有限数，不含 NaN', () => {
    const bounds = getTextBounds(text(), canvas());
    for (const value of Object.values(bounds)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  /*
   * 段落文本的判定是 width 与 height 成对出现（见 TextData）：只有一个的
   * 半成品状态一律按点文本处理，所以这里两个字段都要给。
   */
  it('段落文本用给定宽度，不去量文字', () => {
    const data = text({ width: 123, height: 200, content: '很长很长很长很长的一段文字' });
    expect(getTextBounds(data, canvas()).width).toBe(123);
  });

  it('段落文本宽度小于下限时仍保底，保证点得中', () => {
    const bounds = getTextBounds(text({ width: 4, height: 4 }), canvas());
    expect(bounds.width).toBeGreaterThanOrEqual(50);
  });

  it('只给 width 没给 height 按点文本量，不当成段落', () => {
    const bounds = getTextBounds(text({ width: 123, content: '很长很长很长很长的一段文字' }), canvas());
    expect(bounds.width).not.toBe(123);
  });

  it('点文本至少有 50px 宽的命中区', () => {
    const bounds = getTextBounds(text({ content: '' }), canvas());
    expect(bounds.width).toBeGreaterThanOrEqual(50);
  });

  it('空文本也有至少一行高，否则新建的空文字层点不中', () => {
    const bounds = getTextBounds(text({ content: '' }), canvas());
    expect(bounds.height).toBeGreaterThanOrEqual(BASE.fontSize);
  });

  it('单行高度不小于字号', () => {
    const bounds = getTextBounds(text(), canvas());
    expect(bounds.height).toBeGreaterThanOrEqual(BASE.fontSize);
  });

  it('多行比单行高', () => {
    const single = getTextBounds(text({ content: '一行' }), canvas());
    const triple = getTextBounds(text({ content: '一行\n二行\n三行' }), canvas());
    expect(triple.height).toBeGreaterThan(single.height);
  });

  it('行高按行数累加', () => {
    const data = text({ content: 'a\nb\nc' });
    const bounds = getTextBounds(data, canvas());
    expect(bounds.height).toBeCloseTo(3 * data.fontSize * data.lineHeight, 5);
  });

  it('字号为 1 的极端值不会算出 0 尺寸', () => {
    const bounds = getTextBounds(text({ fontSize: 1, content: 'x' }), canvas());
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('末尾换行产生的空行也计入高度', () => {
    const withoutBreak = getTextBounds(text({ content: 'a' }), canvas());
    const withBreak = getTextBounds(text({ content: 'a\n' }), canvas());
    expect(withBreak.height).toBeGreaterThan(withoutBreak.height);
  });
});

describe('getTextBounds 不污染调用方的 canvas 状态', () => {
  it('量完文字后 ctx.font 还是调用方设的值', () => {
    const element = canvas();
    const context = ctx2d(element);
    context.font = '400 11px "monospace"';

    getTextBounds(text({ fontSize: 99, fontFamily: 'serif' }), element);

    expect(context.font).toBe('400 11px "monospace"');
  });
});

describe('renderText', () => {
  // 先扫再断言，不在循环里调 expect：几万次 expect 的开销能把用例拖到超时
  it('渲染后画布上没有 NaN 残留', () => {
    const element = canvas();
    renderText(element, text());

    expect(hasNaN(element)).toBe(false);
  });

  it('多行加下划线也不产生 NaN', () => {
    const element = canvas();
    renderText(element, text({ content: 'a\nb\nc', underline: true, letterSpacing: 2 }));

    expect(hasNaN(element)).toBe(false);
  });

  it('字号为 1、行高小于 1 的极端值不产生 NaN', () => {
    const element = canvas();
    renderText(element, text({ fontSize: 1, lineHeight: 0.5, content: 'x\ny' }));

    expect(hasNaN(element)).toBe(false);
  });

  /*
   * 反复编辑同一个文字层时靠这一条保证不会残留上一版的字。
   * renderText 每次都先 clearCanvas，所以「长内容改成短内容」不会留下尾巴。
   */
  it('重画时先清空，长内容改短不留残影', () => {
    const element = canvas();
    renderText(element, text({ content: '很长很长很长的一段文字' }));
    const longPixels = countOpaque(element);

    renderText(element, text({ content: '短' }));
    const shortPixels = countOpaque(element);

    // 无字体环境下两者都是 0，结论仍然成立（不会变多）
    expect(shortPixels).toBeLessThanOrEqual(longPixels);
  });

  it('内容清空后画布回到全透明', () => {
    const element = canvas();
    renderText(element, text({ content: '有字' }));
    renderText(element, text({ content: '' }));

    expect(countOpaque(element)).toBe(0);
  });

  it('空内容不抛错', () => {
    expect(() => renderText(canvas(), text({ content: '' }))).not.toThrow();
  });

  it('1×1 画布不抛错', () => {
    expect(() => renderText(canvas(1, 1), text())).not.toThrow();
  });

  it('多行内容不抛错', () => {
    expect(() => renderText(canvas(), text({ content: 'a\nb\nc' }))).not.toThrow();
  });

  it('带下划线不抛错', () => {
    expect(() => renderText(canvas(), text({ underline: true }))).not.toThrow();
  });

  it('三种对齐方式都不抛错', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      expect(() => renderText(canvas(), text({ align }))).not.toThrow();
    }
  });
});

describe('renderText 段落文本', () => {
  const para = (patch: Partial<TextData> = {}) => text({ width: 120, height: 90, ...patch });

  /*
   * canvas 尺寸必须等于边界框尺寸：图层按 (x, y) 贴图，尺寸一旦不等
   * 提交后整块文字就会错位 —— 这正是「确认编辑后位置变了」的成因之一。
   */
  it('canvas 尺寸等于边界框尺寸', () => {
    const element = canvas(10, 10);
    renderText(element, para({ width: 120, height: 90 }));

    expect(element.width).toBe(120);
    expect(element.height).toBe(90);
  });

  it('边界框尺寸带小数时向下取整成整数像素，不留 0 尺寸', () => {
    const element = canvas();
    renderText(element, para({ width: 120.7, height: 90.2 }));

    expect(Number.isInteger(element.width)).toBe(true);
    expect(element.width).toBeGreaterThan(0);
    expect(element.height).toBeGreaterThan(0);
  });

  it('长内容自动折行后不产生 NaN', () => {
    const element = canvas();
    renderText(element, para({ content: '一二三四五六七八九十'.repeat(4), underline: true }));

    expect(hasNaN(element)).toBe(false);
  });

  it('内容远超边界框高度也不抛错（多余部分靠 clip 裁掉）', () => {
    const data = para({ height: 40, content: 'a\nb\nc\nd\ne\nf\ng' });
    expect(() => renderText(canvas(), data)).not.toThrow();
  });

  it('宽高为 1 的极端边界框不抛错', () => {
    expect(() => renderText(canvas(), para({ width: 1, height: 1, content: '字' }))).not.toThrow();
  });
});

/** 统计不透明像素数 */
function countOpaque(element: HTMLCanvasElement): number {
  const data = ctx2d(element).getImageData(0, 0, element.width, element.height).data;
  let count = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) count += 1;
  }
  return count;
}
