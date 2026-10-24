/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { EffectKind } from '../../types';

export type { EffectKind };

/**
 * 一个参数字段的定义。渲染器据此决定用滑块/下拉/颜色块。
 *
 * labelKey 是词条 key，不是成品文字（I18N.md §0）。
 * 翻译在渲染的组件里做，这份定义只说"显示哪一条词条"。
 */
export type FieldDef =
  | { key: string; labelKey: string; kind: 'slider'; min: number; max: number; unit?: string }
  | { key: string; labelKey: string; kind: 'color' }
  | { key: string; labelKey: string; kind: 'blend' }
  | {
      key: string;
      labelKey: string;
      kind: 'select';
      options: { value: string; labelKey: string }[];
    };

/**
 * 一个效果在对话框里的呈现方式。
 * 默认参数不在这里，在 types/effects.ts 的 DEFAULT_EFFECTS——
 * store 初始化效果时也要用它，放这儿会让 store 反向依赖 components。
 */
export interface EffectDef {
  kind: EffectKind;
  /** 名称词条 key，中文取 PS 中文版的叫法 */
  labelKey: string;
  fields: FieldDef[];
}

/** 混合模式与不透明度是四个效果共有的头两项，抽出来免得抄四遍（规约 §1.1）*/
const BLEND_AND_OPACITY: FieldDef[] = [
  { key: 'blendMode', labelKey: 'common.blendMode', kind: 'blend' },
  { key: 'opacity', labelKey: 'common.opacity', kind: 'slider', min: 0, max: 100, unit: '%' },
];

/**
 * 四个效果的定义。
 * 字段顺序对齐 PS「图层样式」对话框里各效果面板的排布。
 */
export const EFFECT_DEFS: EffectDef[] = [
  {
    kind: 'stroke',
    labelKey: 'effect.stroke',
    fields: [
      { key: 'size', labelKey: 'common.size', kind: 'slider', min: 1, max: 100, unit: 'px' },
      {
        key: 'position',
        labelKey: 'effect.field.position',
        kind: 'select',
        options: [
          { value: 'outside', labelKey: 'effect.position.outside' },
          { value: 'inside', labelKey: 'effect.position.inside' },
          { value: 'center', labelKey: 'effect.position.center' },
        ],
      },
      ...BLEND_AND_OPACITY,
      { key: 'color', labelKey: 'common.color', kind: 'color' },
    ],
  },
  {
    kind: 'innerGlow',
    labelKey: 'effect.innerGlow',
    fields: [
      ...BLEND_AND_OPACITY,
      { key: 'color', labelKey: 'common.color', kind: 'color' },
      {
        key: 'source',
        labelKey: 'effect.field.source',
        kind: 'select',
        options: [
          { value: 'edge', labelKey: 'effect.source.edge' },
          { value: 'center', labelKey: 'effect.position.center' },
        ],
      },
      { key: 'choke', labelKey: 'effect.field.choke', kind: 'slider', min: 0, max: 100, unit: '%' },
      { key: 'size', labelKey: 'common.size', kind: 'slider', min: 0, max: 250, unit: 'px' },
    ],
  },
  {
    kind: 'outerGlow',
    labelKey: 'effect.outerGlow',
    fields: [
      ...BLEND_AND_OPACITY,
      { key: 'color', labelKey: 'common.color', kind: 'color' },
      { key: 'spread', labelKey: 'effect.field.spread', kind: 'slider', min: 0, max: 100, unit: '%' },
      { key: 'size', labelKey: 'common.size', kind: 'slider', min: 0, max: 250, unit: 'px' },
    ],
  },
  {
    kind: 'dropShadow',
    labelKey: 'effect.dropShadow',
    fields: [
      ...BLEND_AND_OPACITY,
      { key: 'color', labelKey: 'common.color', kind: 'color' },
      { key: 'angle', labelKey: 'common.angle', kind: 'slider', min: -180, max: 180, unit: '°' },
      { key: 'distance', labelKey: 'common.distance', kind: 'slider', min: 0, max: 250, unit: 'px' },
      { key: 'spread', labelKey: 'effect.field.spread', kind: 'slider', min: 0, max: 100, unit: '%' },
      { key: 'size', labelKey: 'common.size', kind: 'slider', min: 0, max: 250, unit: 'px' },
    ],
  },
];

/** 按种类取定义 */
export function effectDefOf(kind: EffectKind): EffectDef {
  return EFFECT_DEFS.find((def) => def.kind === kind) ?? EFFECT_DEFS[0];
}
