/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createCanvas, ctx2d } from './canvasUtils';
import { blurCanvas } from './canvasFilterSupport';
import {
  dilate,
  erode,
  extractSilhouette,
  invertAlpha,
  padCanvas,
  padFor,
  unpadCanvas,
} from './morphology';
import type {
  DropShadowEffect,
  OuterGlowEffect,
  InnerGlowEffect,
  StrokeEffect,
} from '../types/effects';

/**
 * 图层样式渲染。
 *
 * 每个效果函数接收源画布与参数，返回预着色的效果画布（RGB = 效果颜色，alpha = 强度）。
 * 调用方按 PS 的顺序合成：投影 → 外发光 → 图层 → 内发光 → 描边。
 *
 * **性能考虑**：跳过缓存，先保证对。模糊在原生支持的浏览器上很快，
 * 即使 2000x2000 的文档加投影也只有几毫秒。
 */

// 向后兼容：测试文件还在从这儿 import
export { dilate, erode, extractSilhouette };

/** 着色：把白色剪影染成目标颜色 */
function colorize(silhouette: HTMLCanvasElement, color: string): void {
  const context = ctx2d(silhouette);
  context.save();
  context.globalCompositeOperation = 'source-in';
  context.fillStyle = color;
  context.fillRect(0, 0, silhouette.width, silhouette.height);
  context.restore();
}

/**
 * 投影。
 * spread 先膨胀再模糊，size 控制模糊半径。
 */
export function renderDropShadow(
  source: HTMLCanvasElement,
  effect: DropShadowEffect,
): HTMLCanvasElement {
  const { angle, distance, spread, size, color } = effect;
  const { width, height } = source;
  const sil = extractSilhouette(source);

  // spread: 0-100 映射到 0 - size/2 的膨胀半径
  const spreadRadius = (spread / 100) * (size / 2);
  const shadow = spreadRadius > 0.5 ? dilate(sil, spreadRadius) : sil;

  // 模糊
  const blurred = size > 0.5 ? blurCanvas(shadow, size) : shadow;

  // 偏移
  const rad = (angle * Math.PI) / 180;
  const dx = Math.round(distance * Math.cos(rad));
  const dy = Math.round(distance * Math.sin(rad));
  const offset = createCanvas(width, height);
  const context = ctx2d(offset);
  context.drawImage(blurred, dx, dy);

  // 着色
  colorize(offset, color);
  return offset;
}

/**
 * 外发光。
 * spread 膨胀、size 模糊。
 */
export function renderOuterGlow(
  source: HTMLCanvasElement,
  effect: OuterGlowEffect,
): HTMLCanvasElement {
  const { spread, size, color } = effect;
  const sil = extractSilhouette(source);
  const spreadRadius = (spread / 100) * (size / 2);
  const expanded = spreadRadius > 0.5 ? dilate(sil, spreadRadius) : sil;
  const blurred = size > 0.5 ? blurCanvas(expanded, size) : expanded;
  colorize(blurred, color);
  return blurred;
}

/**
 * 内发光。
 * edge 模式：反转剪影 → 膨胀（choke）→ 模糊 → 裁剪到原 alpha。
 * center 模式：边缘发光取反。
 *
 * **反相运算必须扩边**：形状铺满画布时，"形状之外"那圈在原尺寸缓冲里不存在，
 * 反相得到全零 alpha，后续膨胀无从下手，最终效果消失。所以先扩边再反相，
 * 让"外部"有地方表示，算完再裁回来。
 */
export function renderInnerGlow(
  source: HTMLCanvasElement,
  effect: InnerGlowEffect,
): HTMLCanvasElement {
  const { source: mode, choke, size, color } = effect;
  const { width, height } = source;
  const sil = extractSilhouette(source);

  if (mode === 'edge') {
    const chokeRadius = (choke / 100) * (size / 2);
    const pad = padFor(Math.max(chokeRadius, size));
    const paddedSil = padCanvas(sil, pad);

    // 反转 alpha（扩边后才有"外部"可反）
    const inverted = invertAlpha(paddedSil);
    // choke 膨胀
    const expanded = chokeRadius > 0.5 ? dilate(inverted, chokeRadius) : inverted;
    // 模糊
    const blurred = size > 0.5 ? blurCanvas(expanded, size) : expanded;
    // 裁回原尺寸
    const cropped = unpadCanvas(blurred, pad, width, height);
    // 裁剪回原形状内
    const context = ctx2d(cropped);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(sil, 0, 0);
    colorize(cropped, color);
    return cropped;
  }

  // center 模式：先算 edge，再反转，得到中心亮边缘暗
  const edge = renderInnerGlow(source, { ...effect, source: 'edge' });
  const centerGlow = invertAlpha(edge);
  const context = ctx2d(centerGlow);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(sil, 0, 0);
  colorize(centerGlow, color);
  return centerGlow;
}

/**
 * 描边。
 * outside: 膨胀 - 原图
 * inside: 原图 - 腐蚀
 * center: (膨胀 size/2) - (腐蚀 size/2)
 *
 * **腐蚀用的 erode 在 morphology 里扩边后才反相膨胀**，
 * 否则形状贴着画布边缘时，反相得到全零（没地方表示"外部"），
 * inside / center 描边在边缘上会消失。
 */
export function renderStroke(source: HTMLCanvasElement, effect: StrokeEffect): HTMLCanvasElement {
  const { size, position, color } = effect;
  const sil = extractSilhouette(source);
  const { width, height } = sil;

  let ring: HTMLCanvasElement;
  if (position === 'outside') {
    const expanded = dilate(sil, size);
    ring = createCanvas(width, height);
    const context = ctx2d(ring);
    context.drawImage(expanded, 0, 0);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(sil, 0, 0);
  } else if (position === 'inside') {
    const shrunk = erode(sil, size);
    ring = createCanvas(width, height);
    const context = ctx2d(ring);
    context.drawImage(sil, 0, 0);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(shrunk, 0, 0);
  } else {
    // center
    const half = size / 2;
    const expanded = dilate(sil, half);
    const shrunk = erode(sil, half);
    ring = createCanvas(width, height);
    const context = ctx2d(ring);
    context.drawImage(expanded, 0, 0);
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(shrunk, 0, 0);
  }

  colorize(ring, color);
  return ring;
}
