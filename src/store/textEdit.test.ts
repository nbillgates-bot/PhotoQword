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
import { ctx2d } from '../engine/canvasUtils';

/**
 * 文字编辑期间的状态契约。
 *
 * 编辑中画面上显示的是 TextEditor 的 textarea，图层本身被 CanvasArea 过滤掉不参与合成。
 * 所以「改草稿」和「落像素」必须是两个动作：
 * 每次按键都渲染一遍 canvas 纯属浪费，还会让编辑器和图层同时显示同一段文字（重影）。
 */

const store = () => useEditorStore.getState();

const TEXT: TextData = {
  content: '初始',
  fontFamily: 'sans-serif',
  fontSize: 24,
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

/** 造一个进入编辑态的文字图层，返回 id */
function editingTextLayer(data: Partial<TextData> = {}): string {
  /*
   * 内容清空时图层名退回默认值，而默认值按界面语言取（I18N.md §3）。
   * 不钉死语言的话断言会跟着跑测试机器的浏览器语言变（jsdom 给的是 en-US）。
   */
  store().setLocale('zh-CN');
  store().createDoc({ name: '测试', width: 120, height: 80, background: 'white' });
  const layer = store().addLayer('text', '文字')!;
  store().updateLayer(layer.id, { textData: { ...TEXT, ...data } });
  store().enterTextEdit(layer.id);
  return layer.id;
}

const layerById = (id: string) => store().layers.find((item) => item.id === id)!;

beforeEach(() => {
  store().closeDoc();
});

describe('updateTextDraft 只改数据不动像素', () => {
  it('写入新内容', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '改过了' });

    expect(layerById(id).textData!.content).toBe('改过了');
  });

  it('不 bumpRevision，避免每次按键触发重合成', () => {
    const id = editingTextLayer();
    const before = store().revision;

    store().updateTextDraft(id, { content: 'abc' });

    expect(store().revision).toBe(before);
  });

  it('图层名跟着内容走', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '标题文字' });

    expect(layerById(id).name).toBe('标题文字');
  });

  it('图层名最多取 12 个字符', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '一二三四五六七八九十十一十二' });

    expect(layerById(id).name).toHaveLength(12);
  });

  it('内容清空时图层名退回默认值', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '有内容' });
    store().updateTextDraft(id, { content: '' });

    expect(layerById(id).name).toBe('文字');
  });

  it('只有空白字符也算空', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '   \n  ' });

    expect(layerById(id).name).toBe('文字');
  });

  it('不写历史，编辑过程不该塞满撤销栈', () => {
    const id = editingTextLayer();
    const before = store().history.length;

    store().updateTextDraft(id, { content: 'a' });
    store().updateTextDraft(id, { content: 'ab' });
    store().updateTextDraft(id, { content: 'abc' });

    expect(store().history).toHaveLength(before);
  });

  it('不是文字图层时什么都不做', () => {
    store().createDoc({ name: '测试', width: 64, height: 64, background: 'white' });
    const raster = store().layers[0];

    expect(() => store().updateTextDraft(raster.id, { content: 'x' })).not.toThrow();
    expect(raster.textData).toBeUndefined();
  });

  it('图层 id 不存在时什么都不做', () => {
    editingTextLayer();
    expect(() => store().updateTextDraft('nope', { content: 'x' })).not.toThrow();
  });
});

describe('exitTextEdit 提交编辑', () => {
  it('清掉编辑标记', () => {
    editingTextLayer();
    store().exitTextEdit();

    expect(store().editingTextLayer).toBeNull();
  });

  it('把草稿落到像素上（bumpRevision）', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '提交' });
    const before = store().revision;

    store().exitTextEdit();

    expect(store().revision).toBeGreaterThan(before);
  });

  it('压一条历史', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '提交' });
    const before = store().history.length;

    store().exitTextEdit();

    expect(store().history).toHaveLength(before + 1);
  });

  /*
   * 顺序很关键：编辑标记必须先清掉再落像素。
   * 反过来的话 CanvasArea 那一轮合成仍然把该图层过滤在外，
   * 渲染完了画面上却什么都看不见。
   */
  it('落像素时编辑标记已经清掉', () => {
    const id = editingTextLayer();
    store().updateTextDraft(id, { content: '提交' });

    let markAtBump: string | null = 'not-observed';
    let previous = useEditorStore.getState().revision;
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (state.revision !== previous) {
        previous = state.revision;
        if (markAtBump === 'not-observed') markAtBump = state.editingTextLayer;
      }
    });

    store().exitTextEdit();
    unsubscribe();

    expect(markAtBump).toBeNull();
  });

  it('没在编辑时是空操作，不压历史', () => {
    store().createDoc({ name: '测试', width: 64, height: 64, background: 'white' });
    const before = store().history.length;

    store().exitTextEdit();

    expect(store().history).toHaveLength(before);
    expect(store().editingTextLayer).toBeNull();
  });

  it('提交后撤销能退回编辑前的内容', () => {
    const id = editingTextLayer({ content: '原文' });
    store().pushHistory('准备');
    store().updateTextDraft(id, { content: '新文' });
    store().exitTextEdit();

    store().undo();

    expect(layerById(id).textData!.content).toBe('原文');
  });
});

describe('关文档时清掉文字编辑状态', () => {
  it('editingTextLayer 归零，不会指向已消失的图层', () => {
    editingTextLayer();
    expect(store().editingTextLayer).not.toBeNull();

    store().closeDoc();

    expect(store().editingTextLayer).toBeNull();
  });

  it('textDragRect 归零', () => {
    editingTextLayer();
    store().setTextDragRect({ x: 1, y: 2, width: 3, height: 4 });

    store().closeDoc();

    expect(store().textDragRect).toBeNull();
  });
});

/*
 * hint 是性能契约。不点名的话 pushHistory 会把每个图层都 getImageData 全幅再逐字节 diff，
 * 90 层的 PSD 里编辑一次文字光扫描就要 190ms，用户能明显感觉到卡。
 * 编辑文字只动了这一个图层的像素，所以必须点名。
 */
describe('退出文字编辑时点名改动的图层', () => {
  it('不扫其他图层：别人未入历史的像素改动不会被顺手记走', () => {
    /*
     * 判定方式是行为而不是「pushHistory 收到了什么参数」。
     * 底下那层的像素改过但没压历史，带 hint 的这一步不会扫它，
     * 所以撤销后它仍然是红的；不带 hint 就会被扫进去，撤销直接抹回白色。
     */
    const id = editingTextLayer({ content: '原文' });
    const base = store().layers.find((item) => item.id !== id)!;
    const context = ctx2d(base.canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 4, 4);

    store().updateTextDraft(id, { content: '新文' });
    store().exitTextEdit();
    store().undo();

    const after = ctx2d(base.canvas).getImageData(0, 0, 1, 1).data;
    expect([after[0], after[1], after[2], after[3]]).toEqual([255, 0, 0, 255]);
  });

  it('点名之后像素增量照常记录，撤销能把像素抹回去', () => {
    const id = editingTextLayer({ content: '原文' });
    // 先落一次像素并存基线，否则 undo 回到的是「新建图层」那步（那时还没有 textData）
    store().updateTextLayer(id, {});
    store().pushHistory('准备', { layerIds: [id] });
    const before = snapshotPixels(id);

    store().updateTextDraft(id, { content: '完全不一样的新文字内容' });
    store().exitTextEdit();
    const after = snapshotPixels(id);

    store().undo();

    // hint 点错图层的代价就是像素回不来，这条钉住它
    expect(snapshotPixels(id)).toEqual(before);
    // 前提是这次编辑真的改了像素，否则上面那条断言是空转
    expect(after).not.toEqual(before);
  });
});

/** 图层像素的可比较快照 */
function snapshotPixels(id: string): number[] {
  const layer = layerById(id);
  const data = ctx2d(layer.canvas).getImageData(0, 0, layer.canvas.width, layer.canvas.height).data;
  return [...data];
}

/*
 * 报的第二个 bug：PSD 文字层一进编辑位置就跳。
 *
 * 根因：PSD 的文字层画布只有一小块（例如 80×24），bounds 在 (left, top) 例如 (100, 200)。
 * renderText 对点文本的落笔是文档坐标 (data.x, data.y)，这意味着画布必须覆盖全文档。
 * 可自己新建的文字层画布本来就是文档尺寸，一直没暴露这个隐患。
 *
 * updateTextDraft 原本直接用 byId 拿图层、不做 expandLayerForEdit，于是：
 * 1. 按文档坐标落笔到小画布上 → 多偏移一次，甚至画到画布外
 * 2. textLayerBounds 把点文本的 bounds 归零到 (0,0) → 整个外框平移
 *
 * 正确做法是和 updateTextLayer 一样，先 expandLayerForEdit、再 renderText。
 */
describe('PSD 导入的小画布文字层', () => {
  it('updateTextDraft 时不跳位', () => {
    store().createDoc({ name: 'test', width: 300, height: 400, background: 'white' });

    // 仿造一个 PSD 导入的小画布文字层：画布 80×30，bounds.x/y = (100, 200)
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 30;
    const layer = store().insertLayer('text', 'PSD 文字')!;
    const textData: TextData = {
      ...TEXT,
      content: 'Hello',
      x: 150,
      y: 220,
      width: undefined,
      height: undefined,
    };
    store().updateLayer(layer.id, { canvas, bounds: { x: 100, y: 200, width: 80, height: 30 }, textData });

    // 进入编辑态、改一次草稿
    store().enterTextEdit(layer.id);
    store().updateTextDraft(layer.id, { content: 'Hello world' });

    const result = layerById(layer.id);
    // 文字还在文档坐标 (150, 220)，没跳到 (0,0) 或其他鬼地方
    expect(result.textData!.x).toBe(150);
    expect(result.textData!.y).toBe(220);
    // 画布已经长成文档尺寸，可以装下文档坐标
    expect(result.canvas.width).toBe(300);
    expect(result.canvas.height).toBe(400);
    // 点文本的 bounds 归零到 (0,0)
    expect(result.bounds.x).toBe(0);
    expect(result.bounds.y).toBe(0);
  });
});
