/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';
import { layerPixels } from '../engine/compositor';

const store = () => useEditorStore.getState();

/** 建一个 8x8 的白底文档并返回其唯一图层 id */
function newDoc(): string {
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

/** 读合成结果某点像素 */
function composed(layerIndex: number, x: number, y: number): number[] {
  const layer = store().layers[layerIndex];
  return [...ctx2d(layerPixels(layer)).getImageData(x, y, 1, 1).data];
}

/** 读蒙版某点灰度 */
function maskAt(id: string, x: number, y: number): number {
  const layer = store().layers.find((item) => item.id === id);
  if (!layer?.mask) throw new Error('该图层没有蒙版');
  return ctx2d(layer.mask).getImageData(x, y, 1, 1).data[0];
}

beforeEach(() => {
  store().closeDoc();
});

describe('addMask', () => {
  it('默认建全白蒙版，画面不变', () => {
    const id = newDoc();
    store().addMask(id);
    expect(maskAt(id, 0, 0)).toBe(255);
    expect(composed(0, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('hide 建全黑蒙版，图层被完全隐藏', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    expect(maskAt(id, 4, 4)).toBe(0);
    expect(composed(0, 4, 4)[3]).toBe(0);
  });

  it('加蒙版后自动把蒙版设为绘制目标', () => {
    const id = newDoc();
    store().addMask(id);
    expect(store().isPaintingMask()).toBe(true);
    expect(store().paintTarget()).toBe(store().layers[0].mask);
  });

  it('已有蒙版时拒绝重复添加并提示', () => {
    const id = newDoc();
    store().addMask(id);
    const before = store().layers[0].mask;
    store().addMask(id);
    expect(store().layers[0].mask).toBe(before);
    expect(store().toast?.kind).toBe('error');
  });

  it('依选区生成时选区内显示、选区外隐藏', () => {
    const id = newDoc();
    // 造一个左半边的选区
    const mask = document.createElement('canvas');
    mask.width = 8;
    mask.height = 8;
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 8);
    store().setSelection({ mask, bounds: { x: 0, y: 0, width: 4, height: 8 } });

    store().addMask(id, 'selection');
    expect(maskAt(id, 1, 1)).toBe(255);
    expect(maskAt(id, 6, 1)).toBe(0);
  });

  it('没有选区时 selection 退化为全白', () => {
    const id = newDoc();
    store().addMask(id, 'selection');
    expect(maskAt(id, 0, 0)).toBe(255);
  });
});

describe('蒙版的历史记录', () => {
  it('添加蒙版可以撤销', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    expect(store().layers[0].mask).toBeTruthy();

    store().undo();
    expect(store().layers[0].mask).toBeUndefined();
    expect(composed(0, 0, 0)).toEqual([255, 255, 255, 255]);

    store().redo();
    expect(store().layers[0].mask).toBeTruthy();
    expect(composed(0, 0, 0)[3]).toBe(0);
  });

  it('删除蒙版可以撤销，且蒙版内容原样回来', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    store().deleteMask(id);
    expect(store().layers[0].mask).toBeUndefined();

    store().undo();
    expect(maskAt(store().layers[0].id, 2, 2)).toBe(0);
  });

  it('蒙版像素改动走增量，撤销能回到改前', () => {
    const id = newDoc();
    store().addMask(id);
    // 直接在蒙版上涂黑一块，模拟画笔提交后的状态
    const target = store().layers[0].mask!;
    const context = ctx2d(target);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 4, 4);
    store().pushHistory('涂抹蒙版', { layerIds: [id] });

    expect(maskAt(id, 1, 1)).toBe(0);
    store().undo();
    expect(maskAt(store().layers[0].id, 1, 1)).toBe(255);
    store().redo();
    expect(maskAt(store().layers[0].id, 1, 1)).toBe(0);
  });

  it('反相蒙版可以撤销', () => {
    const id = newDoc();
    store().addMask(id);
    store().invertMaskOf(id);
    expect(maskAt(id, 0, 0)).toBe(0);
    store().undo();
    expect(maskAt(store().layers[0].id, 0, 0)).toBe(255);
  });
});

describe('toggleMaskEnabled', () => {
  it('停用后蒙版不生效但仍保留', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    expect(composed(0, 0, 0)[3]).toBe(0);

    store().toggleMaskEnabled(id);
    expect(store().layers[0].mask).toBeTruthy();
    expect(store().layers[0].maskEnabled).toBe(false);
    expect(composed(0, 0, 0)).toEqual([255, 255, 255, 255]);

    store().toggleMaskEnabled(id);
    expect(composed(0, 0, 0)[3]).toBe(0);
  });

  it('没有蒙版时什么都不做', () => {
    const id = newDoc();
    const before = store().historyIndex;
    store().toggleMaskEnabled(id);
    expect(store().historyIndex).toBe(before);
  });
});

describe('applyMaskToLayer', () => {
  it('把蒙版烙进像素后删除蒙版，画面不变', () => {
    const id = newDoc();
    store().addMask(id);
    const mask = store().layers[0].mask!;
    const context = ctx2d(mask);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 4, 8);
    store().pushHistory('涂抹蒙版', { layerIds: [id] });

    store().applyMaskToLayer(id);
    expect(store().layers[0].mask).toBeUndefined();
    // 左半被蒙掉，右半保留
    expect(composed(0, 1, 1)[3]).toBe(0);
    expect(composed(0, 6, 1)).toEqual([255, 255, 255, 255]);
  });

  it('可以撤销回未应用的状态', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    store().applyMaskToLayer(id);
    expect(store().layers[0].mask).toBeUndefined();

    store().undo();
    expect(store().layers[0].mask).toBeTruthy();
    expect(composed(0, 0, 0)[3]).toBe(0);
  });
});

describe('paintTarget / setMaskSelected', () => {
  it('未选中蒙版时目标是图层像素', () => {
    const id = newDoc();
    store().addMask(id);
    store().setMaskSelected(id, false);
    expect(store().isPaintingMask()).toBe(false);
    expect(store().paintTarget()).toBe(store().layers[0].canvas);
  });

  it('没有蒙版时无法选中蒙版', () => {
    const id = newDoc();
    store().setMaskSelected(id, true);
    expect(store().isPaintingMask()).toBe(false);
  });

  it('没有文档时返回 null', () => {
    expect(store().paintTarget()).toBeNull();
  });

  it('删除蒙版后绘制目标退回图层像素', () => {
    const id = newDoc();
    store().addMask(id);
    store().deleteMask(id);
    expect(store().paintTarget()).toBe(store().layers[0].canvas);
  });
});
