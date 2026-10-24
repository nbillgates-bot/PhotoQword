/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from './moveTool';
import { brushTool } from './paintTools';
import { drag, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';

beforeEach(() => {
  reset(moveTool);
});

/** 在活动图层上画一个 4×4 红块，左上角在 (2,2) */
function redBlock(): void {
  const context2d = ctx2d(store().activeLayer()!.canvas);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(2, 2, 4, 4);
  store().bumpRevision();
}

/** 合成后的文档坐标取色 */
function isRed(x: number, y: number): boolean {
  const doc = store().doc!;
  const out = flatten(store().layers, doc.width, doc.height);
  const [r, g, , a] = [...ctx2d(out).getImageData(x, y, 1, 1).data];
  return a > 200 && r > 200 && g < 80;
}

function setup(): void {
  newDoc();
  store().addLayer('raster', '内容');
  redBlock();
}

describe('移出画布的像素不丢', () => {
  it('推出画布再推回来，内容还在', () => {
    setup();
    // 红块在 (2,2)-(5,5)。往右下推 20 格，整块跑到 16×16 文档之外
    drag(moveTool, pointer(3, 3), pointer(23, 23));
    expect(isRed(3, 3)).toBe(false);

    // 原路推回来
    drag(moveTool, pointer(23, 23), pointer(3, 3));
    expect(isRed(3, 3)).toBe(true);
    expect(isRed(5, 5)).toBe(true);
    expect(isRed(6, 6)).toBe(false);
  });

  it('往左上推出去再推回来也一样', () => {
    setup();
    drag(moveTool, pointer(3, 3), pointer(-20, -20));
    expect(isRed(3, 3)).toBe(false);
    drag(moveTool, pointer(-20, -20), pointer(3, 3));
    expect(isRed(3, 3)).toBe(true);
  });

  it('只露出一角时，露出的部分正常显示', () => {
    setup();
    // 往右下推 12：红块占 (14,14)-(17,17)，只有左上 2×2 还在文档里
    drag(moveTool, pointer(3, 3), pointer(15, 15));
    expect(isRed(14, 14)).toBe(true);
    expect(isRed(15, 15)).toBe(true);
  });

  it('移动只改 bounds，不重画像素', () => {
    setup();
    const before = store().activeLayer()!.canvas;
    drag(moveTool, pointer(3, 3), pointer(9, 9));
    const layer = store().activeLayer()!;
    // 同一张画布对象，位置变了
    expect(layer.canvas).toBe(before);
    expect(layer.bounds.x).toBe(6);
    expect(layer.bounds.y).toBe(6);
  });

  it('bounds 的宽高始终等于画布的宽高', () => {
    setup();
    drag(moveTool, pointer(3, 3), pointer(30, 30));
    const layer = store().activeLayer()!;
    expect(layer.bounds.width).toBe(layer.canvas.width);
    expect(layer.bounds.height).toBe(layer.canvas.height);
  });
});

describe('移出画布后再编辑', () => {
  it('推出去一半再画一笔，图层长大且原内容保留', () => {
    setup();
    // 16×16 文档，图层从 (0,0,16,16) 右下移 12 格 -> (12,12,16,16)
    drag(moveTool, pointer(3, 3), pointer(15, 15));
    expect(store().activeLayer()!.canvas.width).toBe(16);

    // 在文档左上角画一笔。那里在图层现有范围之外，图层必须长回来：
    // (12,12,16,16) ∪ (0,0,16,16) = (0,0,28,28)
    store().setToolOption('brushSize', 4);
    drag(brushTool, pointer(1, 1), pointer(2, 2));

    const layer = store().activeLayer()!;
    expect(layer.canvas.width).toBe(28);
    expect(layer.canvas.height).toBe(28);
    expect(layer.bounds.x).toBe(0);
    expect(layer.bounds.y).toBe(0);
    // 长大后 bounds 仍与画布一致
    expect(layer.bounds.width).toBe(layer.canvas.width);
    expect(layer.bounds.height).toBe(layer.canvas.height);
    // 被推到 (14,14) 的红块没有因为长大而错位
    expect(isRed(14, 14)).toBe(true);
  });

  it('长大后的画布没有 NaN', () => {
    setup();
    drag(moveTool, pointer(3, 3), pointer(20, 20));
    store().setToolOption('brushSize', 4);
    drag(brushTool, pointer(2, 2), pointer(4, 4));
    const canvas = store().activeLayer()!.canvas;
    const data = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    expect([...data].some((v) => Number.isNaN(v))).toBe(false);
  });
});

describe('撤销移动', () => {
  it('撤销把图层挪回原位', () => {
    setup();
    store().pushHistory('基线');
    drag(moveTool, pointer(3, 3), pointer(9, 9));
    expect(isRed(9, 9)).toBe(true);

    store().undo();
    expect(isRed(3, 3)).toBe(true);
    expect(isRed(9, 9)).toBe(false);
    expect(store().activeLayer()!.bounds.x).toBe(0);
  });

  it('重做把图层挪回移动后的位置', () => {
    setup();
    store().pushHistory('基线');
    drag(moveTool, pointer(3, 3), pointer(9, 9));
    store().undo();
    store().redo();
    expect(isRed(9, 9)).toBe(true);
  });
});

