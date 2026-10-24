/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  effectReach,
  scaleDropShadow,
  scaleInnerGlow,
  scaleOuterGlow,
  scaleStroke,
} from './viewEffects';
import {
  DEFAULT_DROP_SHADOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_STROKE,
} from '../types/effects';

describe('scaleDropShadow', () => {
  it('scale 为 1 时原样返回同一个对象,不做多余分配', () => {
    expect(scaleDropShadow(DEFAULT_DROP_SHADOW, 1)).toBe(DEFAULT_DROP_SHADOW);
  });

  it('放大时 distance 和 size 一起乘 scale', () => {
    const scaled = scaleDropShadow({ ...DEFAULT_DROP_SHADOW, distance: 5, size: 8 }, 2);
    expect(scaled.distance).toBe(10);
    expect(scaled.size).toBe(16);
  });

  it('缩小时按比例变小,允许小于 1 的值', () => {
    const scaled = scaleDropShadow({ ...DEFAULT_DROP_SHADOW, distance: 5, size: 4 }, 0.25);
    expect(scaled.distance).toBeCloseTo(1.25);
    expect(scaled.size).toBe(1);
  });

  it('极小 scale 下算出接近 0 的值也不为负', () => {
    const scaled = scaleDropShadow({ ...DEFAULT_DROP_SHADOW, distance: 5, size: 5 }, 0.001);
    expect(scaled.size).toBeGreaterThanOrEqual(0);
    expect(scaled.distance).toBeGreaterThanOrEqual(0);
  });

  it('不碰非像素参数:角度、颜色、不透明度、扩展、混合模式', () => {
    const source = { ...DEFAULT_DROP_SHADOW, angle: 45, spread: 30, opacity: 60 };
    const scaled = scaleDropShadow(source, 3);
    expect(scaled.angle).toBe(45);
    expect(scaled.spread).toBe(30);
    expect(scaled.opacity).toBe(60);
    expect(scaled.color).toBe(source.color);
    expect(scaled.blendMode).toBe(source.blendMode);
    expect(scaled.enabled).toBe(source.enabled);
  });

  it('返回新对象,不就地改传入的配置', () => {
    const source = { ...DEFAULT_DROP_SHADOW, distance: 5, size: 5 };
    scaleDropShadow(source, 4);
    expect(source.distance).toBe(5);
    expect(source.size).toBe(5);
  });
});

describe('scaleOuterGlow', () => {
  it('scale 为 1 时原样返回', () => {
    expect(scaleOuterGlow(DEFAULT_OUTER_GLOW, 1)).toBe(DEFAULT_OUTER_GLOW);
  });

  it('size 乘 scale,spread 不动', () => {
    const scaled = scaleOuterGlow({ ...DEFAULT_OUTER_GLOW, size: 6, spread: 20 }, 2.5);
    expect(scaled.size).toBe(15);
    expect(scaled.spread).toBe(20);
  });
});

describe('scaleInnerGlow', () => {
  it('scale 为 1 时原样返回', () => {
    expect(scaleInnerGlow(DEFAULT_INNER_GLOW, 1)).toBe(DEFAULT_INNER_GLOW);
  });

  it('size 乘 scale,source 与 choke 不动', () => {
    const scaled = scaleInnerGlow(
      { ...DEFAULT_INNER_GLOW, size: 4, choke: 15, source: 'center' },
      3,
    );
    expect(scaled.size).toBe(12);
    expect(scaled.choke).toBe(15);
    expect(scaled.source).toBe('center');
  });
});

describe('scaleStroke', () => {
  it('scale 为 1 时原样返回', () => {
    expect(scaleStroke(DEFAULT_STROKE, 1)).toBe(DEFAULT_STROKE);
  });

  it('size 乘 scale,position 不动', () => {
    const scaled = scaleStroke({ ...DEFAULT_STROKE, size: 3, position: 'inside' }, 2);
    expect(scaled.size).toBe(6);
    expect(scaled.position).toBe('inside');
  });

  it('1px 描边在缩小视图下退化成小于 1 的值而不是 0 以下', () => {
    const scaled = scaleStroke({ ...DEFAULT_STROKE, size: 1 }, 0.1);
    expect(scaled.size).toBeCloseTo(0.1);
    expect(scaled.size).toBeGreaterThan(0);
  });
});

/*
 * effectReach 决定局部缓冲要往外留多少边。留少了效果会被缓冲边界切掉，
 * 是这次改动最可能出现的视觉回归，所以每种效果的上限都要单独钉住。
 */
describe('effectReach', () => {
  it('没有效果时不用留边', () => {
    expect(effectReach({})).toBe(0);
  });

  it('效果存在但没启用一样不用留边', () => {
    expect(
      effectReach({ dropShadow: { ...DEFAULT_DROP_SHADOW, enabled: false, size: 50 } }),
    ).toBe(0);
  });

  it('投影按 |distance| + size 算，负 distance 也要留出来', () => {
    const at = (distance: number) =>
      effectReach({ dropShadow: { ...DEFAULT_DROP_SHADOW, enabled: true, distance, size: 8 } });
    expect(at(10)).toBe(18);
    expect(at(-10)).toBe(18);
  });

  it('外发光按 size 算', () => {
    expect(effectReach({ outerGlow: { ...DEFAULT_OUTER_GLOW, enabled: true, size: 12 } })).toBe(12);
  });

  it('内发光画在图层内部，不需要留边', () => {
    expect(effectReach({ innerGlow: { ...DEFAULT_INNER_GLOW, enabled: true, size: 30 } })).toBe(0);
  });

  it('描边只有外侧和居中要留边，内描边不用', () => {
    const at = (position: 'outside' | 'center' | 'inside') =>
      effectReach({ stroke: { ...DEFAULT_STROKE, enabled: true, size: 6, position } });
    expect(at('outside')).toBe(6);
    expect(at('center')).toBe(6);
    expect(at('inside')).toBe(0);
  });

  it('多个效果同时开时取最大值，不是累加', () => {
    const reach = effectReach({
      dropShadow: { ...DEFAULT_DROP_SHADOW, enabled: true, distance: 2, size: 3 },
      outerGlow: { ...DEFAULT_OUTER_GLOW, enabled: true, size: 20 },
      stroke: { ...DEFAULT_STROKE, enabled: true, size: 4, position: 'outside' },
    });
    expect(reach).toBe(20);
  });

  it('size 为 0 的启用效果算出 0，不产生 NaN', () => {
    const reach = effectReach({
      dropShadow: { ...DEFAULT_DROP_SHADOW, enabled: true, distance: 0, size: 0 },
      outerGlow: { ...DEFAULT_OUTER_GLOW, enabled: true, size: 0 },
    });
    expect(reach).toBe(0);
    expect(Number.isNaN(reach)).toBe(false);
  });
});
