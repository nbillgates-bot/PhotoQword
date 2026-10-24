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

const store = () => useEditorStore.getState();

/** 建一个 8x8 的白底文档并返回其唯一图层 id */
function newDoc(): string {
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

function layerAt(id: string, x: number, y: number): number[] {
  const layer = store().layers.find((item) => item.id === id);
  if (!layer) throw new Error('图层不存在');
  return [...ctx2d(layer.canvas).getImageData(x, y, 1, 1).data];
}

function maskAt(id: string, x: number, y: number): number {
  const layer = store().layers.find((item) => item.id === id);
  if (!layer?.mask) throw new Error('该图层没有蒙版');
  return ctx2d(layer.mask).getImageData(x, y, 1, 1).data[0];
}

/** 左半边选中的矩形选区 */
function selectLeftHalf(): void {
  const mask = createCanvas(8, 8);
  const context = ctx2d(mask);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 4, 8);
  useEditorStore.setState({
    selection: { mask, bounds: { x: 0, y: 0, width: 4, height: 8 } },
  });
}

beforeEach(() => {
  store().closeDoc();
});

describe('invertActiveLayer', () => {
  it('反相当前图层像素', () => {
    const id = newDoc();
    expect(layerAt(id, 0, 0)).toEqual([255, 255, 255, 255]);
    store().invertActiveLayer();
    expect(layerAt(id, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('有选区时只反相选区内', () => {
    const id = newDoc();
    selectLeftHalf();
    store().invertActiveLayer();
    expect(layerAt(id, 1, 4)).toEqual([0, 0, 0, 255]);
    expect(layerAt(id, 6, 4)).toEqual([255, 255, 255, 255]);
  });

  it('推进一条历史，可以撤销', () => {
    const id = newDoc();
    store().invertActiveLayer();
    expect(store().history.at(-1)?.label).toBe('action.invert');
    store().undo();
    expect(layerAt(id, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('撤销后能重做', () => {
    const id = newDoc();
    store().invertActiveLayer();
    store().undo();
    store().redo();
    expect(layerAt(id, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('像素变了要 bumpRevision，否则界面不刷新', () => {
    newDoc();
    const before = store().revision;
    store().invertActiveLayer();
    expect(store().revision).toBeGreaterThan(before);
  });

  it('没有文档时什么都不做', () => {
    expect(() => store().invertActiveLayer()).not.toThrow();
    expect(store().history).toHaveLength(0);
  });
});

describe('invertActiveLayer 的目标判定', () => {
  it('正在编辑蒙版时反相的是蒙版，不动像素', () => {
    const id = newDoc();
    store().addMask(id, 'reveal');
    store().setMaskSelected(id, true);
    store().invertActiveLayer();
    expect(maskAt(id, 0, 0)).toBe(0);
    expect(layerAt(id, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(store().history.at(-1)?.label).toBe('action.invertMask');
  });

  it('有蒙版但编辑目标是像素时反相像素，不动蒙版', () => {
    const id = newDoc();
    store().addMask(id, 'reveal');
    store().setMaskSelected(id, false);
    store().invertActiveLayer();
    expect(layerAt(id, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(maskAt(id, 0, 0)).toBe(255);
  });

  it('图层组要求先合并，不改任何像素', () => {
    newDoc();
    store().addGroup();
    const groupId = store().activeLayerId!;
    const historyLength = store().history.length;
    store().invertActiveLayer();
    expect(store().history).toHaveLength(historyLength);
    expect(store().layers.find((item) => item.id === groupId)?.type).toBe('group');
  });

  it('锁定图层不反相', () => {
    const id = newDoc();
    store().updateLayer(id, { locked: true });
    const historyLength = store().history.length;
    store().invertActiveLayer();
    expect(layerAt(id, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(store().history).toHaveLength(historyLength);
  });

  it('锁定图像像素同样挡住', () => {
    const id = newDoc();
    store().updateLayer(id, { lockPixels: true });
    store().invertActiveLayer();
    expect(layerAt(id, 0, 0)).toEqual([255, 255, 255, 255]);
  });
});
