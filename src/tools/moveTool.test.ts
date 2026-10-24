/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from './moveTool';
import { context, drag, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';
import { contentRect } from '../engine/layerBounds';
import { flatten } from '../engine/compositor';

beforeEach(() => {
  reset(moveTool);
});

/** 在活动图层上画一个 4×4 红块，左上角在 (2,2) */
function redBlock(): void {
  const canvas = store().activeLayer()!.canvas;
  const context2d = ctx2d(canvas);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(2, 2, 4, 4);
  store().bumpRevision();
}

/** 取合成后的文档坐标，不直接读图层画布（图层现在可能有偏移了） */
function isRed(x: number, y: number): boolean {
  const doc = store().doc;
  if (!doc) return false;
  const out = flatten(store().layers, doc.width, doc.height);
  const [r, g, , a] = [...ctx2d(out).getImageData(x, y, 1, 1).data];
  return a > 200 && r > 200 && g < 80;
}

describe('移动图层像素', () => {
  it('拖拽把像素整体平移到新位置', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    expect(isRed(3, 3)).toBe(true);

    drag(moveTool, pointer(3, 3), pointer(9, 9));

    expect(isRed(3, 3)).toBe(false);
    expect(isRed(9, 9)).toBe(true);
  });

  it('连续拖回原处像素完好，因为每次都从快照重画', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    const doc = store().doc!;
    const original = ctx2d(flatten(store().layers, doc.width, doc.height)).getImageData(3, 3, 1, 1).data;

    const ctx = context();
    moveTool.onPointerDown?.(pointer(3, 3), ctx);
    moveTool.onPointerMove?.(pointer(9, 9), ctx);
    moveTool.onPointerMove?.(pointer(6, 6), ctx);
    moveTool.onPointerMove?.(pointer(3, 3), ctx);
    moveTool.onPointerUp?.(pointer(3, 3), ctx);

    // 偏移归零，像素应与出发时完全一致，不因反复取样而变淡或发虚
    const restored = ctx2d(flatten(store().layers, doc.width, doc.height)).getImageData(3, 3, 1, 1).data;
    for (let i = 0; i < 4; i += 1) expect(restored[i]).toBe(original[i]);
  });

  it('偏移取整，不产生半像素模糊', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();

    drag(moveTool, pointer(3, 3), pointer(9.4, 3));
    // 位移 6.4 取整为 6，红块左边界从 2 移到 8
    expect(isRed(8, 3)).toBe(true);
  });

  it('shift 约束到位移较大的那个轴', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();

    drag(moveTool, pointer(3, 3), pointer(9, 5, { shiftKey: true }));
    // dx=6 > dy=2，纵向被清零：红块横移到 x 8..11，纵向仍是 y 2..5
    expect(isRed(9, 2)).toBe(true);
    expect(isRed(9, 6)).toBe(false);
  });

  it('纵向位移更大时改锁纵轴', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();

    drag(moveTool, pointer(3, 3), pointer(5, 9, { shiftKey: true }));
    // dy=6 > dx=2，横向被清零：红块纵移到 y 8..11，横向仍是 x 2..5
    expect(isRed(2, 9)).toBe(true);
    expect(isRed(6, 9)).toBe(false);
  });
});

describe('历史与锁定', () => {
  it('真的移动了才压历史', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    const before = store().history.length;

    drag(moveTool, pointer(3, 3), pointer(9, 9));
    expect(store().history.length).toBe(before + 1);
  });

  it('零偏移不压历史，避免点一下就多一条记录', () => {
    newDoc();
    store().addLayer('raster', '内容');
    const before = store().history.length;

    drag(moveTool, pointer(5, 5), pointer(5, 5));
    expect(store().history.length).toBe(before);
  });

  it('移动可撤销', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    store().pushHistory('画红块');

    drag(moveTool, pointer(3, 3), pointer(9, 9));
    expect(isRed(9, 9)).toBe(true);

    store().undo();
    expect(isRed(3, 3)).toBe(true);
    expect(isRed(9, 9)).toBe(false);
  });

  it('图层锁定时不起会话并提示', () => {
    const id = newDoc();
    store().updateLayer(id, { locked: true });
    const before = store().history.length;

    drag(moveTool, pointer(3, 3), pointer(9, 9));
    expect(store().toast?.kind).toBe('error');
    expect(store().history.length).toBe(before);
  });

  it('工具切走时会话被丢弃，抬手不再压历史', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    const before = store().history.length;

    const ctx = context();
    moveTool.onPointerDown?.(pointer(3, 3), ctx);
    moveTool.onPointerMove?.(pointer(9, 9), ctx);
    moveTool.onDeactivate?.(ctx);
    moveTool.onPointerUp?.(pointer(9, 9), ctx);

    expect(store().history.length).toBe(before);
  });

  it('没有图层时不报错', () => {
    expect(() => drag(moveTool, pointer(3, 3), pointer(9, 9))).not.toThrow();
  });
});

describe('可再编辑数据跟着一起走', () => {
  it('文字图层的坐标同步更新', () => {
    newDoc(64, 64);
    const layer = store().addLayer('text', '文字')!;
    store().updateLayer(layer.id, {
      textData: {
        content: '文字',
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
        x: 10,
        y: 10,
      },
    });

    drag(moveTool, pointer(10, 10), pointer(15, 18));

    const textData = store().activeLayer()!.textData!;
    expect(textData.x).toBe(15);
    expect(textData.y).toBe(18);
  });

  /*
   * 点文本的落笔基准是 canvas 本地 (data.x, data.y)，bounds 原点必须留在 (0,0)
   * （见 engine/textBox.ts）。移动时只改 data 不重画的话，bounds 会带着位移，
   * 下一次重画就把位移叠加第二次——移两次墨迹会跑到 (2Δ) 去。
   */
  it('移动点文本后重画一次，位移不会被叠加两次', () => {
    newDoc(200, 200);
    const layer = store().addLayer('text', '文字')!;
    // addLayer 不带 textData，先塞进去，再走 updateTextLayer 真渲染一次
    store().updateLayer(layer.id, {
      textData: {
        content: 'Hi',
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
        x: 10,
        y: 10,
      },
    });
    store().updateTextLayer(layer.id, {});
    const before = contentRect(store().activeLayer()!)!;
    expect(before).toBeTruthy();

    drag(moveTool, pointer(10, 10), pointer(40, 30));
    // 任何一次重画都会走 renderText，比如改个字号；这里用空 patch 触发
    store().updateTextLayer(layer.id, {});

    const after = contentRect(store().activeLayer()!)!;
    expect(after.x - before.x).toBe(30);
    expect(after.y - before.y).toBe(20);
  });

  it('形状图层的矩形坐标同步更新，尺寸不变', () => {
    newDoc();
    const layer = store().addLayer('shape', '形状')!;
    store().updateLayer(layer.id, {
      shapeData: {
        kind: 'rect',
        rect: { x: 2, y: 2, width: 6, height: 4 },
        fill: '#ff0000',
        stroke: '#000000',
        strokeWidth: 0,
        filled: true,
        radius: 0,
        points: 5,
      },
    });

    drag(moveTool, pointer(3, 3), pointer(7, 6));

    expect(store().activeLayer()!.shapeData!.rect).toMatchObject({
      x: 6,
      y: 5,
      width: 6,
      height: 4,
    });
  });
});

/*
 * 抬手时的 pushHistory hint。栅格层整场拖拽只动了 bounds，bounds 在 meta 里是
 * 整存的，撤销靠它就够，所以传空 hint 跳过全部图层的整幅 getImageData。
 * 实测 292 层的文档这里原本要 520~950ms。
 *
 * 测的是契约而不是实现：不断言"调了几次 getImageData"，
 * 而是断言「deltas 该空的空、该有的有」+「撤销的结果仍然正确」。
 */
describe('抬手压历史时的扫描范围', () => {
  it('栅格层平移不产生像素增量，撤销靠 bounds 还原', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    store().pushHistory('画红块');

    drag(moveTool, pointer(3, 3), pointer(9, 9));

    const entry = store().history[store().historyIndex];
    expect(entry.label).toBe('action.moveLayer');
    expect(entry.deltas).toHaveLength(0);

    // 空 hint 不能牺牲正确性：撤销后必须回到原位
    store().undo();
    expect(isRed(3, 3)).toBe(true);
    expect(isRed(9, 9)).toBe(false);
    store().redo();
    expect(isRed(9, 9)).toBe(true);
  });

  it('文字层平移会重画像素，增量必须记下来', () => {
    newDoc(200, 200);
    const layer = store().addLayer('text', '文字')!;
    store().updateLayer(layer.id, {
      textData: {
        content: 'Hi',
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
        x: 10,
        y: 10,
      },
    });
    store().updateTextLayer(layer.id, {});
    store().pushHistory('画文字');

    drag(moveTool, pointer(10, 10), pointer(40, 30));

    const entry = store().history[store().historyIndex];
    expect(entry.label).toBe('action.moveLayer');
    // 文字层重画了，被移动的那一层必须出现在增量里
    expect(entry.deltas.map((d) => d.layerId)).toContain(layer.id);

    store().undo();
    expect(store().activeLayer()!.textData!.x).toBe(10);
  });
});

/*
 * 整层平移只改 bounds，一个像素都没动，所以不该自增 pixelRevision。
 *
 * 缩略图挂在 pixelRevision 上：用 bumpRevision 会让全部图层的缩略图缓存失效，
 * 于是每个 pointermove 都要重跑几百次 contentBounds + toDataURL。
 * 这是「放大后拖图层很慢」的主因，而缩略图本身根本不需要变。
 */
describe('拖动图层不触发缩略图重算', () => {
  it('拖动期间 revision 增长，pixelRevision 不变', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    const before = { pixel: store().pixelRevision, visual: store().revision };

    moveTool.onPointerDown?.(pointer(3, 3), context());
    moveTool.onPointerMove?.(pointer(5, 5), context());
    moveTool.onPointerMove?.(pointer(7, 7), context());

    expect(store().pixelRevision).toBe(before.pixel);
    expect(store().revision).toBeGreaterThan(before.visual);
  });

  it('画面确实跟着动了，不是靠不刷新蒙混过去', () => {
    newDoc();
    store().addLayer('raster', '内容');
    redBlock();
    const origin = store().activeLayer()!.bounds.x;

    moveTool.onPointerDown?.(pointer(3, 3), context());
    moveTool.onPointerMove?.(pointer(9, 3), context());

    expect(store().activeLayer()!.bounds.x).toBe(origin + 6);
  });
});
