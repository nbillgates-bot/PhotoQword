/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import type { TextData } from '../types';

/**
 * 文字上色的三种情形（对齐 PS）：
 * 编辑中选了字 → 只染那几个字；编辑中只有光标 → 记成待用色；
 * 没在编辑 → 改整层基色。
 *
 * 这三条正是用户报的第 1、2 个问题的修复点：前面前景色块跟文字毫无联动，
 * 而改颜色一律染整层。
 */

const store = () => useEditorStore.getState();

const TEXT: TextData = {
  content: '一二三四五',
  fontFamily: 'sans-serif',
  fontSize: 24,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#ff0000',
  lineHeight: 1.2,
  letterSpacing: 0,
  x: 10,
  y: 20,
};

/** 造一个文字图层（已渲染过像素），返回 id */
function textLayer(): string {
  // 图层名的默认值按界面语言取，钉死语言免得断言跟着测试机的 locale 跑
  store().setLocale('zh-CN');
  store().createDoc({ name: '测试', width: 200, height: 100, background: 'white' });
  const layer = store().addLayer('text', '文字')!;
  // addLayer 只建空图层，textData 要自己塞
  store().updateLayer(layer.id, { textData: TEXT });
  store().updateTextLayer(layer.id, {});
  /*
   * 补一次历史，留出一个「文字已存在、还没上色」的可回退点。
   * 真实路径里文字工具建层就会写历史，不补的话撤销会一路退到没有 textData 的
   * 快照上，测的就不是颜色而是建层了。
   */
  store().pushHistory('action.addLayer', { layerIds: [layer.id] });
  return layer.id;
}

/** 取图层当前的 textData */
const dataOf = (id: string) => store().layers.find((item) => item.id === id)!.textData!;

beforeEach(() => {
  store().closeDoc();
});

describe('没在编辑时上色', () => {
  it('改整层基色并清掉颜色段', () => {
    const id = textLayer();
    store().updateTextLayer(id, { colorRuns: [{ start: 0, end: 2, color: '#00ff00' }] });
    store().setActiveLayer(id);

    store().applyTextColor('#0000ff');

    expect(dataOf(id).color).toBe('#0000ff');
    expect(dataOf(id).colorRuns).toEqual([]);
  });

  it('写一条历史', () => {
    const id = textLayer();
    store().setActiveLayer(id);
    const before = store().history.length;
    store().applyTextColor('#0000ff');
    expect(store().history.length).toBe(before + 1);
  });
});

describe('编辑中选了字再上色', () => {
  it('只染选中的那几个字，其余保持基色', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    // 选中「二三」两个字
    store().setTextSelection({ start: 1, end: 3 });

    store().applyTextColor('#00ff00');

    const data = dataOf(id);
    // 基色不动，只多出一段覆盖
    expect(data.color).toBe('#ff0000');
    expect(data.colorRuns).toEqual([{ start: 1, end: 3, color: '#00ff00' }]);
  });

  it('连续给两段不同的字上色，两段都留着', () => {
    const id = textLayer();
    store().enterTextEdit(id);

    store().setTextSelection({ start: 0, end: 1 });
    store().applyTextColor('#00ff00');
    store().setTextSelection({ start: 3, end: 5 });
    store().applyTextColor('#0000ff');

    expect(dataOf(id).colorRuns).toEqual([
      { start: 0, end: 1, color: '#00ff00' },
      { start: 3, end: 5, color: '#0000ff' },
    ]);
  });

  it('全选着上色时基色也跟着改', () => {
    /*
     * 不改基色的话：整段被 runs 盖住看着是新色，但在末尾接着打字，
     * 新字符落在 runs 之外露出旧基色，用户会觉得颜色没生效。
     */
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 0, end: 5 });

    store().applyTextColor('#00ff00');

    expect(dataOf(id).color).toBe('#00ff00');
  });

  it('编辑期间不写历史（退出编辑时才写）', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    const before = store().history.length;
    store().applyTextColor('#00ff00');
    expect(store().history.length).toBe(before);
  });

  it('请求把焦点交还给编辑器', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    const before = store().textFocusRequest;
    store().applyTextColor('#00ff00');
    expect(store().textFocusRequest).toBe(before + 1);
  });
});

describe('编辑中只有光标时上色', () => {
  it('记成待用色，不动已有的字', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 2, end: 2 });

    store().applyTextColor('#00ff00');

    expect(store().pendingTextColor).toBe('#00ff00');
    expect(dataOf(id).colorRuns ?? []).toEqual([]);
    expect(dataOf(id).color).toBe('#ff0000');
  });

  it('之后输入的字用待用色', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 5, end: 5 });
    store().applyTextColor('#00ff00');

    // 在末尾追加一个字
    store().updateTextDraft(id, { content: '一二三四五六' });

    expect(dataOf(id).colorRuns).toEqual([{ start: 5, end: 6, color: '#00ff00' }]);
  });

  it('光标一动待用色就作废', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 2, end: 2 });
    store().applyTextColor('#00ff00');

    store().setTextSelection({ start: 4, end: 4 });

    expect(store().pendingTextColor).toBeNull();
  });
});

describe('内容编辑后颜色跟着字走', () => {
  it('在前面插字时后面的颜色不错位', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 3, end: 5 });
    store().applyTextColor('#00ff00');

    // 在最前面插一个字，绿色本来盖「四五」，插字后应该还盖「四五」
    store().updateTextDraft(id, { content: '零一二三四五' });

    expect(dataOf(id).colorRuns).toEqual([{ start: 4, end: 6, color: '#00ff00' }]);
  });

  it('删掉上色的那段后颜色段消失', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 0, end: 2 });
    store().applyTextColor('#00ff00');

    store().updateTextDraft(id, { content: '三四五' });

    expect(dataOf(id).colorRuns).toEqual([]);
  });
});

describe('撤销重做', () => {
  it('撤销后颜色段回到上色之前', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    store().applyTextColor('#00ff00');
    store().exitTextEdit();

    store().undo();

    expect(dataOf(id).colorRuns ?? []).toEqual([]);
  });

  it('重做后颜色段回来', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    store().applyTextColor('#00ff00');
    store().exitTextEdit();
    store().undo();

    store().redo();

    expect(dataOf(id).colorRuns).toEqual([{ start: 1, end: 3, color: '#00ff00' }]);
  });

  it('历史快照不与当前状态共享同一个数组内容', () => {
    /*
     * historyDelta 对 textData 只做浅拷贝，colorRuns 是按引用共享的。
     * 所有 run 操作都必须返回新数组、绝不就地改 —— 否则改当前状态会把
     * 历史快照一起改掉，撤销就撤不回去了。这条用「再上一次色之后
     * 撤销仍能回到第一次的结果」来证明。
     */
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 0, end: 1 });
    store().applyTextColor('#00ff00');
    store().exitTextEdit();

    store().enterTextEdit(id);
    store().setTextSelection({ start: 3, end: 4 });
    store().applyTextColor('#0000ff');
    store().exitTextEdit();

    store().undo();

    // 回到只有第一段的状态，第二段不该留下
    expect(dataOf(id).colorRuns).toEqual([{ start: 0, end: 1, color: '#00ff00' }]);
  });
});

describe('退出编辑', () => {
  it('清掉选区与待用色', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 1 });
    store().applyTextColor('#00ff00');

    store().exitTextEdit();

    expect(store().textSelection).toBeNull();
    expect(store().pendingTextColor).toBeNull();
  });

  it('颜色段保留到落像素之后', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    store().applyTextColor('#00ff00');

    store().exitTextEdit();

    expect(dataOf(id).colorRuns).toEqual([{ start: 1, end: 3, color: '#00ff00' }]);
  });

  it('落像素后画面上真的有两种颜色', () => {
    const id = textLayer();
    store().enterTextEdit(id);
    store().setTextSelection({ start: 1, end: 3 });
    store().applyTextColor('#00ff00');
    store().exitTextEdit();

    const layer = store().layers.find((item) => item.id === id)!;
    const context = layer.canvas.getContext('2d')!;
    const { data } = context.getImageData(0, 0, layer.canvas.width, layer.canvas.height);

    let red = 0;
    let green = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 250) continue;
      if (data[i] > 200 && data[i + 1] < 60) red += 1;
      if (data[i + 1] > 200 && data[i] < 60) green += 1;
    }
    expect(red).toBeGreaterThan(0);
    expect(green).toBeGreaterThan(0);
  });
});
