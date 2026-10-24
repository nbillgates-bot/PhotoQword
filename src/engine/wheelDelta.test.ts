/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { wheelDelta } from './wheelDelta';

describe('wheelDelta', () => {
  it('像素模式原样返回', () => {
    expect(wheelDelta({ deltaX: 12, deltaY: -100, deltaMode: 0 })).toEqual({ x: 12, y: -100 });
  });

  it('行模式放大成像素，不再是个位数', () => {
    const delta = wheelDelta({ deltaX: 0, deltaY: -3, deltaMode: 1 });
    expect(delta.y).toBe(-48);
  });

  it('页模式也归一到像素', () => {
    expect(wheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }).y).toBe(400);
  });

  it('未知 deltaMode 按像素处理，不放大', () => {
    expect(wheelDelta({ deltaX: 5, deltaY: 5, deltaMode: 7 })).toEqual({ x: 5, y: 5 });
  });

  it('方向保留', () => {
    expect(wheelDelta({ deltaX: -4, deltaY: 4, deltaMode: 1 })).toEqual({ x: -64, y: 64 });
  });

  it('NaN 压成 0，不把 pan 带成 NaN', () => {
    const delta = wheelDelta({ deltaX: NaN, deltaY: NaN, deltaMode: 0 });
    expect(delta).toEqual({ x: 0, y: 0 });
  });

  it('Infinity 也压成 0', () => {
    expect(wheelDelta({ deltaX: Infinity, deltaY: -Infinity, deltaMode: 0 })).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('零增量保持零', () => {
    expect(wheelDelta({ deltaX: 0, deltaY: 0, deltaMode: 1 })).toEqual({ x: 0, y: 0 });
  });
});
