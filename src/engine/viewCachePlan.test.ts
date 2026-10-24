/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * 复用决策的契约。
 *
 * 这里的每一条都对应一种「复用会画错」的情形。缓存的风险全在判断上：
 * 判宽了画面就错，判窄了等于没优化。所以边界值要逐个钉住。
 */
import { describe, expect, it } from 'vitest';
import { planViewCache, type CacheGeometry } from './viewCachePlan';

const BASE: CacheGeometry = {
  viewWidth: 800,
  viewHeight: 600,
  scale: 1,
  originX: 100,
  originY: 50,
};

function geo(over: Partial<CacheGeometry> = {}): CacheGeometry {
  return { ...BASE, ...over };
}

/** 新露出的面积总和，用来验证补画量与位移相称 */
function stripArea(plan: ReturnType<typeof planViewCache>): number {
  if (plan.kind !== 'shift') return 0;
  return plan.strips.reduce((sum, s) => sum + s.width * s.height, 0);
}

describe('没有可用缓存时', () => {
  it('没缓存就全量', () => {
    expect(planViewCache(null, geo(), false)).toEqual({ kind: 'full' });
  });

  it('视口尺寸变了就全量', () => {
    expect(planViewCache(geo(), geo({ viewWidth: 900 }), false).kind).toBe('full');
    expect(planViewCache(geo(), geo({ viewHeight: 700 }), false).kind).toBe('full');
  });
});

describe('什么都没变时', () => {
  it('原样复用，一块都不用补', () => {
    expect(planViewCache(geo(), geo(), false)).toEqual({ kind: 'reuse' });
  });

  it('交互中同样原样复用', () => {
    expect(planViewCache(geo(), geo(), true).kind).toBe('reuse');
  });
});

describe('平移复用', () => {
  it('往右挪露出左边一条，通高', () => {
    const plan = planViewCache(geo(), geo({ originX: 130 }), false);
    expect(plan).toEqual({
      kind: 'shift',
      dx: 30,
      dy: 0,
      strips: [{ x: 0, y: 0, width: 30, height: 600 }],
    });
  });

  it('往左挪露出右边一条', () => {
    const plan = planViewCache(geo(), geo({ originX: 70 }), false);
    expect(plan).toEqual({
      kind: 'shift',
      dx: -30,
      dy: 0,
      strips: [{ x: 770, y: 0, width: 30, height: 600 }],
    });
  });

  it('往下挪露出上边一条，通宽', () => {
    const plan = planViewCache(geo(), geo({ originY: 70 }), false);
    expect(plan).toEqual({
      kind: 'shift',
      dx: 0,
      dy: 20,
      strips: [{ x: 0, y: 0, width: 800, height: 20 }],
    });
  });

  it('往上挪露出下边一条', () => {
    const plan = planViewCache(geo(), geo({ originY: 30 }), false);
    expect(plan).toEqual({
      kind: 'shift',
      dx: 0,
      dy: -20,
      strips: [{ x: 0, y: 580, width: 800, height: 20 }],
    });
  });

  /*
   * 斜着挪时两条边条都要补，而且不能重叠——重叠那块会被白画两遍。
   * 竖条通高，横条让开竖条占的那一段。
   */
  it('斜着挪时两条边条不重叠', () => {
    const plan = planViewCache(geo(), geo({ originX: 130, originY: 70 }), false);
    expect(plan.kind).toBe('shift');
    if (plan.kind !== 'shift') return;
    expect(plan.strips).toEqual([
      { x: 0, y: 0, width: 30, height: 600 },
      { x: 30, y: 0, width: 770, height: 20 },
    ]);
    // 面积 = 30*600 + 770*20，若重叠会多出 30*20
    expect(stripArea(plan)).toBe(30 * 600 + 770 * 20);
  });

  it('反向斜着挪也不重叠', () => {
    const plan = planViewCache(geo(), geo({ originX: 70, originY: 30 }), false);
    expect(plan.kind).toBe('shift');
    if (plan.kind !== 'shift') return;
    expect(plan.strips).toEqual([
      { x: 770, y: 0, width: 30, height: 600 },
      { x: 0, y: 580, width: 770, height: 20 },
    ]);
  });

  it('补画量远小于整屏，否则这个优化没有意义', () => {
    const plan = planViewCache(geo(), geo({ originX: 105 }), false);
    expect(stripArea(plan)).toBeLessThan(800 * 600 * 0.02);
  });
});

describe('平移复用的限制', () => {
  it('非整数挪动会累积漂移，全量重画', () => {
    expect(planViewCache(geo(), geo({ originX: 100.3 }), false).kind).toBe('full');
    expect(planViewCache(geo(), geo({ originY: 50.5 }), false).kind).toBe('full');
  });

  it('整数±微小误差还是算整数', () => {
    expect(planViewCache(geo(), geo({ originX: 130.005 }), false).kind).toBe('shift');
  });

  it('挪得比整屏还多就全量', () => {
    expect(planViewCache(geo(), geo({ originX: 1000 }), false).kind).toBe('full');
    expect(planViewCache(geo(), geo({ originY: -700 }), false).kind).toBe('full');
  });
});

describe('缩放复用', () => {
  it('交互中且倍率在合理范围内时拉伸缓存', () => {
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 1.5 }), true).kind).toBe('rescale');
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 0.6 }), true).kind).toBe('rescale');
  });

  it('停手后即使倍率在范围内也重算，收敛到精确结果', () => {
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 1.5 }), false).kind).toBe('full');
  });

  it('倍率超出范围就全量', () => {
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 2.5 }), true).kind).toBe('full');
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 0.4 }), true).kind).toBe('full');
  });

  it('恰好在上界也能拉伸', () => {
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 2 }), true).kind).toBe('rescale');
  });

  it('恰好在下界也能拉伸', () => {
    expect(planViewCache(geo({ scale: 1 }), geo({ scale: 0.5 }), true).kind).toBe('rescale');
  });
});
