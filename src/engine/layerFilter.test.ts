/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { createCanvas } from './canvasUtils';
import {
  DEFAULT_LAYER_FILTER,
  filterLayers,
  isFilterActive,
  matchesFilter,
  type LayerFilter,
} from './layerFilter';

function layer(patch: Partial<Layer> = {}): Layer {
  return {
    id: 'l1',
    name: '图层 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas: createCanvas(2, 2),
    ...patch,
  } as Layer;
}

function filter(patch: Partial<LayerFilter> = {}): LayerFilter {
  return { ...DEFAULT_LAYER_FILTER, enabled: true, ...patch };
}

describe('matchesFilter：类型', () => {
  it('一个类型都没勾等于不限，全部命中', () => {
    expect(matchesFilter(layer(), filter({ kind: 'type', types: [] }))).toBe(true);
    expect(matchesFilter(layer({ type: 'group' }), filter({ kind: 'type', types: [] }))).toBe(true);
  });

  it('勾了类型只留对应的层', () => {
    const f = filter({ kind: 'type', types: ['text'] });
    expect(matchesFilter(layer({ type: 'text' }), f)).toBe(true);
    expect(matchesFilter(layer({ type: 'raster' }), f)).toBe(false);
  });

  it('勾多个类型取并集', () => {
    const f = filter({ kind: 'type', types: ['text', 'group'] });
    expect(matchesFilter(layer({ type: 'text' }), f)).toBe(true);
    expect(matchesFilter(layer({ type: 'group' }), f)).toBe(true);
    expect(matchesFilter(layer({ type: 'shape' }), f)).toBe(false);
  });
});

describe('matchesFilter：名称', () => {
  it('空串等于不限', () => {
    expect(matchesFilter(layer(), filter({ kind: 'name', name: '' }))).toBe(true);
  });

  it('只有空格也等于不限', () => {
    expect(matchesFilter(layer(), filter({ kind: 'name', name: '   ' }))).toBe(true);
  });

  it('子串匹配，大小写不敏感', () => {
    const l = layer({ name: 'Background Copy' });
    expect(matchesFilter(l, filter({ kind: 'name', name: 'copy' }))).toBe(true);
    expect(matchesFilter(l, filter({ kind: 'name', name: 'COPY' }))).toBe(true);
    expect(matchesFilter(l, filter({ kind: 'name', name: 'mask' }))).toBe(false);
  });

  it('中文名也能筛', () => {
    expect(matchesFilter(layer({ name: '人物描边' }), filter({ kind: 'name', name: '描边' }))).toBe(
      true,
    );
  });
});

describe('matchesFilter：模式与颜色', () => {
  it('模式要完全相等', () => {
    const f = filter({ kind: 'mode', mode: 'multiply' });
    expect(matchesFilter(layer({ blendMode: 'multiply' }), f)).toBe(true);
    expect(matchesFilter(layer({ blendMode: 'normal' }), f)).toBe(false);
  });

  it('颜色为 undefined 时筛的是「无颜色标记」', () => {
    const f = filter({ kind: 'color', color: undefined });
    expect(matchesFilter(layer(), f)).toBe(true);
    expect(matchesFilter(layer({ color: '#ed1c24' }), f)).toBe(false);
  });

  it('指定颜色只留标了那个颜色的层', () => {
    const f = filter({ kind: 'color', color: '#ed1c24' });
    expect(matchesFilter(layer({ color: '#ed1c24' }), f)).toBe(true);
    expect(matchesFilter(layer({ color: '#00a651' }), f)).toBe(false);
  });
});

describe('matchesFilter：属性', () => {
  it('可见与隐藏互补', () => {
    expect(matchesFilter(layer({ visible: true }), filter({ kind: 'attribute', attribute: 'visible' }))).toBe(true);
    expect(matchesFilter(layer({ visible: true }), filter({ kind: 'attribute', attribute: 'hidden' }))).toBe(false);
    expect(matchesFilter(layer({ visible: false }), filter({ kind: 'attribute', attribute: 'hidden' }))).toBe(true);
  });

  it('「已锁定」任意一种锁都算', () => {
    const f = filter({ kind: 'attribute', attribute: 'locked' });
    expect(matchesFilter(layer({ locked: true }), f)).toBe(true);
    expect(matchesFilter(layer({ lockPixels: true }), f)).toBe(true);
    expect(matchesFilter(layer({ lockTransparent: true }), f)).toBe(true);
    expect(matchesFilter(layer({ lockPosition: true }), f)).toBe(true);
    expect(matchesFilter(layer(), f)).toBe(false);
  });

  it('蒙版与剪贴各看各的字段', () => {
    expect(
      matchesFilter(layer({ mask: createCanvas(2, 2) }), filter({ kind: 'attribute', attribute: 'masked' })),
    ).toBe(true);
    expect(matchesFilter(layer(), filter({ kind: 'attribute', attribute: 'masked' }))).toBe(false);
    expect(
      matchesFilter(layer({ clipped: true }), filter({ kind: 'attribute', attribute: 'clipped' })),
    ).toBe(true);
  });
});

describe('filterLayers', () => {
  const list = [
    layer({ id: 'a', name: 'A', type: 'raster' }),
    layer({ id: 'b', name: 'B', type: 'group' }),
    layer({ id: 'c', name: 'C', type: 'text' }),
  ];

  it('关掉总开关时原样返回同一个数组', () => {
    expect(filterLayers(list, { ...DEFAULT_LAYER_FILTER, enabled: false })).toBe(list);
  });

  it('过滤结果保持原有顺序', () => {
    const out = filterLayers(list, filter({ kind: 'type', types: ['raster', 'text'] }));
    expect(out.map((l) => l.id)).toEqual(['a', 'c']);
  });

  it('一个都不命中时返回空数组，不是 null', () => {
    expect(filterLayers(list, filter({ kind: 'name', name: '不存在' }))).toEqual([]);
  });

  it('空图层列表不报错', () => {
    expect(filterLayers([], filter())).toEqual([]);
  });

  it('平铺输出：组的子层不因为父组没命中而被带走', () => {
    const nested = [
      layer({ id: 'g', name: 'G', type: 'group' }),
      layer({ id: 'k', name: 'K', type: 'text', parentId: 'g' }),
    ];
    const out = filterLayers(nested, filter({ kind: 'type', types: ['text'] }));
    expect(out.map((l) => l.id)).toEqual(['k']);
  });
});

describe('isFilterActive', () => {
  it('总开关关着一律不活跃', () => {
    expect(isFilterActive({ ...DEFAULT_LAYER_FILTER, enabled: false })).toBe(false);
    expect(isFilterActive({ ...DEFAULT_LAYER_FILTER, enabled: false, name: 'x', kind: 'name' })).toBe(
      false,
    );
  });

  it('类型一个都没勾算不活跃：这时列表并没有被筛', () => {
    expect(isFilterActive(filter({ kind: 'type', types: [] }))).toBe(false);
    expect(isFilterActive(filter({ kind: 'type', types: ['text'] }))).toBe(true);
  });

  it('名称为空或全空格算不活跃', () => {
    expect(isFilterActive(filter({ kind: 'name', name: '' }))).toBe(false);
    expect(isFilterActive(filter({ kind: 'name', name: ' ' }))).toBe(false);
    expect(isFilterActive(filter({ kind: 'name', name: 'a' }))).toBe(true);
  });

  it('模式/颜色/属性只要开关开着就算活跃', () => {
    expect(isFilterActive(filter({ kind: 'mode' }))).toBe(true);
    expect(isFilterActive(filter({ kind: 'color' }))).toBe(true);
    expect(isFilterActive(filter({ kind: 'attribute' }))).toBe(true);
  });
});
