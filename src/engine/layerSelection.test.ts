/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer, LayerType } from '../types';
import { createCanvas } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { applySolo, normalizeSelection, resolveSelection, soloVisibleIds } from './layerSelection';

/** 造一个测试图层，只填选择与可见性关心的字段 */
function mk(
  id: string,
  parentId: string | null = null,
  type: LayerType = 'raster',
  extra: Partial<Layer> = {},
): Layer {
  const canvas = createCanvas(1, 1);
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: type === 'group' ? 'pass-through' : 'normal',
    canvas,
    bounds: boundsFor(canvas),
    parentId,
    ...extra,
  };
}

const g = (id: string, parentId: string | null = null, extra: Partial<Layer> = {}) =>
  mk(id, parentId, 'group', extra);

describe('normalizeSelection', () => {
  it('滤掉已经不存在的图层', () => {
    const layers = [mk('a'), mk('b')];
    expect(normalizeSelection(layers, ['a', 'gone', 'b'], 'a')).toEqual(['a', 'b']);
  });

  it('活动层不在集合里时退回单选', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    // 集合是上一轮残留，活动层已经被别的 action 改到 c
    expect(normalizeSelection(layers, ['a', 'b'], 'c')).toEqual(['c']);
  });

  it('活动层为 null 时保留仍存在的那些', () => {
    const layers = [mk('a')];
    expect(normalizeSelection(layers, ['a'], null)).toEqual(['a']);
    expect(normalizeSelection(layers, [], null)).toEqual([]);
  });

  it('活动层也不存在时返回空', () => {
    expect(normalizeSelection([mk('a')], ['x'], 'gone')).toEqual([]);
  });
});

describe('resolveSelection set', () => {
  it('普通点击只选它', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    const out = resolveSelection(layers, ['a', 'b'], 'a', 'c', 'set');
    expect(out).toEqual({ ids: ['c'], activeId: 'c' });
  });

  it('点不存在的图层时原样返回', () => {
    const layers = [mk('a')];
    const out = resolveSelection(layers, ['a'], 'a', 'gone', 'set');
    expect(out).toEqual({ ids: ['a'], activeId: 'a' });
  });
});

describe('resolveSelection toggle', () => {
  it('加选未选中的，并把它变成活动层', () => {
    const layers = [mk('a'), mk('b')];
    const out = resolveSelection(layers, ['a'], 'a', 'b', 'toggle');
    expect(out).toEqual({ ids: ['a', 'b'], activeId: 'b' });
  });

  it('取消已选中的，其他保持', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    const out = resolveSelection(layers, ['a', 'b', 'c'], 'a', 'b', 'toggle');
    expect(out).toEqual({ ids: ['a', 'c'], activeId: 'a' });
  });

  it('取消的正好是活动层时活动层顺移', () => {
    const layers = [mk('a'), mk('b')];
    const out = resolveSelection(layers, ['a', 'b'], 'b', 'b', 'toggle');
    expect(out).toEqual({ ids: ['a'], activeId: 'a' });
  });

  it('不允许把最后一层也取消掉', () => {
    const layers = [mk('a')];
    const out = resolveSelection(layers, ['a'], 'a', 'a', 'toggle');
    expect(out).toEqual({ ids: ['a'], activeId: 'a' });
  });
});

describe('resolveSelection range', () => {
  it('从活动层连选到点击的层，活动层不变', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    // 面板自上而下是 c b a
    const out = resolveSelection(layers, ['a'], 'a', 'c', 'range');
    expect(out.ids).toEqual(['c', 'b', 'a']);
    expect(out.activeId).toBe('a');
  });

  it('反向连选结果一致', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    const out = resolveSelection(layers, ['c'], 'c', 'a', 'range');
    expect(out.ids).toEqual(['c', 'b', 'a']);
    expect(out.activeId).toBe('c');
  });

  it('折叠组里的子图层不被连选捎带进来', () => {
    const layers = [mk('a'), g('G', null, { collapsed: true }), mk('x', 'G'), mk('b')];
    // 面板上只有 b G a 三行，x 藏在折叠的 G 里
    const out = resolveSelection(layers, ['b'], 'b', 'a', 'range');
    expect(out.ids).toEqual(['b', 'G', 'a']);
    expect(out.ids).not.toContain('x');
  });

  it('展开的组连选要包含子图层', () => {
    const layers = [mk('a'), g('G'), mk('x', 'G'), mk('b')];
    const out = resolveSelection(layers, ['b'], 'b', 'a', 'range');
    expect(out.ids).toEqual(['b', 'G', 'x', 'a']);
  });

  it('点的就是活动层时退化为单选', () => {
    const layers = [mk('a'), mk('b')];
    const out = resolveSelection(layers, ['a', 'b'], 'a', 'a', 'range');
    expect(out).toEqual({ ids: ['a'], activeId: 'a' });
  });

  it('没有活动层时退化为单选', () => {
    const layers = [mk('a'), mk('b')];
    const out = resolveSelection(layers, [], null, 'b', 'range');
    expect(out).toEqual({ ids: ['b'], activeId: 'b' });
  });
});

describe('soloVisibleIds', () => {
  it('保留自己、祖先组和后代', () => {
    const layers = [g('G'), g('H', 'G'), mk('x', 'H'), mk('y', 'H'), mk('z')];
    // solo H：H 自己 + 祖先 G + 后代 x y
    expect(soloVisibleIds(layers, 'H')).toEqual(new Set(['H', 'G', 'x', 'y']));
  });

  it('普通图层只留自己和祖先', () => {
    const layers = [g('G'), mk('x', 'G'), mk('y', 'G')];
    expect(soloVisibleIds(layers, 'x')).toEqual(new Set(['x', 'G']));
  });

  it('目标不存在时全部保留，不至于整个画面变空', () => {
    const layers = [mk('a'), mk('b')];
    expect(soloVisibleIds(layers, 'gone')).toEqual(new Set(['a', 'b']));
  });
});

describe('applySolo', () => {
  it('soloId 为 null 时原数组返回，引用都不变', () => {
    const layers = [mk('a'), mk('b')];
    const out = applySolo(layers, null);
    expect(out).toBe(layers);
  });

  it('只留目标层与其祖先，其余隐藏', () => {
    const layers = [g('G'), mk('x', 'G'), mk('z')];
    const out = applySolo(layers, 'x');
    const vis = Object.fromEntries(out.map((l) => [l.id, l.visible]));
    expect(vis).toEqual({ G: true, x: true, z: false });
  });

  it('目标层自己被眼睛关掉时也要显示出来', () => {
    const layers = [mk('a', null, 'raster', { visible: false }), mk('b')];
    const out = applySolo(layers, 'a');
    expect(out.find((l) => l.id === 'a')?.visible).toBe(true);
  });

  it('不修改传入的图层对象', () => {
    const layers = [mk('a'), mk('b')];
    applySolo(layers, 'a');
    // b 在原数组里必须还是可见的，solo 只能作用在返回值上
    expect(layers.find((l) => l.id === 'b')?.visible).toBe(true);
  });

  it('本来就该隐藏的图层不产生新对象', () => {
    const hidden = mk('z', null, 'raster', { visible: false });
    const layers = [mk('a'), hidden];
    const out = applySolo(layers, 'a');
    // 没变化就复用原引用，省掉一次无意义的重绘
    expect(out.find((l) => l.id === 'z')).toBe(hidden);
  });
});
