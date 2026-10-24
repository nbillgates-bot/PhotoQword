/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BlendMode } from './index';

/**
 * 图层样式/效果。
 *
 * 对齐 PS 的「混合选项」对话框，目前实现：投影、外发光、内发光、描边。
 * 配置只涉及非像素属性，存进历史记录与层属性里，合成时按需渲染。
 */

export interface DropShadowEffect {
  enabled: boolean;
  blendMode: BlendMode;
  color: string;
  opacity: number;
  angle: number;
  distance: number;
  spread: number;
  size: number;
}

export interface OuterGlowEffect {
  enabled: boolean;
  blendMode: BlendMode;
  color: string;
  opacity: number;
  spread: number;
  size: number;
}

export interface InnerGlowEffect {
  enabled: boolean;
  blendMode: BlendMode;
  color: string;
  opacity: number;
  source: 'edge' | 'center';
  choke: number;
  size: number;
}

export interface StrokeEffect {
  enabled: boolean;
  size: number;
  position: 'outside' | 'inside' | 'center';
  blendMode: BlendMode;
  color: string;
  opacity: number;
}

/** 图层样式集合 */
export interface LayerEffects {
  dropShadow?: DropShadowEffect;
  outerGlow?: OuterGlowEffect;
  innerGlow?: InnerGlowEffect;
  stroke?: StrokeEffect;
}

/** 效果种类，与 LayerEffects 的键一一对应 */
export type EffectKind = keyof LayerEffects;

/** PS 默认值 */
export const DEFAULT_DROP_SHADOW: DropShadowEffect = {
  enabled: true,
  blendMode: 'multiply',
  color: '#000000',
  opacity: 75,
  angle: 120,
  distance: 5,
  spread: 0,
  size: 5,
};

export const DEFAULT_OUTER_GLOW: OuterGlowEffect = {
  enabled: true,
  blendMode: 'screen',
  color: '#fff7c8',
  opacity: 75,
  spread: 0,
  size: 5,
};

export const DEFAULT_INNER_GLOW: InnerGlowEffect = {
  enabled: true,
  blendMode: 'screen',
  color: '#ffffff',
  opacity: 75,
  source: 'edge',
  choke: 0,
  size: 5,
};

export const DEFAULT_STROKE: StrokeEffect = {
  enabled: true,
  size: 3,
  position: 'outside',
  blendMode: 'normal',
  color: '#ff0000',
  opacity: 100,
};

/**
 * 各效果的默认参数，按种类索引。
 * 放在 types 层是为了让 store 也能取到——第一次勾选某个效果时
 * 要用它初始化，而 store 不能反向依赖 components。
 */
export const DEFAULT_EFFECTS: {
  dropShadow: DropShadowEffect;
  outerGlow: OuterGlowEffect;
  innerGlow: InnerGlowEffect;
  stroke: StrokeEffect;
} = {
  dropShadow: DEFAULT_DROP_SHADOW,
  outerGlow: DEFAULT_OUTER_GLOW,
  innerGlow: DEFAULT_INNER_GLOW,
  stroke: DEFAULT_STROKE,
};
