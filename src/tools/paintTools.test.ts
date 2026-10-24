/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { brushTool, eraserTool } from './paintTools';
import type { ToolHandler } from './types';
import { context, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';

/** 走完一次完整描边：按下、移动、抬起 */
function stroke(tool: ToolHandler, from = pointer(2, 2), to = pointer(6, 6)): void {
  const ctx = context();
  tool.onPointerDown?.(from, ctx);
  tool.onPointerMove?.(to, ctx);
  tool.onPointerUp?.(to, ctx);
}

/** 读蒙版某点灰度 */
function maskAt(x: number, y: number): number {
  const mask = store().layers[0].mask;
  if (!mask) throw new Error('没有蒙版');
  return ctx2d(mask).getImageData(x, y, 1, 1).data[0];
}

/** 读蒙版某点 alpha。蒙版是灰度通道，alpha 应恒为 255 */
function maskAlphaAt(x: number, y: number): number {
  const mask = store().layers[0].mask;
  if (!mask) throw new Error('没有蒙版');
  return ctx2d(mask).getImageData(x, y, 1, 1).data[3];
}

/** 读图层像素某点 */
function layerAt(x: number, y: number): number[] {
  return [...ctx2d(store().layers[0].canvas).getImageData(x, y, 1, 1).data];
}

beforeEach(() => {
  reset(brushTool, eraserTool);
});

describe('画笔在图层像素上', () => {
  it('未选中蒙版时画在图层画布上', () => {
    newDoc();
    store().setForeground('#ff0000');
    stroke(brushTool);
    expect(layerAt(4, 4)[0]).toBeGreaterThan(200);
    expect(layerAt(4, 4)[1]).toBeLessThan(80);
  });

  it('抬手后缓冲被清空', () => {
    newDoc();
    stroke(brushTool);
    expect(store().overlay).toBeNull();
  });

  it('工具切走时未提交的描边被丢弃', () => {
    newDoc();
    const ctx = context();
    brushTool.onPointerDown?.(pointer(), ctx);
    expect(store().overlay).not.toBeNull();
    brushTool.onDeactivate?.(ctx);
    expect(store().overlay).toBeNull();
  });

  it('图层锁定时不起笔并提示', () => {
    const id = newDoc();
    store().updateLayer(id, { locked: true });
    brushTool.onPointerDown?.(pointer(), context());
    expect(store().overlay).toBeNull();
    expect(store().toast?.kind).toBe('error');
  });
});

describe('画笔在蒙版上', () => {
  it('选中蒙版时描边落在蒙版而不是图层像素', () => {
    const id = newDoc();
    store().addMask(id);
    const before = layerAt(4, 4);

    store().setForeground('#000000');
    stroke(brushTool);

    expect(maskAt(4, 4)).toBeLessThan(80);
    expect(layerAt(4, 4)).toEqual(before);
  });

  it('缓冲的 target 标为 mask', () => {
    const id = newDoc();
    store().addMask(id);
    brushTool.onPointerDown?.(pointer(), context());
    expect(store().overlay?.target).toBe('mask');
    brushTool.onDeactivate?.(context());
  });

  it('彩色前景色在蒙版上折算为等亮度灰，三通道相等', () => {
    const id = newDoc();
    store().addMask(id);
    store().setForeground('#ff0000');
    stroke(brushTool);

    const mask = store().layers[0].mask!;
    const [r, g, b] = ctx2d(mask).getImageData(4, 4, 1, 1).data;
    expect(r).toBe(g);
    expect(g).toBe(b);
    // 纯红的 Rec.601 亮度约 76，应当明显暗于白底
    expect(r).toBeLessThan(200);
  });

  it('蒙版上绘制后 alpha 仍为 255，不留透明洞', () => {
    const id = newDoc();
    store().addMask(id);
    store().setForeground('#000000');
    stroke(brushTool);
    expect(maskAlphaAt(4, 4)).toBe(255);
  });

  it('橡皮在蒙版上是"擦回显示"，把蒙版涂白而不是打透明洞', () => {
    const id = newDoc();
    store().addMask(id, 'hide');
    expect(maskAt(4, 4)).toBe(0);

    stroke(eraserTool);
    expect(maskAt(4, 4)).toBeGreaterThan(180);
    // 关键：不能变成 alpha 0，否则蒙版语义就坏了
    expect(maskAlphaAt(4, 4)).toBe(255);
  });

  it('蒙版描边可以撤销', () => {
    const id = newDoc();
    store().addMask(id);
    store().setForeground('#000000');
    stroke(brushTool);
    expect(maskAt(4, 4)).toBeLessThan(80);

    store().undo();
    expect(maskAt(4, 4)).toBe(255);
  });

  it('蒙版被删掉后描边落回图层像素', () => {
    const id = newDoc();
    store().addMask(id);
    store().deleteMask(id);
    store().setForeground('#ff0000');
    stroke(brushTool);
    expect(layerAt(4, 4)[0]).toBeGreaterThan(200);
    expect(layerAt(4, 4)[1]).toBeLessThan(80);
  });
});
