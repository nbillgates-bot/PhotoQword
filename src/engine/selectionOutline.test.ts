/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect } from 'vitest';
import { selectionOutline } from './selectionOutline';
import { createCanvas, ctx2d } from './canvasUtils';
import type { OutlineSegment } from './selectionOutline';

/** 造一张蒙版，按传入的矩形填白 */
function mask(size: number, rects: Array<[number, number, number, number]>): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = '#ffffff';
  for (const [x, y, w, h] of rects) context.fillRect(x, y, w, h);
  return canvas;
}

const has = (segs: OutlineSegment[], s: OutlineSegment): boolean =>
  segs.some((it) => it.x1 === s.x1 && it.y1 === s.y1 && it.x2 === s.x2 && it.y2 === s.y2);

describe('selectionOutline', () => {
  it('单个矩形出四条边，且是整条不是逐格', () => {
    const segs = selectionOutline(mask(16, [[2, 2, 4, 4]]), { x: 2, y: 2, width: 4, height: 4 });

    expect(segs).toHaveLength(4);
    expect(has(segs, { x1: 2, y1: 2, x2: 6, y2: 2 })).toBe(true);
    expect(has(segs, { x1: 2, y1: 6, x2: 6, y2: 6 })).toBe(true);
    expect(has(segs, { x1: 2, y1: 2, x2: 2, y2: 6 })).toBe(true);
    expect(has(segs, { x1: 6, y1: 2, x2: 6, y2: 6 })).toBe(true);
  });

  it('两个互不相连的矩形各自成框，不合成一个大框', () => {
    const bounds = { x: 1, y: 1, width: 12, height: 4 };
    const segs = selectionOutline(
      mask(16, [
        [1, 1, 3, 3],
        [10, 1, 3, 3],
      ]),
      bounds,
    );

    // 两个 3x3 各四条边
    expect(segs).toHaveLength(8);
    // 中间的空隙处不能有横边（那正是"被合并成一个大框"的症状）
    expect(segs.some((s) => s.y1 === s.y2 && s.x1 < 10 && s.x2 > 4)).toBe(false);
    // 各自的内侧竖边都在
    expect(has(segs, { x1: 4, y1: 1, x2: 4, y2: 4 })).toBe(true);
    expect(has(segs, { x1: 10, y1: 1, x2: 10, y2: 4 })).toBe(true);
  });

  it('挖了洞的选区把内圈也描出来', () => {
    const canvas = mask(16, [[2, 2, 8, 8]]);
    const context = ctx2d(canvas);
    context.clearRect(4, 4, 3, 3);

    const segs = selectionOutline(canvas, { x: 2, y: 2, width: 8, height: 8 });

    // 外圈 4 条 + 内圈 4 条
    expect(segs).toHaveLength(8);
    expect(has(segs, { x1: 4, y1: 4, x2: 7, y2: 4 })).toBe(true);
  });

  it('空蒙版返回空数组', () => {
    expect(selectionOutline(mask(16, []), { x: 0, y: 0, width: 16, height: 16 })).toEqual([]);
  });

  it('1x1 选区出四条单位长的边', () => {
    const segs = selectionOutline(mask(8, [[3, 3, 1, 1]]), { x: 3, y: 3, width: 1, height: 1 });

    expect(segs).toHaveLength(4);
    for (const s of segs) {
      expect(Math.abs(s.x2 - s.x1) + Math.abs(s.y2 - s.y1)).toBe(1);
    }
  });

  it('贴着画布边缘的选区不漏边、坐标不越界', () => {
    const segs = selectionOutline(mask(8, [[0, 0, 8, 8]]), { x: 0, y: 0, width: 8, height: 8 });

    expect(segs).toHaveLength(4);
    expect(has(segs, { x1: 0, y1: 0, x2: 8, y2: 0 })).toBe(true);
    expect(has(segs, { x1: 0, y1: 8, x2: 8, y2: 8 })).toBe(true);
    for (const s of segs) {
      for (const v of [s.x1, s.y1, s.x2, s.y2]) {
        expect(Number.isNaN(v)).toBe(false);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(8);
      }
    }
  });

  it('羽化过渡带在 50% 处出线，不在最外沿', () => {
    const canvas = createCanvas(16, 16);
    const context = ctx2d(canvas);
    // 左半 alpha=60（算外），右半 alpha=200（算内）
    context.fillStyle = 'rgba(255,255,255,0.235)';
    context.fillRect(2, 4, 4, 4);
    context.fillStyle = 'rgba(255,255,255,0.784)';
    context.fillRect(6, 4, 4, 4);

    const segs = selectionOutline(canvas, { x: 2, y: 4, width: 8, height: 4 });

    // 边界应落在 x=6（半强度分界），而不是 x=2（alpha>0 的最外沿）
    expect(has(segs, { x1: 6, y1: 4, x2: 6, y2: 8 })).toBe(true);
    expect(has(segs, { x1: 2, y1: 4, x2: 2, y2: 8 })).toBe(false);
  });
});
