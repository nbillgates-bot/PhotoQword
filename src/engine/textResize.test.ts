/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { MIN_TEXT_BOX, resizeTextBox } from './textResize';

const BOX = { x: 100, y: 50, width: 200, height: 80 };

describe('resizeTextBox', () => {
  it('拖东边只改宽度，原点不动', () => {
    expect(resizeTextBox(BOX, 'e', 30, 0)).toEqual({ x: 100, y: 50, width: 230, height: 80 });
  });

  it('拖南边只改高度，原点不动', () => {
    expect(resizeTextBox(BOX, 's', 0, 20)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  });

  it('拖西边时右边保持不动', () => {
    const next = resizeTextBox(BOX, 'w', 30, 0);
    expect(next.width).toBe(170);
    // 右边缘 = x + width，拖前是 300，拖后必须还是 300
    expect(next.x + next.width).toBe(BOX.x + BOX.width);
  });

  it('拖北边时下边保持不动', () => {
    const next = resizeTextBox(BOX, 'n', 0, 20);
    expect(next.height).toBe(60);
    expect(next.y + next.height).toBe(BOX.y + BOX.height);
  });

  it('拖西北角同时改两个方向，右下角钉住', () => {
    const next = resizeTextBox(BOX, 'nw', 30, 20);
    expect(next.x + next.width).toBe(BOX.x + BOX.width);
    expect(next.y + next.height).toBe(BOX.y + BOX.height);
  });

  it('拖东南角只放大，原点不动', () => {
    expect(resizeTextBox(BOX, 'se', 30, 20)).toEqual({
      x: 100,
      y: 50,
      width: 230,
      height: 100,
    });
  });

  it('尺寸夹在下限，不会变成负数', () => {
    const next = resizeTextBox(BOX, 'se', -9999, -9999);
    expect(next.width).toBe(MIN_TEXT_BOX);
    expect(next.height).toBe(MIN_TEXT_BOX);
  });

  it('夹到下限后继续拖西边，右边缘仍然钉住', () => {
    // 少了原点回退的话，框会跟着指针一路往左跑
    const next = resizeTextBox(BOX, 'w', 9999, 0);
    expect(next.width).toBe(MIN_TEXT_BOX);
    expect(next.x + next.width).toBe(BOX.x + BOX.width);
  });

  it('结果全是整数', () => {
    const next = resizeTextBox(BOX, 'nw', 10.6, 7.3);
    for (const value of [next.x, next.y, next.width, next.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('零位移时原样返回', () => {
    expect(resizeTextBox(BOX, 'se', 0, 0)).toEqual(BOX);
  });
});
