/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  addPan,
  addZoom,
  EMPTY_PENDING,
  isPendingEmpty,
  type PendingView,
} from './pendingView';

describe('isPendingEmpty', () => {
  it('初始态是空的', () => {
    expect(isPendingEmpty(EMPTY_PENDING)).toBe(true);
  });

  it('累积过缩放就不空', () => {
    expect(isPendingEmpty(addZoom(EMPTY_PENDING, 1.12, null))).toBe(false);
  });

  it('累积过平移就不空', () => {
    expect(isPendingEmpty(addPan(EMPTY_PENDING, 3, 0))).toBe(false);
  });

  it('平移 0 距离仍算空（避免白提交一帧）', () => {
    expect(isPendingEmpty(addPan(EMPTY_PENDING, 0, 0))).toBe(true);
  });

  it('一放一缩正好抵消时算空（倍率回到 1）', () => {
    const pending = addZoom(addZoom(EMPTY_PENDING, 2, null), 0.5, null);
    expect(pending.zoomFactor).toBe(1);
    expect(isPendingEmpty(pending)).toBe(true);
  });
});

describe('addZoom', () => {
  it('多次缩放是累乘，不是累加', () => {
    const pending = addZoom(addZoom(EMPTY_PENDING, 2, null), 3, null);
    expect(pending.zoomFactor).toBe(6);
  });

  it('焦点取最后一次', () => {
    let pending = addZoom(EMPTY_PENDING, 1.1, { x: 10, y: 10 });
    pending = addZoom(pending, 1.1, { x: 50, y: 60 });
    expect(pending.focus).toEqual({ x: 50, y: 60 });
  });

  it('后一次没给焦点时保留前一次的，不退回 null', () => {
    let pending = addZoom(EMPTY_PENDING, 1.1, { x: 10, y: 20 });
    pending = addZoom(pending, 1.1, null);
    expect(pending.focus).toEqual({ x: 10, y: 20 });
  });

  it('非法倍率被忽略，不污染成 NaN', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const pending = addZoom(EMPTY_PENDING, bad, null);
      expect(pending.zoomFactor).toBe(1);
      expect(Number.isNaN(pending.zoomFactor)).toBe(false);
    }
  });

  it('小于 1 的倍率正常累积（缩小方向）', () => {
    const pending = addZoom(EMPTY_PENDING, 1 / 1.12, null);
    expect(pending.zoomFactor).toBeCloseTo(0.8929, 4);
  });

  it('不修改传入的对象', () => {
    const before: PendingView = { ...EMPTY_PENDING };
    addZoom(before, 2, { x: 1, y: 1 });
    expect(before.zoomFactor).toBe(1);
    expect(before.focus).toBeNull();
  });
});

describe('addPan', () => {
  it('多次平移累加', () => {
    const pending = addPan(addPan(EMPTY_PENDING, 5, -3), 2, 8);
    expect(pending.panX).toBe(7);
    expect(pending.panY).toBe(5);
  });

  it('非有限增量被忽略', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const pending = addPan(EMPTY_PENDING, bad, 1);
      expect(pending.panX).toBe(0);
      expect(Number.isNaN(pending.panX)).toBe(false);
    }
  });

  it('缩放与平移可以在同一帧共存，互不干扰', () => {
    const pending = addPan(addZoom(EMPTY_PENDING, 1.5, { x: 4, y: 4 }), 10, 20);
    expect(pending.zoomFactor).toBe(1.5);
    expect(pending.panX).toBe(10);
    expect(pending.focus).toEqual({ x: 4, y: 4 });
  });

  it('不修改传入的对象', () => {
    const before: PendingView = { ...EMPTY_PENDING };
    addPan(before, 9, 9);
    expect(before.panX).toBe(0);
  });
});
