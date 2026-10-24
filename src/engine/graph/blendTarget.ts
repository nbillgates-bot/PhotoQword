/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 求值器的合成辅助：把一张画布按混合模式合到目标上。
 *
 * 从 evaluator 拆出来是因为它不参与递归遍历，是纯粹的「两张图怎么叠」，
 * 单独放这里让求值器只剩结构逻辑，两边都更好读也更好测。
 */

import type { BlendMode } from '../../types';
import { createCanvas, ctx2d, ctx2dReadback } from '../canvasUtils';
import { blendImageData, isNativeBlend, nativeOperation } from '../blendModes';

/**
 * 穿透没有对应的像素混合公式：隔离后的组按正常处理（PS 同此）。
 *
 * 不归一化会掉进 blendImageData 的「CUSTOM 里没这个模式就直接 return」，
 * 结果是整个节点完全不显示——比画错更难查。
 */
export function normalizeBlend(mode: BlendMode): BlendMode {
  return mode === 'pass-through' ? 'normal' : mode;
}

/** 保证画布与给定尺寸一致。getImageData 尺寸不匹配会直接抛错 */
export function sizedTo(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;
  const out = createCanvas(width, height);
  ctx2d(out).drawImage(source, 0, 0);
  return out;
}

/**
 * 按混合模式与不透明度把 pixels 合成到 target。
 * canvas 认得的模式走原生（快），剩下 6 个 PS 特有模式读回像素手算。
 *
 * opacity 取 0..100，与 Layer.opacity 一致。
 */
export function drawWithBlend(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  mode: BlendMode,
  opacity: number,
  width: number,
  height: number,
): void {
  const normalized = normalizeBlend(mode);

  if (isNativeBlend(normalized)) {
    target.save();
    target.globalAlpha = opacity / 100;
    target.globalCompositeOperation = nativeOperation(normalized);
    target.drawImage(pixels, 0, 0);
    target.restore();
    return;
  }

  if (width <= 0 || height <= 0) return;
  const backdrop = target.getImageData(0, 0, width, height);
  const source = ctx2dReadback(sizedTo(pixels, width, height)).getImageData(0, 0, width, height);
  blendImageData(backdrop, source, normalized, opacity / 100);
  target.putImageData(backdrop, 0, 0);
}
