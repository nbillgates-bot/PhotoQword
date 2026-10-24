/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { effectivePressure, pressureSize } from './pointerPressure';

describe('effectivePressure', () => {
  it('鼠标按下时规范给的 0.5 是占位值，不是半力，按 1 算', () => {
    // 这条就是「笔刷大小和设置对不上」那个 bug 的回归用例
    expect(effectivePressure('mouse', 0.5)).toBe(1);
  });

  it('触屏不报压感，也按 1 算', () => {
    expect(effectivePressure('touch', 0)).toBe(1);
    expect(effectivePressure('touch', 0.5)).toBe(1);
  });

  it('手写笔的真实力度照用', () => {
    expect(effectivePressure('pen', 0.25)).toBe(0.25);
    expect(effectivePressure('pen', 1)).toBe(1);
  });

  it('手写笔报 0 时按 1：有些触控笔整笔都报 0，信了就一笔画不出来', () => {
    expect(effectivePressure('pen', 0)).toBe(1);
  });

  it('超出 1 的值夹回 1（驱动偶发）', () => {
    expect(effectivePressure('pen', 1.4)).toBe(1);
  });

  it('负值与 NaN 都按 1，不把脏值透给笔刷', () => {
    expect(effectivePressure('pen', -1)).toBe(1);
    expect(effectivePressure('pen', Number.NaN)).toBe(1);
  });

  it('未知的 pointerType 走保守分支', () => {
    expect(effectivePressure('', 0.5)).toBe(1);
  });

  it('结果永远在 (0, 1] 内，不会给出 NaN', () => {
    for (const type of ['mouse', 'touch', 'pen', 'unknown']) {
      for (const value of [-1, 0, 0.001, 0.5, 1, 2, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = effectivePressure(type, value);
        expect(Number.isNaN(result)).toBe(false);
        expect(result).toBeGreaterThan(0);
        expect(result).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('pressureSize', () => {
  it('满压时就是设定的尺寸', () => {
    expect(pressureSize(100, 1)).toBe(100);
  });

  it('压感越轻越细，但不小于 0.4 倍', () => {
    expect(pressureSize(100, 0)).toBeCloseTo(40);
    expect(pressureSize(100, 0.5)).toBeCloseTo(70);
  });

  it('单调不减', () => {
    let previous = 0;
    for (let p = 0; p <= 1; p += 0.1) {
      const size = pressureSize(50, p);
      expect(size).toBeGreaterThanOrEqual(previous);
      previous = size;
    }
  });

  it('极小笔刷也至少 1px，不然什么都画不出来', () => {
    expect(pressureSize(1, 0)).toBe(1);
    expect(pressureSize(0.5, 0)).toBe(1);
  });

  it('宽高为 1 的边界与 0 尺寸都不产出 NaN', () => {
    for (const base of [0, 0.5, 1, 4000]) {
      const size = pressureSize(base, 0.3);
      expect(Number.isNaN(size)).toBe(false);
      expect(size).toBeGreaterThanOrEqual(1);
    }
  });
});
