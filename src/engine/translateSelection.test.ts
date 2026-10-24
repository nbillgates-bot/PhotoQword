/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { rectSelection } from './selection';
import { translateSelection } from './translateSelection';
import { ctx2d } from './canvasUtils';

/** 读某点的蒙版强度（alpha 通道） */
function strengthAt(selection: { mask: HTMLCanvasElement }, x: number, y: number): number {
  return ctx2d(selection.mask).getImageData(x, y, 1, 1).data[3];
}

describe('translateSelection', () => {
  it('平移后 bounds 跟着走，形状不变', () => {
    const original = rectSelection(32, 32, { x: 2, y: 4, width: 8, height: 6 })!;
    const moved = translateSelection(original, 10, 5)!;

    expect(moved.bounds).toEqual({ x: 12, y: 9, width: 8, height: 6 });
    // 新位置内是选中的，旧位置已经不选中了
    expect(strengthAt(moved, 15, 11)).toBe(255);
    expect(strengthAt(moved, 5, 6)).toBe(0);
  });

  it('原选区对象不被修改（返回新对象）', () => {
    const original = rectSelection(32, 32, { x: 2, y: 2, width: 8, height: 8 })!;
    const before = { ...original.bounds };
    const moved = translateSelection(original, 5, 5)!;

    expect(original.bounds).toEqual(before);
    expect(moved.mask).not.toBe(original.mask);
  });

  it('偏移为 0 时选区不变', () => {
    const original = rectSelection(32, 32, { x: 3, y: 3, width: 6, height: 6 })!;
    const moved = translateSelection(original, 0, 0)!;

    expect(moved.bounds).toEqual(original.bounds);
  });

  it('部分移出画布时 bounds 被裁到画布内，不越界', () => {
    const original = rectSelection(32, 32, { x: 20, y: 20, width: 10, height: 10 })!;
    const moved = translateSelection(original, 8, 8)!;

    // 移到 (28,28)-(38,38)，右下越界，应被裁成 (28,28) 宽高 4
    expect(moved.bounds.x).toBe(28);
    expect(moved.bounds.y).toBe(28);
    expect(moved.bounds.x + moved.bounds.width).toBeLessThanOrEqual(32);
    expect(moved.bounds.y + moved.bounds.height).toBeLessThanOrEqual(32);
  });

  it('往左上移出画布时 bounds 不出现负坐标', () => {
    const original = rectSelection(32, 32, { x: 2, y: 2, width: 8, height: 8 })!;
    const moved = translateSelection(original, -5, -5)!;

    expect(moved.bounds.x).toBeGreaterThanOrEqual(0);
    expect(moved.bounds.y).toBeGreaterThanOrEqual(0);
  });

  it('整个移出画布时返回 null', () => {
    const original = rectSelection(32, 32, { x: 2, y: 2, width: 8, height: 8 })!;

    expect(translateSelection(original, 100, 0)).toBeNull();
    expect(translateSelection(original, 0, -100)).toBeNull();
  });

  it('羽化选区平移后仍有中间强度，且不产生 NaN', () => {
    const original = rectSelection(32, 32, { x: 8, y: 8, width: 12, height: 12 }, { feather: 3 })!;
    const moved = translateSelection(original, 4, 0)!;

    const data = ctx2d(moved.mask).getImageData(0, 0, 32, 32).data;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
    // 中心仍是完全选中
    expect(strengthAt(moved, 18, 14)).toBe(255);
  });
});
