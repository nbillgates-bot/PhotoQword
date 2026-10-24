/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 缩略图专用的内容范围估算。
 *
 * contentBounds 要 getImageData 全幅再逐像素扫 alpha。790×16041 的图层是
 * 1270 万像素,一层就要上百毫秒;图层面板一次要出几十张缩略图,这一项
 * 单独就能让打开大 PSD 卡住几秒。
 *
 * 这里先把画布缩到长边不超过 PROBE 的小图,在小图上扫,再把结果按比例放回去。
 * 代价从「跟画布面积成正比」变成「恒定约 6 万像素」。
 *
 * **只能用于缩略图取景。** 结果会向外对齐到缩略图网格(误差最多一个探测像素,
 * 换算回原图可能是几十像素),图层边框和属性面板要显示精确数字,必须用
 * contentBounds。缩略图最终只有 40px,这点误差看不出来。
 *
 * 缩放会把细线的 alpha 平均掉:1px 不透明线在 125 倍下降采样后 alpha 约为 2,
 * 仍然大于 0,所以「有内容」的判断不会漏。这是用 alpha > 0 而不是设阈值的原因。
 */

import type { Rect } from '../types';
import { createReadbackCanvas, ctx2d } from './canvasUtils';

/** 探测图的长边上限。256 → 最多约 6.5 万像素,扫一遍不到 1ms */
const PROBE = 256;

/** 在探测图上扫出非透明像素的外接框,全透明返回 null */
function probeBounds(data: Uint8ClampedArray, width: number, height: number): Rect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * 内容范围的快速估算(画布局部坐标),全透明时返回 null。
 *
 * 返回的框**只会偏大不会偏小**:边界向外扩到探测网格,这样细窄的内容
 * 不会被切掉一条边。宁可多留一点背景,也不能把内容裁没。
 */
export function contentBoundsFast(canvas: HTMLCanvasElement): Rect | null {
  const { width, height } = canvas;
  if (width === 0 || height === 0) return null;

  // 已经够小就不必再缩一次,直接在原图上扫更准
  const factor = Math.max(1, Math.max(width, height) / PROBE);
  const probeWidth = Math.max(1, Math.round(width / factor));
  const probeHeight = Math.max(1, Math.round(height / factor));

  const probe = createReadbackCanvas(probeWidth, probeHeight);
  const context = ctx2d(probe);
  /*
   * 用 medium 而不是 high:high 在部分浏览器上是多次逐级降采样,这里只需要
   * 知道「哪一块有东西」,精度过剩没有意义,反而慢。
   */
  context.imageSmoothingQuality = 'medium';
  context.drawImage(canvas, 0, 0, probeWidth, probeHeight);

  const found = probeBounds(
    context.getImageData(0, 0, probeWidth, probeHeight).data,
    probeWidth,
    probeHeight,
  );
  if (!found) return null;

  // 换算回原图并向外扩:探测像素的边界落在原图的哪一格是不确定的
  const scaleX = width / probeWidth;
  const scaleY = height / probeHeight;
  const x = Math.max(0, Math.floor(found.x * scaleX));
  const y = Math.max(0, Math.floor(found.y * scaleY));
  const right = Math.min(width, Math.ceil((found.x + found.width) * scaleX));
  const bottom = Math.min(height, Math.ceil((found.y + found.height) * scaleY));
  return { x, y, width: right - x, height: bottom - y };
}
