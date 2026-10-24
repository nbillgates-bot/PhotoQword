/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect } from 'vitest';
import { clampDragOffset, type DragBounds } from './dragOffset';

/** 1000x800 视口正中的 400x300 面板 */
function centered(overrides: Partial<DragBounds> = {}): DragBounds {
  return {
    base: { x: 300, y: 250, width: 400, height: 300 },
    viewport: { width: 1000, height: 800 },
    ...overrides,
  };
}

describe('clampDragOffset 不越界时原样返回', () => {
  it('小幅移动不被夹', () => {
    expect(clampDragOffset({ x: 40, y: -30 }, centered())).toEqual({ x: 40, y: -30 });
  });

  it('零位移原样返回', () => {
    expect(clampDragOffset({ x: 0, y: 0 }, centered())).toEqual({ x: 0, y: 0 });
  });
});

describe('clampDragOffset 边界', () => {
  it('向上不越过视口顶边', () => {
    // base.y = 250，所以最多向上 250
    expect(clampDragOffset({ x: 0, y: -9999 }, centered()).y).toBe(-250);
  });

  it('刚好贴到顶边不被夹', () => {
    expect(clampDragOffset({ x: 0, y: -250 }, centered()).y).toBe(-250);
  });

  it('向下要留 keep 高度在视口内', () => {
    // 视口高 800，留 64，面板顶边最多到 736，即位移 736-250=486
    expect(clampDragOffset({ x: 0, y: 9999 }, centered()).y).toBe(486);
  });

  it('向左要留 keep 宽度在视口内', () => {
    // 面板右边缘最少到 x=64，即位移 64-300-400=-636
    expect(clampDragOffset({ x: -9999, y: 0 }, centered()).x).toBe(-636);
  });

  it('向右要留 keep 宽度在视口内', () => {
    // 面板左边缘最多到 1000-64=936，即位移 936-300=636
    expect(clampDragOffset({ x: 9999, y: 0 }, centered()).x).toBe(636);
  });

  it('keep 可以调，调大后可移动范围变小', () => {
    const loose = clampDragOffset({ x: 9999, y: 0 }, centered()).x;
    const tight = clampDragOffset({ x: 9999, y: 0 }, centered({ keep: 200 })).x;
    expect(tight).toBeLessThan(loose);
  });
});

describe('clampDragOffset 退化情形', () => {
  it('面板比视口宽时仍返回有限值，不产生反向夹取', () => {
    const bounds = centered({
      base: { x: -100, y: 0, width: 1200, height: 300 },
    });
    const result = clampDragOffset({ x: 9999, y: 0 }, bounds);
    expect(Number.isFinite(result.x)).toBe(true);
    // 夹取范围反过来时以下限为准，结果不能是那个离谱的 9999
    expect(result.x).toBeLessThan(9999);
  });

  it('面板比视口高时向下仍被夹住', () => {
    const bounds = centered({ base: { x: 300, y: 0, width: 400, height: 1200 } });
    const result = clampDragOffset({ x: 0, y: 9999 }, bounds);
    expect(result.y).toBeLessThan(9999);
  });

  it('宽高为 0 的面板不产生 NaN', () => {
    const bounds = centered({ base: { x: 500, y: 400, width: 0, height: 0 } });
    const result = clampDragOffset({ x: 50, y: 50 }, bounds);
    expect(Number.isNaN(result.x)).toBe(false);
    expect(Number.isNaN(result.y)).toBe(false);
  });

  it('视口为 0 时不抛错', () => {
    const bounds = centered({ viewport: { width: 0, height: 0 } });
    expect(() => clampDragOffset({ x: 10, y: 10 }, bounds)).not.toThrow();
  });
});
