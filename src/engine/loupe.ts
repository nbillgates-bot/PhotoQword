/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 放大镜的几何。
 *
 * 手指会把自己要对准的地方整个盖住 —— 拖变换手柄、用吸管取色、拖选区边
 * 这几件事对精度的要求都在一两个像素级别，看不见就只能靠猜。
 * PS on iPad 的解法是在指尖旁边浮一个放大镜，这里照做。
 *
 * 只算坐标，不碰 DOM、不碰 store。「什么时候该出现」是另一件事，
 * 按工具查表，见 tools/loupeDefs.ts。
 */

import type { Point, Rect } from '../types';

/** 放大镜直径（CSS 像素）。够看清几个像素，又不至于挡掉半个屏幕 */
export const LOUPE_SIZE = 104;

/** 放大倍数，相对当前视图缩放。2 倍是「能分辨单个像素」与「还能看到上下文」的折中 */
export const LOUPE_MAGNIFICATION = 2;

/** 放大镜边缘与指尖的距离。留出一根手指的宽度，不然照样被挡住 */
export const LOUPE_GAP = 28;

/**
 * 放大镜要显示画布上的哪一块（画布像素）。
 *
 * center 是视口 CSS 坐标，画布的背衬尺寸是视口尺寸 × dpr（见 viewportRender
 * 的 makeViewportContext），所以要乘 dpr 才对得上画布像素。
 *
 * **不夹到画布边界内。** drawImage 的规范行为是：源矩形超出图像时，
 * 按同一比例把源和目标一起裁掉。所以贴着画布边缘时放大镜会显示一块空白，
 * 但倍率不变 —— 反过来若把源矩形夹住，倍率会悄悄变大，指尖和放大镜里的
 * 位置就对不上了。
 */
export function loupeSourceRect(args: {
  center: Point;
  dpr: number;
  size?: number;
  magnification?: number;
}): Rect {
  const { center, dpr } = args;
  const size = args.size ?? LOUPE_SIZE;
  const magnification = args.magnification ?? LOUPE_MAGNIFICATION;
  // 目标是 size 大，倍率 magnification，所以源边长是 size / magnification
  const source = (size / magnification) * dpr;
  return {
    x: center.x * dpr - source / 2,
    y: center.y * dpr - source / 2,
    width: source,
    height: source,
  };
}

/**
 * 放大镜自己摆在哪（视口 CSS 坐标的左上角）。
 *
 * 默认摆在指尖正上方 —— 手是从下方伸过来的，上方是唯一不会被手掌挡住的方向。
 * 上面放不下就翻到下方，与 ContextMenu 的翻转同一个思路。
 * 最后再夹一次是给「视口比放大镜还小」兜底，这时候位置不完美但不会跑到屏幕外。
 */
export function loupePlacement(args: {
  center: Point;
  viewport: { width: number; height: number };
  size?: number;
  gap?: number;
}): Point {
  const { center, viewport } = args;
  const size = args.size ?? LOUPE_SIZE;
  const gap = args.gap ?? LOUPE_GAP;

  const above = center.y - gap - size;
  const below = center.y + gap;
  const top = above >= 0 ? above : below;
  const left = center.x - size / 2;

  return {
    x: clamp(left, 0, Math.max(0, viewport.width - size)),
    y: clamp(top, 0, Math.max(0, viewport.height - size)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
