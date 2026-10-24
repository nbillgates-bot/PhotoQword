/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { moveTool, floatDragActive } from './moveTool';
import { reset, newDoc, pointer, context, store } from './testKit';
import { rectSelection } from '../engine/selection';
import { ctx2d } from '../engine/canvasUtils';

/**
 * 拖动浮动块时蚂蚁线的落点。
 *
 * 曾经的做法是每帧拿 store 里的选区轮廓再整体加 offset，但 onPointerUp
 * 已经把 store 的选区挪到新位置了，于是第二次拖动会把上一次的位移重复计一遍，
 * 蚂蚁线跑到块的两倍位移处。轮廓现在存成相对 origin 的归一化坐标，
 * 画的时候加 origin+offset —— 这组测试守的就是这一点。
 */

/** 记录 moveTo/lineTo 的假 context，只关心路径坐标 */
function recorder() {
  const points: Array<[number, number]> = [];
  const noop = () => {};
  const fake = {
    moveTo: (x: number, y: number) => points.push([x, y]),
    lineTo: (x: number, y: number) => points.push([x, y]),
    drawImage: noop,
    beginPath: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    setLineDash: noop,
    lineWidth: 0,
    strokeStyle: '',
    lineDashOffset: 0,
  };
  return { points, context: fake as unknown as CanvasRenderingContext2D };
}

/** 画一个红块并选中它，返回选区矩形 */
function setup(): void {
  newDoc();
  store().addLayer('raster', '内容');
  const c = ctx2d(store().activeLayer()!.canvas);
  c.fillStyle = '#ff0000';
  c.fillRect(2, 2, 4, 4);
  store().bumpRevision();
  store().setSelection(rectSelection(16, 16, { x: 2, y: 2, width: 4, height: 4 }));
  store().pushHistory('画红块');
}

/** 拖一次但不抬手，返回这次 drawOverlay 记下的路径点 */
function dragTo(fromX: number, fromY: number, toX: number, toY: number) {
  const ctx = context();
  moveTool.onPointerDown?.(pointer(fromX, fromY), ctx);
  moveTool.onPointerMove?.(pointer(toX, toY), ctx);
  const rec = recorder();
  moveTool.drawOverlay?.(rec.context, ctx, 1);
  return rec;
}

describe('moveTool 浮动块的蚂蚁线位置', () => {
  beforeEach(() => {
    // 必须把 moveTool 传进去，否则模块级的 session / float 会漏到下一条用例
    reset(moveTool);
  });

  it('第一次拖动：蚂蚁线包住块的新位置', () => {
    setup();
    const { points } = dragTo(3, 3, 7, 7); // 位移 +4,+4

    // 块从 (2,2) 走到 (6,6)，4x4，所以框应落在 x∈[6,10], y∈[6,10]
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    expect(Math.min(...xs)).toBe(6);
    expect(Math.max(...xs)).toBe(10);
    expect(Math.min(...ys)).toBe(6);
    expect(Math.max(...ys)).toBe(10);
  });

  it('第二次拖动不重复计上一次的位移', () => {
    setup();
    const ctx = context();

    // 第一次：(2,2) → (6,6)，抬手落地
    moveTool.onPointerDown?.(pointer(3, 3), ctx);
    moveTool.onPointerMove?.(pointer(7, 7), ctx);
    moveTool.onPointerUp?.(pointer(7, 7), ctx);

    // 第二次：再走 +2,+2，块应到 (8,8)
    const { points } = dragTo(7, 7, 9, 9);

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    // 若重复计上一次位移会变成 12（6+4+2），这里必须是 8
    expect(Math.min(...xs)).toBe(8);
    expect(Math.max(...xs)).toBe(12);
    expect(Math.min(...ys)).toBe(8);
    expect(Math.max(...ys)).toBe(12);
  });

  it('拖动期间 floatDragActive 为真，抬手后为假', () => {
    setup();
    const ctx = context();

    expect(floatDragActive()).toBe(false);
    moveTool.onPointerDown?.(pointer(3, 3), ctx);
    moveTool.onPointerMove?.(pointer(7, 7), ctx);
    expect(floatDragActive()).toBe(true);

    moveTool.onPointerUp?.(pointer(7, 7), ctx);
    expect(floatDragActive()).toBe(false);
  });

  it('没有拖拽会话时不画任何东西', () => {
    setup();
    const rec = recorder();
    moveTool.drawOverlay?.(rec.context, context(), 1);
    expect(rec.points).toHaveLength(0);
  });
});
