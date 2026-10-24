/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BlendMode as PsdBlendMode } from 'ag-psd';
import type { BlendMode } from '../types';

/**
 * PSD 混合模式与我们的 BlendMode 之间的映射。
 * 单独一个文件是因为它纯粹是查表数据，psdIO 只消费它（§1.3 数据与逻辑分离）。
 */

/**
 * ag-psd → 我们。
 * PSD 有几个我们没实现的（溶解 dissolve、深色 darker color、浅色 lighter color、
 * 减去 subtract、划分 divide），读进来退化成正常。
 * PS 会原样保留，但我们的合成器没有这些实现，硬映射反而让画面对不上。
 */
const FROM_PSD: Partial<Record<PsdBlendMode, BlendMode>> = {
  'normal': 'normal',
  'pass through': 'pass-through',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
  'linear burn': 'linear-burn',
  'linear dodge': 'linear-dodge',
  'vivid light': 'vivid-light',
  'linear light': 'linear-light',
  'pin light': 'pin-light',
  'hard mix': 'hard-mix',
};

/** 我们 → ag-psd。我们的每个模式 PSD 都有对应，所以是全映射 */
const TO_PSD: Record<BlendMode, PsdBlendMode> = {
  'normal': 'normal',
  'pass-through': 'pass through',
  'multiply': 'multiply',
  'screen': 'screen',
  'overlay': 'overlay',
  'darken': 'darken',
  'lighten': 'lighten',
  'color-dodge': 'color dodge',
  'color-burn': 'color burn',
  'hard-light': 'hard light',
  'soft-light': 'soft light',
  'difference': 'difference',
  'exclusion': 'exclusion',
  'hue': 'hue',
  'saturation': 'saturation',
  'color': 'color',
  'luminosity': 'luminosity',
  'linear-burn': 'linear burn',
  'linear-dodge': 'linear dodge',
  'vivid-light': 'vivid light',
  'linear-light': 'linear light',
  'pin-light': 'pin light',
  'hard-mix': 'hard mix',
};

/** 读 PSD 时用。认不出的模式退化成正常，不抛错 */
export function fromPsdBlend(raw: PsdBlendMode | undefined): BlendMode {
  if (!raw) return 'normal';
  return FROM_PSD[raw] ?? 'normal';
}

/** 写 PSD 时用 */
export function toPsdBlend(mode: BlendMode): PsdBlendMode {
  return TO_PSD[mode];
}
