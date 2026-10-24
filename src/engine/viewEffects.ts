/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 图层样式在视口渲染下的参数换算。
 *
 * layerEffects.ts 里的效果都按「源画布的像素」算尺寸:投影偏移 distance、
 * 模糊半径 size 都是像素数。文档尺寸渲染时源画布就是文档,像素数直接等于
 * 文档坐标,不用换算。
 *
 * 视口渲染下源画布是视口尺寸的,同一块内容占的像素数变成了 scale 倍,
 * 所以效果参数也要跟着乘 scale,否则放大时投影会显得越来越细、
 * 缩小时越来越粗——效果的视觉大小应该跟着画面一起缩放,与 PS 一致。
 */

import type {
  DropShadowEffect,
  InnerGlowEffect,
  LayerEffects,
  OuterGlowEffect,
  StrokeEffect,
} from '../types/effects';

/**
 * 把像素尺寸参数缩到视口比例。
 *
 * 下限 0 不是多余的:scale 很小时(缩略视图)算出来可能是 0.01,
 * 而 layerEffects 里用 `> 0.5` 判断要不要做形态学运算,小于它就整步跳过,
 * 这正是我们想要的——那种尺度下效果本来就看不见,省掉运算。
 */
function scaleLength(value: number, scale: number): number {
  return Math.max(0, value * scale);
}

export function scaleDropShadow(effect: DropShadowEffect, scale: number): DropShadowEffect {
  if (scale === 1) return effect;
  return {
    ...effect,
    distance: scaleLength(effect.distance, scale),
    size: scaleLength(effect.size, scale),
  };
}

export function scaleOuterGlow(effect: OuterGlowEffect, scale: number): OuterGlowEffect {
  if (scale === 1) return effect;
  return { ...effect, size: scaleLength(effect.size, scale) };
}

export function scaleInnerGlow(effect: InnerGlowEffect, scale: number): InnerGlowEffect {
  if (scale === 1) return effect;
  return { ...effect, size: scaleLength(effect.size, scale) };
}

export function scaleStroke(effect: StrokeEffect, scale: number): StrokeEffect {
  if (scale === 1) return effect;
  return { ...effect, size: scaleLength(effect.size, scale) };
}

/**
 * 效果画到图层 bounds 之外最多多远(文档像素)。
 *
 * 中间缓冲只开到图层的可见范围,所以必须知道要往外留多少边,
 * 否则投影和外发光会被缓冲边界切掉。
 *
 * 各项取最大值而不是相加:它们各自独立地从 bounds 往外扩,不叠加。
 * 投影是偏移 + 模糊都会推远,所以那一项要相加。
 * 内发光与内描边只往里画,不影响外扩。
 */
export function effectReach(effects: LayerEffects): number {
  let reach = 0;
  const { dropShadow, outerGlow, stroke } = effects;
  if (dropShadow?.enabled) {
    // spread 会先膨胀 size/2,再被 size 模糊一次,所以按 distance + size 算上限
    reach = Math.max(reach, Math.abs(dropShadow.distance) + dropShadow.size);
  }
  if (outerGlow?.enabled) reach = Math.max(reach, outerGlow.size);
  if (stroke?.enabled && stroke.position !== 'inside') reach = Math.max(reach, stroke.size);
  return reach;
}
