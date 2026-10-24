/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { createCanvas, ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';
import { translateBounds } from '../engine/layerBounds';
import { createTransformState } from '../engine/transformBox';

/**
 * 图层被移出画布之后，各种以「文档坐标」为输入的操作还得对得上位置。
 * 这一组用例把图层的 bounds 挪开，再验证复制/删除/变换落在正确的像素上。
 */

const store = () => useEditorStore.getState();

function newDoc(width = 16, height = 16) {
  store().createDoc({ width, height, background: 'transparent', name: '偏移测试' });
}

/** 直接改 bounds 模拟「已被移动工具挪过」的图层，不动画布像素 */
function shiftActiveLayer(dx: number, dy: number) {
  const layer = store().activeLayer()!;
  layer.bounds = translateBounds(layer.bounds, dx, dy);
  store().bumpRevision();
}

/** 在活动图层的画布局部坐标里画一块实心方块 */
function paintLocal(x: number, y: number, w: number, h: number, color = '#ff0000') {
  const layer = store().activeLayer()!;
  const context = ctx2d(layer.canvas);
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
  store().bumpRevision();
}

/** 建一个覆盖整个矩形的选区蒙版（文档坐标系） */
function selectRect(x: number, y: number, w: number, h: number) {
  const { doc } = store();
  const mask = createCanvas(doc!.width, doc!.height);
  const context = ctx2d(mask);
  context.fillStyle = '#ffffff';
  context.fillRect(x, y, w, h);
  store().setSelection({ mask, bounds: { x, y, width: w, height: h } });
}

/** 从合成结果里取文档坐标的像素，图层偏移后只有这样读才是对的 */
function docPixel(x: number, y: number): number[] {
  const { doc, layers } = store();
  const flat = flatten(layers, doc!.width, doc!.height);
  return Array.from(ctx2d(flat).getImageData(x, y, 1, 1).data);
}

const isRedAt = (x: number, y: number) => {
  const [r, , , a] = docPixel(x, y);
  return r > 200 && a > 200;
};

function alphaOf(canvas: HTMLCanvasElement, x: number, y: number): number {
  return ctx2d(canvas).getImageData(x, y, 1, 1).data[3];
}

beforeEach(() => {
  store().closeDoc();
  store().setSelection(null);
  store().cancelTransform();
});

describe('自由变换：变换框用文档坐标', () => {
  it('偏移图层开变换时，变换框落在图层内容的实际位置上', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    store().beginTransform();

    /*
     * 图层为了覆盖文档会被撑大，撑出来的一圈是全透明的。
     * 框贴着有像素的那一块（与 PS 一致），所以是内容在文档里的位置，
     * 不是撑大后的画布——8×8 的块挪到 (4,4) 之后就是 {4,4,8,8}。
     */
    expect(store().transformSession!.originalRect).toEqual({ x: 4, y: 4, width: 8, height: 8 });
  });

  it('把变换框原样提交，像素不移位', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    expect(isRedAt(5, 5)).toBe(true);

    store().beginTransform();
    const session = store().transformSession!;
    store().updateTransform(createTransformState({ ...session.originalRect }));
    store().commitTransform();

    // 不动框就等于恒等变换，红块还在文档 (4,4)-(12,12)
    expect(isRedAt(5, 5)).toBe(true);
    expect(isRedAt(11, 11)).toBe(true);
    expect(isRedAt(13, 13)).toBe(false);
  });

  it('平移变换框，像素跟着按文档坐标走', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(2, 2);
    // 红块此时在文档 (2,2)-(6,6)
    store().beginTransform();
    const { originalRect } = store().transformSession!;
    // 框整体右下移 4 → 红块应到 (6,6)-(10,10)
    store().updateTransform(
      createTransformState({
        ...originalRect,
        x: originalRect.x + 4,
        y: originalRect.y + 4,
      }),
    );

    expect(isRedAt(7, 7)).toBe(true);
    expect(isRedAt(3, 3)).toBe(false);
  });

  it('取消变换恢复原状', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(2, 2);

    store().beginTransform();
    const { originalRect } = store().transformSession!;
    store().updateTransform(
      createTransformState({ ...originalRect, x: originalRect.x + 6 }),
    );
    store().cancelTransform();

    expect(isRedAt(3, 3)).toBe(true);
    expect(store().transformSession).toBeNull();
  });

  it('预览后画布里不含 NaN', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(3, 3);
    store().beginTransform();
    const { originalRect } = store().transformSession!;
    store().updateTransform(
      createTransformState({
        ...originalRect,
        width: originalRect.width * 1.5,
        height: originalRect.height * 0.5,
      }),
    );

    const layer = store().activeLayer()!;
    const { data } = ctx2d(layer.canvas).getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });
});

describe('复制：图层偏移后按文档坐标取像素', () => {
  it('取到的是偏移后实际所在位置的内容', () => {
    newDoc(16, 16);
    // 画布局部 (0,0)-(4,4) 涂红，再把图层右下移 8 → 文档里红块在 (8,8)-(12,12)
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(8, 8);
    expect(isRedAt(9, 9)).toBe(true);
    expect(isRedAt(1, 1)).toBe(false);

    selectRect(8, 8, 4, 4);
    store().copySelection();

    const clip = store().clipboard!;
    expect(clip.width).toBe(4);
    expect(clip.height).toBe(4);
    expect(alphaOf(clip, 1, 1)).toBeGreaterThan(200);
  });

  it('选区落在图层挪走后留下的空白处时复制到的是透明', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(8, 8);

    // 原来有内容的地方现在空了
    selectRect(0, 0, 4, 4);
    store().copySelection();

    const clip = store().clipboard!;
    expect(clip.width).toBe(4);
    expect(alphaOf(clip, 1, 1)).toBe(0);
  });

  it('负偏移（移出左上角）同样按实际位置取', () => {
    newDoc(16, 16);
    paintLocal(8, 8, 4, 4);
    shiftActiveLayer(-6, -6);
    // 局部 (8,8) 减去偏移 6 → 文档 (2,2)
    expect(isRedAt(3, 3)).toBe(true);

    selectRect(2, 2, 4, 4);
    store().copySelection();
    expect(alphaOf(store().clipboard!, 1, 1)).toBeGreaterThan(200);
  });

  it('复制结果不含 NaN', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    selectRect(4, 4, 8, 8);
    store().copySelection();

    const { data } = ctx2d(store().clipboard!).getImageData(0, 0, 8, 8);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });
});

describe('删除选区像素：图层偏移后擦对位置', () => {
  it('擦掉的是文档坐标对应的那块', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    // 文档里红块占 (4,4)-(12,12)，只擦右下角 (8,8)-(12,12)
    selectRect(8, 8, 4, 4);
    store().deleteSelectionPixels();

    expect(isRedAt(9, 9)).toBe(false);
    expect(isRedAt(5, 5)).toBe(true);
  });

  it('选区在图层之外时什么都不擦', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 4, 4);
    shiftActiveLayer(8, 8);

    selectRect(0, 0, 4, 4);
    store().deleteSelectionPixels();
    expect(isRedAt(9, 9)).toBe(true);
  });

  it('剪切等于复制加删除，两边位置都对', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    selectRect(8, 8, 4, 4);
    store().cutSelection();

    expect(alphaOf(store().clipboard!, 1, 1)).toBeGreaterThan(200);
    expect(isRedAt(9, 9)).toBe(false);
    expect(isRedAt(5, 5)).toBe(true);
  });

  it('删除后撤销能还原', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    store().pushHistory('画方块');
    shiftActiveLayer(4, 4);
    store().pushHistory('移动');

    selectRect(8, 8, 4, 4);
    store().deleteSelectionPixels();
    expect(isRedAt(9, 9)).toBe(false);

    store().undo();
    expect(isRedAt(9, 9)).toBe(true);
  });

  it('擦除不会在图层里留下 NaN', () => {
    newDoc(16, 16);
    paintLocal(0, 0, 8, 8);
    shiftActiveLayer(4, 4);
    selectRect(8, 8, 4, 4);
    store().deleteSelectionPixels();

    const layer = store().activeLayer()!;
    const { data } = ctx2d(layer.canvas).getImageData(0, 0, layer.canvas.width, layer.canvas.height);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });
});
