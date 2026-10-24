/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { centroid, spreadOf, type TouchPoint } from './touchGeometry';

const at = (id: number, x: number, y: number): TouchPoint => ({ id, point: { x, y } });

describe('centroid', () => {
  it('空集给原点，不产出 NaN', () => {
    const center = centroid([]);
    expect(center).toEqual({ x: 0, y: 0 });
    expect(Number.isNaN(center.x)).toBe(false);
  });

  it('单点就是它自己', () => {
    expect(centroid([at(1, 30, 40)])).toEqual({ x: 30, y: 40 });
  });

  it('两点取中点', () => {
    expect(centroid([at(1, 0, 0), at(2, 100, 50)])).toEqual({ x: 50, y: 25 });
  });

  it('三点取平均', () => {
    expect(centroid([at(1, 0, 0), at(2, 30, 0), at(3, 0, 30)])).toEqual({ x: 10, y: 10 });
  });
});

describe('spreadOf', () => {
  it('少于两指没有张开度', () => {
    expect(spreadOf([])).toBe(0);
    expect(spreadOf([at(1, 10, 10)])).toBe(0);
  });

  it('双指时等于两指间距的一半（捏合倍率才能直接用比值）', () => {
    // 两指相距 100，各距中点 50
    expect(spreadOf([at(1, 0, 0), at(2, 100, 0)])).toBeCloseTo(50, 6);
  });

  it('两指重合时为 0，供调用方跳过捏合判定', () => {
    expect(spreadOf([at(1, 20, 20), at(2, 20, 20)])).toBe(0);
  });

  it('整体张开一倍，张开度也翻倍（倍率与手指数无关）', () => {
    const near = spreadOf([at(1, -10, 0), at(2, 10, 0), at(3, 0, 10)]);
    const far = spreadOf([at(1, -20, 0), at(2, 20, 0), at(3, 0, 20)]);
    expect(far / near).toBeCloseTo(2, 6);
  });

  it('整体平移不改变张开度', () => {
    const here = spreadOf([at(1, 0, 0), at(2, 60, 80)]);
    const there = spreadOf([at(1, 500, 300), at(2, 560, 380)]);
    expect(there).toBeCloseTo(here, 6);
  });
});
