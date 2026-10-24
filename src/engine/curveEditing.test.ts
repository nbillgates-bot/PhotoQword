/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  CURVE_SIZE,
  HIT_RADIUS,
  addControlPoint,
  hitPoint,
  moveControlPoint,
  removeControlPoint,
  toCurvePoint,
} from './curveEditing';
import { buildCurveLut, defaultCurve } from './curves';

describe('toCurvePoint', () => {
  it('左下角是黑场原点', () => {
    expect(toCurvePoint(0, CURVE_SIZE - 1)).toEqual({ x: 0, y: 0 });
  });

  it('右上角是白场', () => {
    expect(toCurvePoint(255, 0)).toEqual({ x: 255, y: 255 });
  });

  it('y 轴翻转：画布往下走，色阶就变暗', () => {
    const high = toCurvePoint(128, 50);
    const low = toCurvePoint(128, 200);
    expect(high.y).toBeGreaterThan(low.y);
  });

  it('超出画布的坐标被夹到 0..255', () => {
    expect(toCurvePoint(-40, -40)).toEqual({ x: 0, y: 255 });
    expect(toCurvePoint(9999, 9999)).toEqual({ x: 255, y: 0 });
  });

  it('取整不产生小数', () => {
    const point = toCurvePoint(12.4, 80.6);
    expect(Number.isInteger(point.x)).toBe(true);
    expect(Number.isInteger(point.y)).toBe(true);
  });
});

describe('hitPoint', () => {
  const points = [
    { x: 0, y: 0 },
    { x: 128, y: 128 },
    { x: 255, y: 255 },
  ];

  it('正中命中', () => {
    expect(hitPoint(points, { x: 128, y: 128 })).toBe(1);
  });

  it('容差之内算命中', () => {
    expect(hitPoint(points, { x: 128 + HIT_RADIUS - 1, y: 128 })).toBe(1);
  });

  it('容差之外不命中', () => {
    expect(hitPoint(points, { x: 128 + HIT_RADIUS + 1, y: 128 })).toBe(-1);
  });

  it('空白处返回 -1', () => {
    expect(hitPoint(points, { x: 60, y: 200 })).toBe(-1);
  });

  it('空点集返回 -1', () => {
    expect(hitPoint([], { x: 10, y: 10 })).toBe(-1);
  });

  it('两点重叠时取先出现的那个', () => {
    const overlap = [
      { x: 100, y: 100 },
      { x: 102, y: 100 },
    ];
    expect(hitPoint(overlap, { x: 101, y: 100 })).toBe(0);
  });
});

describe('addControlPoint', () => {
  it('加进去并按 x 排好序', () => {
    const result = addControlPoint(defaultCurve(), { x: 128, y: 200 });
    expect(result.points.map((p) => p.x)).toEqual([0, 128, 255]);
    expect(result.index).toBe(1);
  });

  it('返回的下标指向刚加的点', () => {
    const result = addControlPoint(defaultCurve(), { x: 64, y: 90 });
    expect(result.points[result.index]).toEqual({ x: 64, y: 90 });
  });

  it('同一个 x 上加点会顶掉旧的', () => {
    const start = [
      { x: 0, y: 0 },
      { x: 128, y: 60 },
      { x: 255, y: 255 },
    ];
    const result = addControlPoint(start, { x: 128, y: 200 });
    expect(result.points).toHaveLength(3);
    expect(result.points[1]).toEqual({ x: 128, y: 200 });
  });

  it('不改原数组', () => {
    const start = defaultCurve();
    addControlPoint(start, { x: 100, y: 100 });
    expect(start).toHaveLength(2);
  });

  it('点在最左端时替换端点而不是多加一个', () => {
    // 与 PS 一致：在左边缘点一下等于设黑场，点数不变
    const result = addControlPoint(defaultCurve(), { x: 0, y: 200 });
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toEqual({ x: 0, y: 200 });
  });

  it('加完还能生成可用的查找表', () => {
    const result = addControlPoint(defaultCurve(), { x: 128, y: 200 });
    const lut = buildCurveLut(result.points);
    for (const value of lut) expect(Number.isNaN(value)).toBe(false);
  });
});

describe('moveControlPoint', () => {
  const three = () => [
    { x: 0, y: 0 },
    { x: 128, y: 128 },
    { x: 255, y: 255 },
  ];

  it('中间点可以任意移动', () => {
    const result = moveControlPoint(three(), 1, { x: 100, y: 200 });
    expect(result.points[result.index]).toEqual({ x: 100, y: 200 });
  });

  it('首点锁 x，只改 y', () => {
    const result = moveControlPoint(three(), 0, { x: 90, y: 60 });
    expect(result.points[0]).toEqual({ x: 0, y: 60 });
  });

  it('末点锁 x，只改 y', () => {
    const result = moveControlPoint(three(), 2, { x: 100, y: 60 });
    expect(result.points.at(-1)).toEqual({ x: 255, y: 60 });
  });

  it('移动后下标跟着点走', () => {
    // 把中间点拖到最左边附近，它在排序后仍应是下标 1
    const result = moveControlPoint(three(), 1, { x: 10, y: 240 });
    expect(result.index).toBe(1);
    expect(result.points[1]).toEqual({ x: 10, y: 240 });
  });

  it('中间点拖到端点上会被挡在 1，端点不被顶掉', () => {
    const result = moveControlPoint(three(), 1, { x: 0, y: 200 });
    expect(result.points).toHaveLength(3);
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
    expect(result.points[result.index]).toEqual({ x: 1, y: 200 });
  });

  it('中间点拖到右端点上会被挡在 254', () => {
    const result = moveControlPoint(three(), 1, { x: 255, y: 200 });
    expect(result.points).toHaveLength(3);
    expect(result.points.at(-1)).toEqual({ x: 255, y: 255 });
    expect(result.points[result.index]).toEqual({ x: 254, y: 200 });
  });

  it('连续拖过端点后还能拖回来', () => {
    // 回归用例：端点被顶掉的话，被拖的点会变成新端点、x 从此锁死拖不回来
    let state = { points: three(), index: 1 };
    for (const x of [40, 20, 0, 0, 10]) {
      state = moveControlPoint(state.points, state.index, { x, y: 180 });
      expect(state.index).toBeGreaterThanOrEqual(0);
      expect(state.points).toHaveLength(3);
    }
    expect(state.points[state.index]).toEqual({ x: 10, y: 180 });
  });

  it('点数不会因为拖拽而增加', () => {
    const result = moveControlPoint(three(), 1, { x: 200, y: 40 });
    expect(result.points).toHaveLength(3);
  });

  it('下标越界时原样返回', () => {
    const start = three();
    expect(moveControlPoint(start, -1, { x: 10, y: 10 }).points).toBe(start);
    expect(moveControlPoint(start, 9, { x: 10, y: 10 }).index).toBe(-1);
  });

  it('不改原数组', () => {
    const start = three();
    moveControlPoint(start, 1, { x: 200, y: 40 });
    expect(start[1]).toEqual({ x: 128, y: 128 });
  });

  it('移动后查找表不含 NaN', () => {
    const result = moveControlPoint(three(), 1, { x: 0, y: 255 });
    for (const value of buildCurveLut(result.points)) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});

describe('removeControlPoint', () => {
  const three = () => [
    { x: 0, y: 0 },
    { x: 128, y: 200 },
    { x: 255, y: 255 },
  ];

  it('删掉中间点', () => {
    expect(removeControlPoint(three(), 1).map((p) => p.x)).toEqual([0, 255]);
  });

  it('首点删不掉', () => {
    expect(removeControlPoint(three(), 0)).toHaveLength(3);
  });

  it('末点删不掉', () => {
    expect(removeControlPoint(three(), 2)).toHaveLength(3);
  });

  it('下标为 -1（没命中）时不动', () => {
    expect(removeControlPoint(three(), -1)).toHaveLength(3);
  });

  it('只剩两个端点时删不动', () => {
    expect(removeControlPoint(defaultCurve(), 1)).toHaveLength(2);
  });

  it('不改原数组', () => {
    const start = three();
    removeControlPoint(start, 1);
    expect(start).toHaveLength(3);
  });
});
