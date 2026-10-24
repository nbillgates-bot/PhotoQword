/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Color, Justification } from 'ag-psd';
import type { TextData } from '../types';
import { DEFAULT_TEXT } from './textRender';

/**
 * PSD 的颜色与枚举 → 我们的取值。
 *
 * 从 psdTextConvert 拆出来是因为那边已经超了单文件行数上限（规约 §1.2），
 * 而这两件事本来就是独立的纯映射：不认识 LayerTextData，也不碰位置与字体解析。
 */

/** 0-255 的分量转两位十六进制 */
function hex2(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return clamped.toString(16).padStart(2, '0');
}

/**
 * ag-psd 的 Color → CSS 颜色串。
 *
 * Color 是七种色彩模型的联合类型，用 in 逐个判别。
 * 注意分量是 **0-255**，不是 0-1：ag-psd 的 decodeColor 已经乘过 255 了
 * （text.js 里 `{ r: c[1] * 255, ... }`）。当成 0-1 再乘一次会全部饱和成白色。
 *
 * 只认 RGB / RGBA / 灰度这三种——文字颜色实际上几乎只会是这几种。
 * CMYK / LAB / HSB 需要色彩空间换算，没有原文件可核对，
 * 与其给一个偏色的结果不如退回默认色，让用户自己改。
 */
export function colorToCss(color: Color | undefined): string {
  if (!color) return DEFAULT_TEXT.color;

  if ('r' in color && 'g' in color && 'b' in color) {
    const base = `#${hex2(color.r)}${hex2(color.g)}${hex2(color.b)}`;
    // RGBA 的 a 同样是 0-255 刻度，CSS 的 alpha 要 0-1
    if ('a' in color && color.a < 255) {
      return `rgba(${Math.round(color.r)},${Math.round(color.g)},${Math.round(color.b)},${(color.a / 255).toFixed(3)})`;
    }
    return base;
  }

  // 灰度：k 是 0-255 的明度，三个分量取同值
  if ('k' in color && !('c' in color)) {
    const g = hex2(color.k);
    return `#${g}${g}${g}`;
  }

  return DEFAULT_TEXT.color;
}

/**
 * PSD 的段落对齐 → 我们的 align。
 *
 * PSD 有七种，其中四种是两端对齐的变体。我们只有左/中/右三种，
 * 两端对齐按它「最后一行怎么摆」归到最接近的一档，与 PS 的视觉重心一致。
 */
export function justificationToAlign(
  justification: Justification | undefined,
): TextData['align'] {
  switch (justification) {
    case 'right':
    case 'justify-right':
      return 'right';
    case 'center':
    case 'justify-center':
      return 'center';
    default:
      // left / justify-left / justify-all / undefined
      return 'left';
  }
}
