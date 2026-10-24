/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { maxCanvasSide } from '../engine/canvasLimits';
import { ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';
import { translateBounds } from '../engine/layerBounds';

/**
 * 显示全部（图像 > 显示全部）：把画布扩到装下所有图层内容。
 * 图层被拖出画布之后，这是把它找回来的标准路径（PS 里也是这一条）。
 */

const store = () => useEditorStore.getState();

function newDoc(width = 16, height = 16) {
  store().createDoc({ width, height, background: 'transparent', name: '显示全部' });
}

/** 在活动图层画布局部坐标里涂一块 */
function paintLocal(x: number, y: number, w: number, h: number) {
  const context = ctx2d(store().activeLayer()!.canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(x, y, w, h);
  store().bumpRevision();
}

/** 直接改 bounds 模拟已被移动过的图层 */
function shiftActiveLayer(dx: number, dy: number) {
  const layer = store().activeLayer()!;
  layer.bounds = translateBounds(layer.bounds, dx, dy);
  store().bumpRevision();
}

function isRedAt(x: number, y: number): boolean {
  const { doc, layers } = store();
  const flat = flatten(layers, doc!.width, doc!.height);
  const [r, , , a] = ctx2d(flat).getImageData(x, y, 1, 1).data;
  return r > 200 && a > 200;
}

beforeEach(() => {
  store().closeDoc();
});

describe('revealAll', () => {
  it('没有文档时什么都不做', () => {
    expect(() => store().revealAll()).not.toThrow();
    expect(store().doc).toBeNull();
  });

  it('内容都在画布内时提示且不改尺寸', () => {
    newDoc(16, 16);
    paintLocal(2, 2, 4, 4);
    store().revealAll();

    expect(store().doc!.width).toBe(16);
    expect(store().toast?.message).toBe('toast.allLayersInsideCanvas');
  });

  it('图层被推到右下时画布向右下扩', () => {
    newDoc(16, 16);
    // 内容在画布局部 (0,0)-(4,4)，图层右下移 20 → 文档坐标 (20,20)-(24,24)
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(20, 20);
    expect(isRedAt(8, 8)).toBe(false);

    store().revealAll();

    // 并集 = (0,0,16,16) ∪ (20,20,4,4) = (0,0,24,24)
    expect(store().doc!.width).toBe(24);
    expect(store().doc!.height).toBe(24);
    // 原点没动，内容仍在 (20,20)，现在落在画布内了
    expect(isRedAt(21, 21)).toBe(true);
  });

  it('图层被推到左上时画布向左上扩，且所有图层一起平移', () => {
    newDoc(16, 16);
    const base = store().activeLayer()!.id;
    // 底图铺满整幅，方便验证它也跟着平移
    paintLocal(0, 0, 16, 16);

    store().addLayer('raster', '内容');
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(-10, -10);

    store().revealAll();

    // 并集 = (-10,-10,4,4) ∪ (0,0,16,16) = (-10,-10,26,26)
    expect(store().doc!.width).toBe(26);
    expect(store().doc!.height).toBe(26);
    // 被移出去的图层现在从原点开始
    expect(store().activeLayer()!.bounds.x).toBe(0);
    // 底图整体右下移了 10，原来的 (0,0) 现在在 (10,10)
    const bottom = store().layers.find((item) => item.id === base)!;
    expect(bottom.bounds.x).toBe(10);
    expect(isRedAt(1, 1)).toBe(true);
  });

  it('一个像素都不重画：画布对象保持同一个', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(20, 0);
    const before = store().activeLayer()!.canvas;

    store().revealAll();
    expect(store().activeLayer()!.canvas).toBe(before);
  });

  it('bounds 的宽高仍等于画布宽高', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(-8, 30);
    store().revealAll();

    for (const layer of store().layers) {
      expect(layer.bounds.width).toBe(layer.canvas.width);
      expect(layer.bounds.height).toBe(layer.canvas.height);
    }
  });

  it('全透明图层不影响并集', () => {
    newDoc(16, 16);
    store().addLayer('raster', '空的');
    shiftActiveLayer(100, 100);

    store().revealAll();
    // 空图层没有内容，不该把画布撑到 116
    expect(store().doc!.width).toBe(16);
  });

  it('撤销能回到原来的画布尺寸与图层位置', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(20, 20);
    store().pushHistory('移动');

    store().revealAll();
    expect(store().doc!.width).toBe(24);

    store().undo();
    expect(store().doc!.width).toBe(16);
    expect(store().activeLayer()!.bounds.x).toBe(20);
  });

  it('并集超出画布上限时报错且不改文档', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    // 只挪 bounds，图层画布仍是 16×16，所以构造这个用例本身不吃内存
    shiftActiveLayer(maxCanvasSide() + 100, 0);

    store().revealAll();

    expect(store().doc!.width).toBe(16);
    expect(store().toast?.kind).toBe('error');
    expect(store().toast?.message).toBe('error.doc.cannotRevealAll');
    // 图层位置也不该被改动，用户还能自己撤销移动
    expect(store().activeLayer()!.bounds.x).toBe(maxCanvasSide() + 100);
  });

  it('1×1 文档也能正常扩', () => {
    newDoc(1, 1);
    paintLocal(0, 0, 1, 1);
    store().addLayer('raster', '偏一格');
    paintLocal(0, 0, 1, 1);
    shiftActiveLayer(1, 1);

    store().revealAll();
    expect(store().doc!.width).toBe(2);
    expect(store().doc!.height).toBe(2);
  });

  it('扩完之后画面里没有 NaN', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(-6, 22);
    store().revealAll();

    const { doc, layers } = store();
    const flat = flatten(layers, doc!.width, doc!.height);
    const { data } = ctx2d(flat).getImageData(0, 0, doc!.width, doc!.height);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });
});
