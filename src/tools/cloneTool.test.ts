/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cloneSourcePoint, cloneTool } from './cloneTool';
import { click, context, drag, newDoc, pixelAt, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';

beforeEach(() => {
  reset(cloneTool);
  store().setToolOption('brushSize', 8);
});

/** 在左半边画一块红，右半边留白，用来观察像素是否被搬运 */
function redLeftHalf(): void {
  const canvas = store().activeLayer()!.canvas;
  const context2d = ctx2d(canvas);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(0, 0, 16, 32);
  store().bumpRevision();
}

function redness(x: number, y: number): number {
  const [r, g, , a] = pixelAt(store().activeLayer()!.canvas, x, y);
  return a === 0 ? 0 : r - g;
}

/** alt 单击设定取样点 */
function setSource(x: number, y: number): void {
  click(cloneTool, pointer(x, y, { altKey: true }));
}

describe('取样点', () => {
  it('alt 单击设定取样点并提示', () => {
    newDoc(32, 32);
    setSource(8, 8);

    expect(cloneSourcePoint()).toEqual({ x: 8, y: 8 });
    expect(store().toast?.message).toBe('toast.cloneSourceSet');
  });

  it('alt 单击不改像素，也不压历史', () => {
    newDoc(32, 32);
    redLeftHalf();
    const before = store().history.length;
    const pixel = pixelAt(store().activeLayer()!.canvas, 8, 8);

    setSource(8, 8);

    expect(pixelAt(store().activeLayer()!.canvas, 8, 8)).toEqual(pixel);
    expect(store().history.length).toBe(before);
  });

  it('没有取样点时报错，不动像素', () => {
    newDoc(32, 32);
    redLeftHalf();
    const pixel = pixelAt(store().activeLayer()!.canvas, 24, 8);

    drag(cloneTool, pointer(24, 8), pointer(26, 8));

    expect(store().toast?.kind).toBe('error');
    expect(store().toast?.message).toBe('error.clone.noSource');
    expect(pixelAt(store().activeLayer()!.canvas, 24, 8)).toEqual(pixel);
  });

  it('换文档后旧取样点失效，避免搬运上一个文档的坐标', () => {
    newDoc(32, 32);
    setSource(8, 8);
    const docId = store().doc!.id;
    expect(cloneSourcePoint(docId)).toEqual({ x: 8, y: 8 });

    newDoc(32, 32);
    const nextId = store().doc!.id;
    expect(cloneSourcePoint(nextId)).toBeNull();

    // 拿新文档去仿制应当被拦住
    drag(cloneTool, pointer(24, 8), pointer(26, 8));
    expect(store().toast?.message).toBe('error.clone.noSource');
  });

  it('工具切走再回来取样点仍在，与 PS 一致', () => {
    newDoc(32, 32);
    setSource(8, 8);
    cloneTool.onDeactivate?.(context());

    expect(cloneSourcePoint(store().doc!.id)).toEqual({ x: 8, y: 8 });
  });
});

describe('搬运像素', () => {
  it('把取样处的红色仿制到空白处', () => {
    newDoc(32, 32);
    redLeftHalf();
    expect(redness(24, 8)).toBe(0);

    setSource(8, 8);
    drag(cloneTool, pointer(24, 8), pointer(24, 8));

    expect(redness(24, 8)).toBeGreaterThan(100);
  });

  it('偏移在整次拖拽中固定，落笔点决定偏移量', () => {
    newDoc(32, 32);
    redLeftHalf();
    setSource(8, 8);

    const ctx = context();
    // 落笔在 (24,8)，偏移 +16；随后移到 (24,20)，取样点相应变成 (8,20)——仍在红区
    cloneTool.onPointerDown?.(pointer(24, 8), ctx);
    cloneTool.onPointerMove?.(pointer(24, 20), ctx);
    cloneTool.onPointerUp?.(pointer(24, 20), ctx);

    expect(redness(24, 8)).toBeGreaterThan(100);
    expect(redness(24, 20)).toBeGreaterThan(100);
  });

  it('从原始快照取样，同一处反复涂不会自我叠加变形', () => {
    newDoc(32, 32);
    redLeftHalf();
    setSource(8, 8);

    const ctx = context();
    cloneTool.onPointerDown?.(pointer(24, 8), ctx);
    const once = redness(24, 8);
    for (let i = 0; i < 5; i += 1) cloneTool.onPointerMove?.(pointer(24, 8), ctx);
    cloneTool.onPointerUp?.(pointer(24, 8), ctx);

    // 软边蒙版会让中心逐渐趋近取样色，但不应越过红色本身
    expect(redness(24, 8)).toBeGreaterThanOrEqual(once);
    expect(redness(24, 8)).toBeLessThanOrEqual(255);
  });

  it('搬运结果里没有 NaN', () => {
    newDoc(32, 32);
    redLeftHalf();
    setSource(8, 8);
    drag(cloneTool, pointer(24, 8), pointer(26, 10));

    const canvas = store().activeLayer()!.canvas;
    const data = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
    expect([...data].some((value) => Number.isNaN(value))).toBe(false);
  });

  it('取样点在画布外时不崩，只是搬来透明像素', () => {
    newDoc(32, 32);
    redLeftHalf();
    setSource(-20, -20);

    expect(() => drag(cloneTool, pointer(8, 8), pointer(8, 8))).not.toThrow();
  });
});

describe('历史与锁定', () => {
  it('抬手压一条历史，可撤销', () => {
    newDoc(32, 32);
    redLeftHalf();
    store().pushHistory('画红块');
    setSource(8, 8);

    drag(cloneTool, pointer(24, 8), pointer(24, 8));
    expect(redness(24, 8)).toBeGreaterThan(100);

    store().undo();
    expect(redness(24, 8)).toBe(0);
  });

  it('图层锁定时提示并不动像素', () => {
    const id = newDoc(32, 32);
    redLeftHalf();
    setSource(8, 8);
    store().updateLayer(id, { locked: true });
    const pixel = pixelAt(store().activeLayer()!.canvas, 24, 8);

    drag(cloneTool, pointer(24, 8), pointer(24, 8));

    expect(store().toast?.kind).toBe('error');
    expect(pixelAt(store().activeLayer()!.canvas, 24, 8)).toEqual(pixel);
  });

  it('工具切走时会话被丢弃，抬手不再压历史', () => {
    newDoc(32, 32);
    redLeftHalf();
    setSource(8, 8);
    const before = store().history.length;

    const ctx = context();
    cloneTool.onPointerDown?.(pointer(24, 8), ctx);
    cloneTool.onDeactivate?.(ctx);
    cloneTool.onPointerUp?.(pointer(24, 8), ctx);

    expect(store().history.length).toBe(before);
  });

  it('没有文档时什么都不做', () => {
    expect(() => drag(cloneTool, pointer(8, 8), pointer(10, 10))).not.toThrow();
  });
});
