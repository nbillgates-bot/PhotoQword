/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 滚轮增量归一化。
 *
 * 各浏览器上报的单位不一样：Chrome / Safari 给像素（deltaMode 0），
 * Firefox 在部分配置下给行数（deltaMode 1，一次滚动只有 ±3），
 * 少数情况给页数（deltaMode 2）。不归一的话同一次滚动在 Firefox 上
 * 只能挪 3px，平移慢得像卡住。
 *
 * 这里不接 WheelEvent 而只要三个字段，是为了让它保持纯函数、能直接测。
 */

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

/** 一行按 16px 算，与浏览器默认行高一致 */
const LINE_HEIGHT = 16;
/** 一页按 400px 算，取一个接近常见视口高度的保守值 */
const PAGE_HEIGHT = 400;

function unitScale(deltaMode: number): number {
  if (deltaMode === 1) return LINE_HEIGHT;
  if (deltaMode === 2) return PAGE_HEIGHT;
  return 1;
}

/** 归一成像素单位的增量；NaN 输入压成 0，避免污染 pan */
export function wheelDelta(event: WheelLike): { x: number; y: number } {
  const scale = unitScale(event.deltaMode);
  const x = Number.isFinite(event.deltaX) ? event.deltaX * scale : 0;
  const y = Number.isFinite(event.deltaY) ? event.deltaY * scale : 0;
  return { x, y };
}
