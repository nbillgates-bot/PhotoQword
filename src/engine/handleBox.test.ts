/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { cursorFor, dragTo, hitTest, normalize, type Handle } from './handleBox';
import type { Rect } from '../types';

const RECT: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe('hitTest', () => {
  it('八个控制点都能命中', () => {
    const cases: Array<[Handle, number, number]> = [
      ['nw', 100, 100],
      ['n', 200, 100],
      ['ne', 300, 100],
      ['e', 300, 150],
      ['se', 300, 200],
      ['s', 200, 200],
      ['sw', 100, 200],
      ['w', 100, 150],
    ];
    for (const [handle, x, y] of cases) {
      expect(hitTest(RECT, { x, y }, 1)).toBe(handle);
    }
  });

  it('框内返回 inside', () => {
    expect(hitTest(RECT, { x: 200, y: 150 }, 1)).toBe('inside');
  });

  it('框外返回 null', () => {
    expect(hitTest(RECT, { x: 400, y: 400 }, 1)).toBeNull();
  });

  it('贴着边但不在控制点上也不算 inside，留给边缘判定', () => {
    // 上边中间往右一点，离 n 控制点远，但离上边只有 1px
    expect(hitTest(RECT, { x: 250, y: 101 }, 1)).toBeNull();
  });

  it('控制点优先于 inside', () => {
    // 中心点恰好落在很小的框里时，角控制点要赢
    const tiny: Rect = { x: 0, y: 0, width: 4, height: 4 };
    expect(hitTest(tiny, { x: 2, y: 2 }, 1)).toBe('nw');
  });

  it('缩放越大容忍半径越小（换算回文档坐标）', () => {
    // zoom=1 时 8px 容忍，(105,100) 命中 nw
    expect(hitTest(RECT, { x: 105, y: 100 }, 1)).toBe('nw');
    // zoom=4 时容忍只有 2px，同一点不再命中
    expect(hitTest(RECT, { x: 105, y: 100 }, 4)).not.toBe('nw');
  });

  it('缩得很小时容忍半径放大', () => {
    // zoom=0.25 → 容忍 32px
    expect(hitTest(RECT, { x: 120, y: 100 }, 0.25)).toBe('nw');
  });

  it('1×1 的框不会崩，也不产生 NaN 判定', () => {
    const one: Rect = { x: 5, y: 5, width: 1, height: 1 };
    expect(() => hitTest(one, { x: 5, y: 5 }, 1)).not.toThrow();
    expect(hitTest(one, { x: 5, y: 5 }, 1)).toBe('nw');
  });
});

describe('cursorFor', () => {
  it('对角控制点用对角光标', () => {
    expect(cursorFor('nw')).toBe('nwse-resize');
    expect(cursorFor('se')).toBe('nwse-resize');
    expect(cursorFor('ne')).toBe('nesw-resize');
    expect(cursorFor('sw')).toBe('nesw-resize');
  });

  it('边中点用单轴光标', () => {
    expect(cursorFor('n')).toBe('ns-resize');
    expect(cursorFor('s')).toBe('ns-resize');
    expect(cursorFor('e')).toBe('ew-resize');
    expect(cursorFor('w')).toBe('ew-resize');
  });

  it('框内是移动，空是默认', () => {
    expect(cursorFor('inside')).toBe('move');
    expect(cursorFor(null)).toBe('default');
  });
});

/** dragTo 的默认参数，只覆盖需要的字段 */
function args(over: Partial<Parameters<typeof dragTo>[0]> = {}) {
  return {
    start: RECT,
    anchor: { x: 100, y: 100 },
    current: { x: 100, y: 100 },
    handle: 'se' as Handle,
    shift: false,
    alt: false,
    ...over,
  };
}

describe('dragTo', () => {
  it('inside 平移，尺寸不变', () => {
    const r = dragTo(args({ handle: 'inside', anchor: { x: 150, y: 150 }, current: { x: 170, y: 140 } }));
    expect(r).toEqual({ x: 120, y: 90, width: 200, height: 100 });
  });

  it('handle 为 null 时原样返回', () => {
    const r = dragTo(args({ handle: null, current: { x: 999, y: 999 } }));
    expect(r).toEqual(RECT);
  });

  it('拖 se 同时改宽高，左上角不动', () => {
    const r = dragTo(args({ handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 320, y: 230 } }));
    expect(r).toEqual({ x: 100, y: 100, width: 220, height: 130 });
  });

  it('拖 nw 改左上角，右下角不动', () => {
    const r = dragTo(args({ handle: 'nw', anchor: { x: 100, y: 100 }, current: { x: 120, y: 110 } }));
    expect(r).toEqual({ x: 120, y: 110, width: 180, height: 90 });
    // 右下角守恒
    expect(r.x + r.width).toBe(300);
    expect(r.y + r.height).toBe(200);
  });

  it('拖 e 只改宽度', () => {
    const r = dragTo(args({ handle: 'e', anchor: { x: 300, y: 150 }, current: { x: 340, y: 190 } }));
    expect(r).toEqual({ x: 100, y: 100, width: 240, height: 100 });
  });

  it('拖 n 只改高度和 y', () => {
    const r = dragTo(args({ handle: 'n', anchor: { x: 200, y: 100 }, current: { x: 250, y: 130 } }));
    expect(r).toEqual({ x: 100, y: 130, width: 200, height: 70 });
  });

  it('拖 sw 同时改 x 和高度', () => {
    const r = dragTo(args({ handle: 'sw', anchor: { x: 100, y: 200 }, current: { x: 110, y: 220 } }));
    expect(r).toEqual({ x: 110, y: 100, width: 190, height: 120 });
  });

  it('拖 ne 改 y 和宽度', () => {
    const r = dragTo(args({ handle: 'ne', anchor: { x: 300, y: 100 }, current: { x: 310, y: 120 } }));
    expect(r).toEqual({ x: 100, y: 120, width: 210, height: 80 });
  });

  it('拖过头产生负宽高，交给 normalize 处理', () => {
    const r = dragTo(args({ handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 50, y: 50 } }));
    expect(r.width).toBeLessThan(0);
    expect(r.height).toBeLessThan(0);
  });
});

describe('dragTo Shift 等比', () => {
  it('水平位移更大时用水平为主轴', () => {
    // 宽高比 2:1，dx=40 → dy 应为 20
    const r = dragTo(args({
      handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 340, y: 205 }, shift: true,
    }));
    expect(r.width).toBe(240);
    expect(r.height).toBe(120);
    expect(r.width / r.height).toBeCloseTo(2);
  });

  it('垂直位移更大时用垂直为主轴', () => {
    // dy=40 → dx 应为 80
    const r = dragTo(args({
      handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 305, y: 240 }, shift: true,
    }));
    expect(r.width).toBe(280);
    expect(r.height).toBe(140);
    expect(r.width / r.height).toBeCloseTo(2);
  });

  it('Shift 对边中点不生效，单轴拉伸保持单轴', () => {
    const r = dragTo(args({
      handle: 'e', anchor: { x: 300, y: 150 }, current: { x: 340, y: 150 }, shift: true,
    }));
    expect(r.height).toBe(100);
    expect(r.width).toBe(240);
  });

  it('Shift 拖 nw 也保持比例', () => {
    const r = dragTo(args({
      handle: 'nw', anchor: { x: 100, y: 100 }, current: { x: 140, y: 105 }, shift: true,
    }));
    expect(r.width / r.height).toBeCloseTo(2);
  });
});

describe('dragTo Alt 中心拉伸', () => {
  it('中心保持不动，位移加倍', () => {
    const r = dragTo(args({
      handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 310, y: 210 }, alt: true,
    }));
    // dx=10 加倍成 20
    expect(r.width).toBe(220);
    expect(r.height).toBe(120);
    // 中心守恒：原中心 (200,150)
    expect(r.x + r.width / 2).toBeCloseTo(200);
    expect(r.y + r.height / 2).toBeCloseTo(150);
  });

  it('Alt 拖边中点也从中心两侧拉', () => {
    const r = dragTo(args({
      handle: 'e', anchor: { x: 300, y: 150 }, current: { x: 320, y: 150 }, alt: true,
    }));
    expect(r.width).toBe(240);
    expect(r.x + r.width / 2).toBeCloseTo(200);
  });

  it('Shift + Alt 同时按：等比且中心不动', () => {
    const r = dragTo(args({
      handle: 'se', anchor: { x: 300, y: 200 }, current: { x: 340, y: 205 },
      shift: true, alt: true,
    }));
    expect(r.width / r.height).toBeCloseTo(2);
    expect(r.x + r.width / 2).toBeCloseTo(200);
    expect(r.y + r.height / 2).toBeCloseTo(150);
  });

  it('Alt 平移时不受影响，inside 优先返回', () => {
    const r = dragTo(args({
      handle: 'inside', anchor: { x: 150, y: 150 }, current: { x: 160, y: 160 }, alt: true,
    }));
    expect(r).toEqual({ x: 110, y: 110, width: 200, height: 100 });
  });
});

describe('normalize', () => {
  it('正向矩形原样返回', () => {
    expect(normalize(RECT)).toEqual(RECT);
  });

  it('负宽度翻到左边', () => {
    expect(normalize({ x: 100, y: 100, width: -40, height: 50 }))
      .toEqual({ x: 60, y: 100, width: 40, height: 50 });
  });

  it('负高度翻到上边', () => {
    expect(normalize({ x: 100, y: 100, width: 40, height: -50 }))
      .toEqual({ x: 100, y: 50, width: 40, height: 50 });
  });

  it('双向负都翻', () => {
    expect(normalize({ x: 100, y: 100, width: -40, height: -50 }))
      .toEqual({ x: 60, y: 50, width: 40, height: 50 });
  });

  it('零宽高保持零，不产生 NaN', () => {
    const r = normalize({ x: 10, y: 10, width: 0, height: 0 });
    expect(r).toEqual({ x: 10, y: 10, width: 0, height: 0 });
    expect(Number.isNaN(r.width)).toBe(false);
  });

  it('归一化是幂等的', () => {
    const once = normalize({ x: 100, y: 100, width: -40, height: -50 });
    expect(normalize(once)).toEqual(once);
  });
});
