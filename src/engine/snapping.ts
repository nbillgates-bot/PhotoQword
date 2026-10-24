/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Guide, Point, Rect } from '../types';

/**
 * 吸附（PS：视图 > 对齐）。
 *
 * PS 的吸附目标有参考线、网格、文档边界几类，行为完全一样——
 * 都是"离得够近就贴上去"，只是候选位置的来源不同。所以这里只写一套判定，
 * 由 buildSnapContext 负责把各种来源汇总成两个方向上的候选位置。
 */

/**
 * 吸附容差（屏幕像素）。
 *
 * 与 guides.ts 的命中容差同理，用屏幕像素而不是文档像素：
 * 放大到 800% 时容差不该跟着放大 8 倍，手感要和缩放无关。
 */
export const SNAP_TOLERANCE = 8;

/** 网格间距（文档像素），与 CanvasArea 里网格背景的 20px 保持一致 */
export const GRID_SPACING = 20;

/** 一次吸附判定所需的全部信息，都是文档坐标 */
export interface SnapContext {
  /** 吸附 x 用的候选位置：垂直参考线 */
  x: number[];
  /** 吸附 y 用的候选位置：水平参考线 */
  y: number[];
  /** 网格间距；0 表示不吸附网格。网格线数量随文档增长，用间距按需算比枚举省 */
  grid: number;
  /** 容差，已换算成文档坐标 */
  slack: number;
}

interface BuildArgs {
  guides: Guide[];
  showGuides: boolean;
  showGrid: boolean;
  zoom: number;
  /** 临时关闭吸附（PS 里按住 Ctrl 微调时用） */
  disabled?: boolean;
  tolerance?: number;
}

/**
 * 汇总当前可用的吸附目标。没有任何目标时返回 null，调用方据此整段跳过。
 *
 * 参考线只在可见时参与吸附：藏起来之后还在吸，用户会觉得框莫名其妙地跳。
 * 网格同理，与 PS 一致。
 *
 * 不把文档边界算作吸附目标：PS 的「对齐到 > 文档边界」是独立开关，
 * 而且小文档上四条边总落在容差内，会让"想裁掉最外面几像素"变得做不到。
 */
export function buildSnapContext(args: BuildArgs): SnapContext | null {
  const { guides, showGuides, showGrid, zoom, disabled, tolerance = SNAP_TOLERANCE } = args;
  if (disabled || zoom <= 0) return null;

  const x: number[] = [];
  const y: number[] = [];
  if (showGuides) {
    for (const guide of guides) {
      if (guide.orientation === 'h') y.push(guide.position);
      else x.push(guide.position);
    }
  }

  const grid = showGrid ? GRID_SPACING : 0;
  // 一个目标都没有：直接告诉调用方跳过，省掉每次指针移动的无谓计算
  if (grid === 0 && x.length === 0 && y.length === 0) return null;
  return { x, y, grid, slack: tolerance / zoom };
}

/**
 * 把一个坐标吸到最近的候选位置上，都超出容差就原样返回。
 *
 * 候选位置先于网格判定，且比较用严格小于：参考线与网格线重合时吸参考线，
 * 与 PS 的优先级一致（参考线是用户亲手放的，比网格更"硬"）。
 */
function snapAxis(value: number, positions: number[], context: SnapContext): number {
  let best = value;
  let bestDistance = context.slack;
  for (const position of positions) {
    const distance = Math.abs(value - position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = position;
    }
  }
  if (context.grid > 0) {
    const line = Math.round(value / context.grid) * context.grid;
    const distance = Math.abs(value - line);
    // 严格小于：与参考线距离相同时保留参考线
    if (distance < bestDistance) best = line;
  }
  return best;
}

/** 吸附 x 坐标 */
export function snapX(value: number, context: SnapContext): number {
  return snapAxis(value, context.x, context);
}

/** 吸附 y 坐标 */
export function snapY(value: number, context: SnapContext): number {
  return snapAxis(value, context.y, context);
}

/**
 * 吸附指针位置，x、y 各自独立判定。
 *
 * 拖控制点时吸的是**指针**而不是算好的矩形：指针只驱动用户正在拖的那条边，
 * 没在拖的边不会因为恰好靠近某条参考线就自己跳走。
 */
export function snapPoint(point: Point, context: SnapContext): Point {
  return { x: snapX(point.x, context), y: snapY(point.y, context) };
}

/**
 * 求把两条边中任意一条贴到吸附目标所需的最小平移量，没有可吸的返回 0。
 *
 * 这里不能复用 snapX/snapY：那两个函数吸不到时会原样返回，
 * 于是"没吸上"和"已经正好压在线上"都表现为位移 0，
 * 前者会以距离 0 胜出，把另一条本可以吸的边挤掉。所以直接比候选位置。
 */
function bestOffset(edges: number[], positions: number[], context: SnapContext): number {
  let offset = 0;
  let bestDistance = context.slack;
  for (const edge of edges) {
    for (const position of positions) {
      const distance = Math.abs(position - edge);
      if (distance < bestDistance) {
        bestDistance = distance;
        offset = position - edge;
      }
    }
    if (context.grid > 0) {
      const line = Math.round(edge / context.grid) * context.grid;
      const distance = Math.abs(line - edge);
      if (distance < bestDistance) {
        bestDistance = distance;
        offset = line - edge;
      }
    }
  }
  return offset;
}

/**
 * 整体平移矩形，让它离吸附目标最近的那条边贴上去。尺寸不变。
 *
 * 用于拖动框内部做平移的情形：此时吸的是框的边而不是指针，
 * 因为指针落在框内哪个位置是随意的，吸指针没有意义。
 */
export function snapRectTranslate(rect: Rect, context: SnapContext): Rect {
  const dx = bestOffset([rect.x, rect.x + rect.width], context.x, context);
  const dy = bestOffset([rect.y, rect.y + rect.height], context.y, context);
  if (dx === 0 && dy === 0) return rect;
  return { x: rect.x + dx, y: rect.y + dy, width: rect.width, height: rect.height };
}
