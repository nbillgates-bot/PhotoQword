/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point } from '../types';
import type { BrushShape } from '../types/tools';
import { createCanvas, ctx2d } from './canvasUtils';
import { hexToRgb } from './color';

export interface BrushConfig {
  size: number;
  hardness: number;
  opacity: number;
  color: string;
  shape: BrushShape;
}

/**
 * 生成笔尖图章。硬度通过径向渐变实现，
 * 缓存 key 由参数拼接，避免每帧重建。
 */
const stampCache = new Map<string, HTMLCanvasElement>();

export function brushStamp(config: BrushConfig): HTMLCanvasElement {
  const size = Math.max(1, Math.round(config.size));
  const key = `${size}|${config.hardness}|${config.color}|${config.shape}`;
  const cached = stampCache.get(key);
  if (cached) return cached;

  const stamp = createCanvas(size, size);
  const context = ctx2d(stamp);
  const radius = size / 2;
  const { r, g, b } = hexToRgb(config.color);

  if (config.shape === 'square') {
    context.fillStyle = `rgb(${r},${g},${b})`;
    context.fillRect(0, 0, size, size);
  } else {
    const hardness = config.shape === 'soft' ? Math.min(config.hardness, 30) : config.hardness;
    const inner = radius * (hardness / 100);
    const gradient = context.createRadialGradient(radius, radius, inner, radius, radius, radius);
    gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(radius, radius, radius, 0, Math.PI * 2);
    context.fill();
  }

  if (stampCache.size > 60) stampCache.clear();
  stampCache.set(key, stamp);
  return stamp;
}

/**
 * 沿两点之间按间距连续盖章，避免快速移动时出现断点。
 * 返回本次实际消耗掉的距离余量，供下一段继续累计。
 */
export function strokeSegment(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  config: BrushConfig,
  carry = 0,
): number {
  const stamp = brushStamp(config);
  const spacing = Math.max(1, config.size * 0.18);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const half = stamp.width / 2;

  context.save();
  context.globalAlpha = config.opacity / 100;

  if (distance === 0 && carry === 0) {
    context.drawImage(stamp, to.x - half, to.y - half);
    context.restore();
    return spacing;
  }

  let travelled = carry;
  while (travelled <= distance) {
    const t = distance === 0 ? 0 : travelled / distance;
    context.drawImage(stamp, from.x + dx * t - half, from.y + dy * t - half);
    travelled += spacing;
  }
  context.restore();
  return travelled - distance;
}
