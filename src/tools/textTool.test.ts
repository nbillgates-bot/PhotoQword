/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { textTool } from './textTool';
import { click, context, drag, newDoc, pixelAt, pointer, reset, store } from './testKit';
import { DEFAULT_TEXT, renderText } from '../engine/textRender';
import { contentRect } from '../engine/layerBounds';
import { createCanvas, ctx2d } from '../engine/canvasUtils';
import type { Rect } from '../types';

beforeEach(() => {
  reset(textTool);
});

describe('文字工具新建图层', () => {
  it('在空白处单击新建文字图层', () => {
    newDoc(64, 64);
    const before = store().layers.length;
    click(textTool, pointer(10, 20));

    expect(store().layers).toHaveLength(before + 1);
    const layer = store().activeLayer()!;
    expect(layer.type).toBe('text');
    expect(layer.textData).toBeTruthy();
  });

  it('新建文字图层并进入编辑模式', () => {
    newDoc(64, 64);
    click(textTool, pointer(10, 20));

    const layer = store().activeLayer()!;
    expect(layer.textData).toMatchObject({ x: 10, y: 20, content: '' });
    expect(store().editingTextLayer).toBe(layer.id);
  });

  it('文字颜色取当前前景色', () => {
    newDoc(64, 64);
    store().setForeground('#ff0000');
    click(textTool, pointer(10, 20));

    expect(store().activeLayer()!.textData!.color).toBe('#ff0000');
  });

  it('退出编辑时压一条历史，可以撤销掉新建的文字图层', () => {
    newDoc(64, 64);
    const before = store().layers.length;
    click(textTool, pointer(10, 20));
    store().exitTextEdit();
    store().undo();

    expect(store().layers).toHaveLength(before);
  });

  it('没有文档时什么都不做', () => {
    click(textTool, pointer(10, 20));
    expect(store().layers).toHaveLength(0);
  });
});

describe('点在已有文字上时选中而不是新建', () => {
  /** 造一个已渲染好的文字图层，返回其 id */
  function existingText(x: number, y: number): string {
    const layer = store().addLayer('text', '已有文字')!;
    const textData = {
      content: '已有文字',
      fontFamily: 'sans-serif',
      fontSize: 32,
      fontWeight: 400,
      bold: false,
      italic: false,
      underline: false,
      align: 'left' as const,
      color: '#000000',
      lineHeight: 1.2,
      letterSpacing: 0,
      x,
      y,
    };
    renderText(layer.canvas, textData);
    store().updateLayer(layer.id, { textData });
    return layer.id;
  }

  /**
   * 造一个 PSD 进来那种形态的文字层：画布只有像素那一小块（不铺满文档），
   * 位置由 rect 给，而 textData 的落笔点另在 (x, y) —— 两者不重合正是 PSD 常态。
   */
  function psdLikeText(x: number, y: number, rect: Rect): string {
    const layer = store().addLayer('text', 'PSD 文字')!;
    const canvas = createCanvas(rect.width, rect.height);
    const context = ctx2d(canvas);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, rect.width, rect.height);
    store().updateLayer(layer.id, {
      canvas,
      bounds: { ...rect },
      // 字号取小，好让重排框和像素块之间留出一片明确的空白
      textData: { ...DEFAULT_TEXT, content: 'P', fontSize: 12, x, y },
    });
    return layer.id;
  }

  /** 在图层上找一个不透明像素，找不到就返回 null */
  function opaquePoint(layerId: string): { x: number; y: number } | null {
    const canvas = store().layers.find((item) => item.id === layerId)!.canvas;
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) {
        const index = (i - 3) / 4;
        return { x: index % canvas.width, y: Math.floor(index / canvas.width) };
      }
    }
    return null;
  }

  it('命中不透明笔画时选中该图层，图层数不变', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);
    const hit = opaquePoint(id);
    // 无字体环境下可能渲染不出像素，那种情况这条断言无意义，跳过
    if (!hit) return;

    store().setActiveLayer(store().layers[0].id);
    const before = store().layers.length;
    click(textTool, pointer(hit.x, hit.y));

    expect(store().layers).toHaveLength(before);
    expect(store().activeLayerId).toBe(id);
  });

  it('命中后进入编辑模式', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);
    const hit = opaquePoint(id);
    if (!hit) return;

    click(textTool, pointer(hit.x, hit.y));
    expect(store().editingTextLayer).toBe(id);
  });

  it('点在文字边界框之外才新建图层', () => {
    newDoc(120, 80);
    existingText(10, 40);
    const before = store().layers.length;
    // y=5 在文字顶边（y=40）之上，无论字体怎么量都落在框外
    click(textTool, pointer(100, 5));

    expect(store().layers).toHaveLength(before + 1);
  });

  /*
   * 与 PS 一致：文字工具的命中范围是整个文字边界框，不是不透明笔画。
   * 字与字之间、行尾留白处点下去照样进入编辑，不会叠一个新文字层出来。
   */
  it('点在边界框内的透明处也编辑已有图层，不新建', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);
    const before = store().layers.length;
    /*
     * 文字右下角内侧：在边界框内，但远离字形笔画。
     * 这个点按旧的「像素 alpha > 0」判法必然落空，能区分两种命中语义。
     */
    const at = { x: 118, y: 77 };
    const canvas = store().layers.find((item) => item.id === id)!.canvas;
    expect(pixelAt(canvas, at.x, at.y)[3]).toBe(0);

    click(textTool, pointer(at.x, at.y));

    expect(store().layers).toHaveLength(before);
    expect(store().editingTextLayer).toBe(id);
  });

  it('多个文字图层重叠时选中最上面那个', () => {
    newDoc(120, 80);
    const lower = existingText(10, 40);
    const upper = existingText(10, 40);
    const hit = opaquePoint(upper);
    if (!hit) return;

    click(textTool, pointer(hit.x, hit.y));
    expect(store().activeLayerId).toBe(upper);
    expect(store().activeLayerId).not.toBe(lower);
  });

  /*
   * 报的 bug：点的是一个文字，进编辑的却是另一个文字图层。
   *
   * 上面那层是 PSD 进来的形态——像素在右下角一小块，我们按 textData 重排出来的
   * 框却落在左上角。旧代码把两块并成一个大矩形，中间几十像素的空白也算它命中，
   * 于是它把底下那层文字的点击整片吃掉了。命中范围只该是这两块本身。
   */
  it('上层文字的重排框与像素块隔着空白时，不抢底下那层的点击', () => {
    newDoc(120, 80);
    const lower = existingText(25, 40);
    const upper = psdLikeText(0, 0, { x: 92, y: 60, width: 28, height: 20 });

    /*
     * (70,55) 在底层文字的框内；对上层来说，它既在重排框（0,0 起，约 50×15）之外，
     * 也在像素块（92,60 起）之外，只落在旧代码那个并集（整幅 120×80）里。
     */
    click(textTool, pointer(70, 55));

    expect(store().activeLayerId).toBe(lower);
    expect(store().editingTextLayer).toBe(lower);
    expect(store().activeLayerId).not.toBe(upper);
  });

  /*
   * 回归用例：重新编辑必须等到 pointerup 才进编辑模式。
   *
   * 在 pointerdown 里就 enterTextEdit 的话，TextEditor 挂载并 focus 之后，
   * 紧随其后的 pointerup / click 落在下层 viewport 上把焦点抢回去，
   * textarea 立刻 blur 触发 exitTextEdit —— 现象是「点已有文字没反应」。
   */
  it('按下已有文字时先只选中，不进编辑模式', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);
    const ctx = context();

    textTool.onPointerDown?.(pointer(20, 50), ctx);

    expect(store().activeLayerId).toBe(id);
    expect(store().editingTextLayer).toBeNull();
  });

  it('抬起后才进入编辑模式', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);
    const ctx = context();

    textTool.onPointerDown?.(pointer(20, 50), ctx);
    textTool.onPointerUp?.(pointer(20, 50), ctx);

    expect(store().editingTextLayer).toBe(id);
  });

  it('命中已有文字时不留下拖拽框', () => {
    newDoc(120, 80);
    existingText(10, 40);
    const ctx = context();

    textTool.onPointerDown?.(pointer(20, 50), ctx);
    textTool.onPointerMove?.(pointer(90, 70), ctx);
    textTool.onPointerUp?.(pointer(90, 70), ctx);

    expect(store().textDragRect).toBeNull();
  });

  it('连续两次编辑同一个文字层都能进入编辑模式', () => {
    newDoc(120, 80);
    const id = existingText(10, 40);

    click(textTool, pointer(20, 50));
    expect(store().editingTextLayer).toBe(id);
    store().exitTextEdit();
    expect(store().editingTextLayer).toBeNull();

    // 第二次点同一处，仍然要能进去（用户报的就是这一步失效）
    click(textTool, pointer(20, 50));
    expect(store().editingTextLayer).toBe(id);
  });
});

describe('拖拽创建段落文本', () => {
  it('拖出矩形时实时更新拖拽框', () => {
    newDoc(200, 200);
    const ctx = context();

    textTool.onPointerDown?.(pointer(20, 30), ctx);
    textTool.onPointerMove?.(pointer(120, 90), ctx);

    expect(store().textDragRect).toEqual({ x: 20, y: 30, width: 100, height: 60 });
  });

  it('反向拖拽（右下往左上）也得到正规化的矩形', () => {
    newDoc(200, 200);
    const ctx = context();

    textTool.onPointerDown?.(pointer(120, 90), ctx);
    textTool.onPointerMove?.(pointer(20, 30), ctx);

    expect(store().textDragRect).toEqual({ x: 20, y: 30, width: 100, height: 60 });
  });

  it('抬起后清掉拖拽框', () => {
    newDoc(200, 200);
    drag(textTool, pointer(20, 30), pointer(120, 90));

    expect(store().textDragRect).toBeNull();
  });

  it('拖拽创建的是带宽度的段落文本，原点取矩形左上角', () => {
    newDoc(200, 200);
    drag(textTool, pointer(20, 30), pointer(120, 90));

    const data = store().activeLayer()!.textData!;
    expect(data.width).toBe(100);
    expect(data).toMatchObject({ x: 20, y: 30 });
  });

  it('单击创建的是点文本，没有宽度限制', () => {
    newDoc(200, 200);
    click(textTool, pointer(20, 30));

    expect(store().activeLayer()!.textData!.width).toBeUndefined();
  });

  /*
   * 点文本的墨迹落在 canvas 本地 (data.x, data.y)，所以 bounds 原点必须留在 (0,0)，
   * 本地坐标此时就等于文档坐标（见 engine/textBox.ts）。
   * 曾经这里跟段落文本一样用 (data.x, data.y) 当原点，位移被叠加两次，
   * 单击 (20,30) 打出来的字落到了文档 (40,60)。
   */
  it('点文本的 bounds 原点留在 (0,0)，墨迹落在单击处', () => {
    newDoc(200, 200);
    click(textTool, pointer(20, 30));
    const layer = store().activeLayer()!;
    store().updateTextLayer(layer.id, { content: 'Hi' });

    const after = store().activeLayer()!;
    expect(after.bounds).toMatchObject({ x: 0, y: 0 });
    const ink = contentRect(after)!;
    // 左侧留一点字形的 side bearing，但不该差出一个 20px 量级
    expect(ink.x).toBeGreaterThanOrEqual(20);
    expect(ink.x).toBeLessThan(30);
  });

  it('段落文本的 bounds 原点是拖出来的矩形左上角', () => {
    newDoc(400, 400);
    drag(textTool, pointer(20, 30), pointer(220, 230));

    expect(store().activeLayer()!.bounds).toMatchObject({ x: 20, y: 30 });
  });

  it('位移不足 3px 视为单击，仍然是点文本', () => {
    newDoc(200, 200);
    drag(textTool, pointer(20, 30), pointer(21, 31));

    const data = store().activeLayer()!.textData!;
    expect(data.width).toBeUndefined();
    expect(data).toMatchObject({ x: 20, y: 30 });
  });

  it('拖拽后同样进入编辑模式', () => {
    newDoc(200, 200);
    drag(textTool, pointer(20, 30), pointer(120, 90));

    expect(store().editingTextLayer).toBe(store().activeLayerId);
  });

  it('切走工具时清掉未提交的拖拽框', () => {
    newDoc(200, 200);
    const ctx = context();
    textTool.onPointerDown?.(pointer(20, 30), ctx);
    textTool.onPointerMove?.(pointer(120, 90), ctx);
    expect(store().textDragRect).not.toBeNull();

    textTool.onDeactivate?.(ctx);

    expect(store().textDragRect).toBeNull();
  });

  it('中断拖拽后再单击，不会沿用上一次的起点', () => {
    newDoc(200, 200);
    const ctx = context();
    // 拖到一半被切走
    textTool.onPointerDown?.(pointer(20, 30), ctx);
    textTool.onPointerMove?.(pointer(120, 90), ctx);
    textTool.onDeactivate?.(ctx);

    click(textTool, pointer(70, 70));

    const data = store().activeLayer()!.textData!;
    expect(data).toMatchObject({ x: 70, y: 70 });
    expect(data.width).toBeUndefined();
  });
});
