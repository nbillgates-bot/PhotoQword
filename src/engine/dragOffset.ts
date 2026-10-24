/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point } from '../types';

/** 拖动夹取所需的几何信息 */
export interface DragBounds {
  /** 偏移为 0 时面板在视口中的位置与尺寸 */
  base: { x: number; y: number; width: number; height: number };
  viewport: { width: number; height: number };
  /**
   * 至少要留在视口内的边缘尺寸。
   * 太小会让面板几乎完全移出去、只剩一条缝，鼠标很难再抓回来。
   */
  keep?: number;
}

/**
 * 把拖动偏移夹到"还抓得回来"的范围内。
 *
 * 规则对齐 PS 的对话框：左右可以推出去大半，但两侧各要留一截；
 * 向上不允许越过视口顶边——标题栏是唯一的拖动把手，
 * 一旦它被顶出去就再也抓不住，只能关掉重开。
 */
export function clampDragOffset(offset: Point, bounds: DragBounds): Point {
  const { base, viewport } = bounds;
  const keep = bounds.keep ?? 64;
  // 面板比视口还宽时不留边，否则夹取范围会反过来（下限大于上限）
  const keepX = Math.min(keep, base.width);
  const keepY = Math.min(keep, base.height);

  return {
    x: clampRange(offset.x, keepX - base.x - base.width, viewport.width - keepX - base.x),
    y: clampRange(offset.y, -base.y, viewport.height - keepY - base.y),
  };
}

/** 上下限传反时以下限为准，避免夹出个更离谱的值 */
function clampRange(value: number, min: number, max: number): number {
  if (max < min) return min;
  return value < min ? min : value > max ? max : value;
}
