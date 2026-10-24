/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BlendMode, Layer, LayerType } from '../types';

/**
 * 图层过滤的纯计算。对应 PS 图层面板顶部那条过滤栏。
 *
 * PS 的过滤栏是「按什么筛」的下拉 + 随之变化的第二个控件 + 右侧总开关。
 * 这里照同一个模型：kind 决定用 types / name / mode / color / attribute 里的哪一个。
 */

/** 按什么筛。顺序与 PS 中文版下拉一致 */
export type FilterKind = 'type' | 'name' | 'mode' | 'color' | 'attribute';

/** 可筛的图层属性。取值限于我们真实支持的功能，没有的不列出来免得筛了没反应 */
export type FilterAttribute = 'visible' | 'hidden' | 'locked' | 'masked' | 'clipped';

export interface LayerFilter {
  /** 总开关。关掉时 filterLayers 原样返回，与 PS 右侧那个开关一致 */
  enabled: boolean;
  kind: FilterKind;
  /** kind === 'type' 时生效，空集合视为不限 */
  types: LayerType[];
  /** kind === 'name' 时生效，大小写不敏感的子串匹配 */
  name: string;
  mode: BlendMode;
  /** undefined 表示筛「无颜色标记」 */
  color: string | undefined;
  attribute: FilterAttribute;
}

export const DEFAULT_LAYER_FILTER: LayerFilter = {
  enabled: false,
  kind: 'type',
  types: [],
  name: '',
  mode: 'normal',
  color: undefined,
  attribute: 'visible',
};

/** 单个图层是否命中过滤条件 */
export function matchesFilter(layer: Layer, filter: LayerFilter): boolean {
  switch (filter.kind) {
    case 'type':
      // 一个都没勾等于不限，PS 里也是全不勾时列表照常全显示
      return filter.types.length === 0 || filter.types.includes(layer.type);
    case 'name': {
      const needle = filter.name.trim().toLowerCase();
      return needle === '' || layer.name.toLowerCase().includes(needle);
    }
    case 'mode':
      return layer.blendMode === filter.mode;
    case 'color':
      return (layer.color ?? undefined) === filter.color;
    case 'attribute':
      return matchesAttribute(layer, filter.attribute);
    default:
      return true;
  }
}

function matchesAttribute(layer: Layer, attribute: FilterAttribute): boolean {
  switch (attribute) {
    case 'visible':
      return layer.visible;
    case 'hidden':
      return !layer.visible;
    case 'locked':
      // 任意一种锁定都算，与 PS 的「已锁定」一致
      return Boolean(
        layer.locked || layer.lockPixels || layer.lockTransparent || layer.lockPosition,
      );
    case 'masked':
      return Boolean(layer.mask);
    case 'clipped':
      return Boolean(layer.clipped);
    default:
      return true;
  }
}

/**
 * 过滤后要显示的图层，按原数组顺序。
 *
 * 过滤开启时**丢掉树结构**：命中的图层一律平铺，不带它的父组，
 * 也不因为父组折叠而隐藏。这是 PS 的行为——筛出来的东西必须看得见，
 * 否则筛了半天结果藏在折叠的组里，等于没筛。
 */
export function filterLayers(layers: Layer[], filter: LayerFilter): Layer[] {
  if (!filter.enabled) return layers;
  return layers.filter((layer) => matchesFilter(layer, filter));
}

/** 过滤条件是否真的会筛掉东西。用来决定要不要在面板上提示「已过滤」 */
export function isFilterActive(filter: LayerFilter): boolean {
  if (!filter.enabled) return false;
  if (filter.kind === 'type') return filter.types.length > 0;
  if (filter.kind === 'name') return filter.name.trim() !== '';
  return true;
}
