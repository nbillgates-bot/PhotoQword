/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { BlendMode } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';

/**
 * 混合模式实现。
 *
 * canvas 的 globalCompositeOperation 覆盖了 PS 的大部分模式，但缺 6 个：
 * 线性加深、线性减淡、亮光、线性光、点光、实色混合。
 * 这几个只能逐像素算。以前的做法是把 blendMode 直接强转成
 * GlobalCompositeOperation，canvas 认不出来的值会被静默忽略——
 * 用户在面板里选了却没反应，也不报错，是最难查的一类问题。
 *
 * 所以这里用一张显式映射表：canvas 认的走原生（快），不认的走手写。
 */

/** canvas 原生支持的模式 → globalCompositeOperation 值 */
const NATIVE: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
};

/**
 * 逐通道混合函数：输入底色与上色（均为 0..1），返回结果（0..1）。
 * 公式取自 PS 文档与 W3C compositing 规范，b = backdrop，s = source。
 */
type ChannelBlend = (b: number, s: number) => number;

const CUSTOM: Partial<Record<BlendMode, ChannelBlend>> = {
  // 线性加深：相加后减一，比颜色加深更狠，暗部压得更死
  'linear-burn': (b, s) => b + s - 1,

  // 线性减淡（添加）：直接相加
  'linear-dodge': (b, s) => b + s,

  // 亮光：上色暗于中灰走颜色加深，亮于中灰走颜色减淡
  'vivid-light': (b, s) => {
    if (s <= 0.5) {
      const d = 2 * s;
      return d <= 0 ? 0 : 1 - Math.min(1, (1 - b) / d);
    }
    const d = 2 * (1 - s);
    return d <= 0 ? 1 : Math.min(1, b / d);
  },

  // 线性光：以中灰为界做线性加深/减淡
  'linear-light': (b, s) => b + 2 * s - 1,

  // 点光：按上色偏暗还是偏亮，替换掉底色的对应一侧
  'pin-light': (b, s) => {
    if (s <= 0.5) return Math.min(b, 2 * s);
    return Math.max(b, 2 * s - 1);
  },

  // 实色混合：先算亮光，再二值化，结果只有 0 和 1
  'hard-mix': (b, s) => {
    const vivid = CUSTOM['vivid-light']!(b, s);
    return vivid >= 0.5 ? 1 : 0;
  },
};

/** 该模式能不能用 canvas 原生合成 */
export function isNativeBlend(mode: BlendMode): boolean {
  return mode in NATIVE;
}

/** 取原生合成值；调用前应先用 isNativeBlend 判断 */
export function nativeOperation(mode: BlendMode): GlobalCompositeOperation {
  return NATIVE[mode] ?? 'source-over';
}

/** 全部受支持的模式，用于校验与测试 */
export function isSupportedBlend(mode: BlendMode): boolean {
  return mode in NATIVE || mode in CUSTOM;
}

/**
 * 手写混合：把 source 按 mode 混到 backdrop 上，就地修改 backdrop。
 *
 * 两边都按 source-over 的 alpha 合成规则处理：
 * 先把颜色混出来，再用上层 alpha 与 opacity 决定混多少进去。
 * 上层全透明的像素完全不参与，否则边缘会出现黑边。
 *
 * opacity 传 0..1。
 */
export function blendImageData(
  backdrop: ImageData,
  source: ImageData,
  mode: BlendMode,
  opacity = 1,
): void {
  const blend = CUSTOM[mode];
  if (!blend) return;

  const back = backdrop.data;
  const src = source.data;

  for (let i = 0; i < back.length; i += 4) {
    const sa = (src[i + 3] / 255) * opacity;
    if (sa <= 0) continue;

    const ba = back[i + 3] / 255;
    // 结果 alpha 按 source-over 规则
    const oa = sa + ba * (1 - sa);
    if (oa <= 0) {
      back[i + 3] = 0;
      continue;
    }

    for (let c = 0; c < 3; c += 1) {
      const b = back[i + c] / 255;
      const s = src[i + c] / 255;
      // 混合公式作用在不透明的底色上，再按 alpha 加权回去
      const mixed = clamp01(blend(b, s));
      // Porter-Duff source-over，颜色部分按预乘展开
      const out = (mixed * sa + b * ba * (1 - sa)) / oa;
      back[i + c] = Math.round(clamp01(out) * 255);
    }
    back[i + 3] = Math.round(oa * 255);
  }
}

/**
 * 夹到 0..1。
 * 必须夹：线性减淡这类公式会算出 >1，线性加深会算出 <0，
 * 不夹就交给 Uint8ClampedArray 的话负值会变 0 看不出问题，
 * 但中间的浮点运算已经错了。
 */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 把一个图层按手写模式混到目标画布上。
 * 目标区域之外不受影响；返回新画布而不是就地改，与 canvas 原生路径的语义保持一致。
 */
export function blendCanvas(
  backdrop: HTMLCanvasElement,
  source: HTMLCanvasElement,
  mode: BlendMode,
  opacity = 1,
): HTMLCanvasElement {
  const width = backdrop.width;
  const height = backdrop.height;
  const output = createCanvas(width, height);
  const outCtx = ctx2d(output);
  outCtx.drawImage(backdrop, 0, 0);

  if (width === 0 || height === 0) return output;

  const backData = outCtx.getImageData(0, 0, width, height);
  const srcData = ctx2d(source).getImageData(0, 0, width, height);
  blendImageData(backData, srcData, mode, opacity);
  outCtx.putImageData(backData, 0, 0);
  return output;
}
