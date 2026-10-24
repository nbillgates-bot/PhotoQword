/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Rect } from '../types';

/**
 * 带八个控制点的矩形框，裁剪与自由变换共用。
 *
 * PS 的裁剪/变换交互都是同一套：拖框内移动整体，拖边缘等比拉伸那条边，
 * 拖八个角/边中点按拖拽方向改尺寸，按住 Shift 锁定等比，按住 Alt 中心拉伸。
 * 不写两遍，抽一层纯函数处理坐标。
 */

/** 控制点类型 */
export type Handle =
  | 'nw'
  | 'n'
  | 'ne'
  | 'e'
  | 'se'
  | 's'
  | 'sw'
  | 'w'
  | 'inside'
  | null;

/** 命中判定：离控制点的容忍距离（视口像素） */
const HIT_RADIUS = 8;
/** 判定矩形内部时与边的最小距离，避免离边缘太近时误判为拖框内 */
const INSIDE_MARGIN = HIT_RADIUS;

/**
 * 判定点击落在哪个控制点上。
 * rect 是文档坐标（实际像素），point 也是文档坐标，zoom 用来把容忍半径换算回文档坐标。
 *
 * 四个角优先于四条边：用户瞄准角时不应该被边抢走（角的功能更强，既改宽又改高）。
 */
export function hitTest(rect: Rect, point: Point, zoom: number): Handle {
  const tolerance = HIT_RADIUS / zoom;
  const { x, y, width, height } = rect;
  const mx = x + width / 2;
  const my = y + height / 2;
  const right = x + width;
  const bottom = y + height;

  // 四个角优先
  if (Math.hypot(point.x - x, point.y - y) < tolerance) return 'nw';
  if (Math.hypot(point.x - right, point.y - y) < tolerance) return 'ne';
  if (Math.hypot(point.x - right, point.y - bottom) < tolerance) return 'se';
  if (Math.hypot(point.x - x, point.y - bottom) < tolerance) return 'sw';

  // 四条边中点
  if (Math.hypot(point.x - mx, point.y - y) < tolerance) return 'n';
  if (Math.hypot(point.x - right, point.y - my) < tolerance) return 'e';
  if (Math.hypot(point.x - mx, point.y - bottom) < tolerance) return 's';
  if (Math.hypot(point.x - x, point.y - my) < tolerance) return 'w';

  // 判定框内：离所有边都有足够距离
  const insideMargin = INSIDE_MARGIN / zoom;
  if (
    point.x >= x + insideMargin &&
    point.x <= right - insideMargin &&
    point.y >= y + insideMargin &&
    point.y <= bottom - insideMargin
  ) {
    return 'inside';
  }

  return null;
}

/** 根据控制点类型返回光标样式 */
export function cursorFor(handle: Handle): string {
  switch (handle) {
    case 'nw':
    case 'se':
      return 'nwse-resize';
    case 'ne':
    case 'sw':
      return 'nesw-resize';
    case 'n':
    case 's':
      return 'ns-resize';
    case 'e':
    case 'w':
      return 'ew-resize';
    case 'inside':
      return 'move';
    default:
      return 'default';
  }
}

interface DragArgs {
  /** 起始矩形 */
  start: Rect;
  /** 起笔位置（文档坐标） */
  anchor: Point;
  /** 当前位置（文档坐标） */
  current: Point;
  /** 拖的哪个控制点 */
  handle: Handle;
  /** Shift 键：锁定等比 */
  shift: boolean;
  /** Alt 键：中心拉伸 */
  alt: boolean;
}

/**
 * 计算拖拽后的新矩形。
 * 返回的坐标可能是负宽高（代表反向），调用方自行 normalize。
 */
export function dragTo(args: DragArgs): Rect {
  const { start, anchor, current, handle, shift, alt } = args;
  let dx = current.x - anchor.x;
  let dy = current.y - anchor.y;

  // 拖框内：平移
  if (handle === 'inside') {
    return {
      x: start.x + dx,
      y: start.y + dy,
      width: start.width,
      height: start.height,
    };
  }

  if (handle === null) return start;

  // 拖控制点：改尺寸
  let { x, y, width, height } = start;
  const cx = x + width / 2;
  const cy = y + height / 2;

  // Shift 锁定等比：找一个主轴并投影到它上
  if (shift) {
    const aspectRatio = Math.abs(width / height);
    if (handle === 'nw' || handle === 'ne' || handle === 'se' || handle === 'sw') {
      // 四角：按拖拽角度决定是水平还是垂直为主
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = dx / aspectRatio;
      } else {
        dx = dy * aspectRatio;
      }
    }
  }

  // Alt 中心拉伸：位移加倍，从中心往两侧拉
  if (alt) {
    dx *= 2;
    dy *= 2;
  }

  switch (handle) {
    case 'nw':
      x += dx;
      y += dy;
      width -= dx;
      height -= dy;
      break;
    case 'n':
      y += dy;
      height -= dy;
      break;
    case 'ne':
      y += dy;
      width += dx;
      height -= dy;
      break;
    case 'e':
      width += dx;
      break;
    case 'se':
      width += dx;
      height += dy;
      break;
    case 's':
      height += dy;
      break;
    case 'sw':
      x += dx;
      width -= dx;
      height += dy;
      break;
    case 'w':
      x += dx;
      width -= dx;
      break;
  }

  // Alt 模式下保持中心不变
  if (alt) {
    x = cx - width / 2;
    y = cy - height / 2;
  }

  return { x, y, width, height };
}

/** 把可能反向的矩形归一化成左上→右下 */
export function normalize(rect: Rect): Rect {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;
  const width = Math.abs(rect.width);
  const height = Math.abs(rect.height);
  return { x, y, width, height };
}
