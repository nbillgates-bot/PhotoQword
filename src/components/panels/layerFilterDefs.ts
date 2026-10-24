/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ComponentType } from 'react';
import { Folder, Image, Shapes, Type } from 'lucide-react';
import type { LayerType } from '../../types';
import type { FilterAttribute, FilterKind } from '../../engine/layerFilter';
import type { SelectOption } from '../ui/Select';

/**
 * 过滤栏的选项数据。渲染由 LayerFilterBar 消费，加一项只改这里。
 * 用词与 PS 中文版过滤栏一致。
 */

/**
 * 「按什么筛」下拉。PS 里还有「智能对象」「已选定」等，我们没有的不列。
 * label 存词条 key，由 LayerFilterBar 调 t() 翻译。
 */
export const FILTER_KINDS: SelectOption<FilterKind>[] = [
  { value: 'type', label: 'layerFilter.type' },
  { value: 'name', label: 'layerFilter.name' },
  { value: 'mode', label: 'layerFilter.mode' },
  { value: 'color', label: 'layerFilter.color' },
  { value: 'attribute', label: 'layerFilter.attribute' },
];

/**
 * kind === 'type' 时那排图标开关。
 * PS 是像素/调整/文字/形状/智能对象五个，我们只有其中对得上的四类。
 */
export const FILTER_TYPES: {
  value: LayerType;
  label: string;
  Icon: ComponentType<{ size?: number }>;
}[] = [
  { value: 'raster', label: 'layerType.raster', Icon: Image },
  { value: 'text', label: 'layerType.text', Icon: Type },
  { value: 'shape', label: 'layerType.shape', Icon: Shapes },
  { value: 'group', label: 'layerType.group', Icon: Folder },
];

export const FILTER_ATTRIBUTES: SelectOption<FilterAttribute>[] = [
  { value: 'visible', label: 'layerAttr.visible' },
  { value: 'hidden', label: 'layerAttr.hidden' },
  { value: 'locked', label: 'layerAttr.locked' },
  { value: 'masked', label: 'layerAttr.masked' },
  { value: 'clipped', label: 'layerAttr.clipped' },
];
