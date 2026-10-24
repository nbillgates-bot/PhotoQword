/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point } from '../types';
import { applyMatrix, compose, rotation, skewing } from './matrix';
import {
  centerOf,
  docToLocal,
  type BoxHandle,
  type TransformState,
} from './transformBox';

export interface TransformDragArgs {
  /** 起笔时的状态 */
  start: TransformState;
  /** 起笔位置（文档坐标） */
  anchor: Point;
  /** 当前位置（文档坐标） */
  current: Point;
  handle: BoxHandle;
  /** Shift：缩放锁等比、旋转吸附 15° */
  shift: boolean;
  /** Alt：从中心缩放 */
  alt: boolean;
  /** Ctrl：把边中点的拖拽变成斜切，与 PS 的 Ctrl+拖边一致 */
  ctrl: boolean;
}

/** 旋转吸附的步长，PS 按住 Shift 也是 15° 一档 */
const SNAP_STEP = Math.PI / 12;

/** 每个控制点在局部坐标里影响哪条边，1 表示正方向那条边 */
const EDGE_EFFECT: Record<string, { x: -1 | 0 | 1; y: -1 | 0 | 1 }> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/** 平移：直接加文档坐标下的位移，不受旋转影响 */
function translate(state: TransformState, dx: number, dy: number): TransformState {
  return { ...state, rect: { ...state.rect, x: state.rect.x + dx, y: state.rect.y + dy } };
}

/**
 * 旋转：用中心到指针的角度差。
 * 从起笔角度算增量而不是直接用当前角度，这样抓在框上任何位置都不会突跳。
 */
function rotate(args: TransformDragArgs): TransformState {
  const { start, anchor, current, shift } = args;
  const center = centerOf(start.rect);
  const from = Math.atan2(anchor.y - center.y, anchor.x - center.x);
  const to = Math.atan2(current.y - center.y, current.x - center.x);
  let angle = start.angle + (to - from);
  if (shift) angle = Math.round(angle / SNAP_STEP) * SNAP_STEP;
  return { ...start, angle };
}

/**
 * 斜切：把指针位移投到框的局部坐标，再换算成角度。
 *
 * 拖上下边改水平斜切、拖左右边改垂直斜切——这跟直觉一致：
 * 推顶边往右，整个框就往右倒。
 */
function skew(args: TransformDragArgs, localDelta: Point): TransformState {
  const { start, handle } = args;
  const effect = handle && EDGE_EFFECT[handle];
  if (!effect) return start;

  const halfWidth = Math.abs(start.rect.width) / 2;
  const halfHeight = Math.abs(start.rect.height) / 2;

  // 拖的是横边（n/s）就改 skewX，竖边（e/w）就改 skewY
  if (effect.y !== 0 && effect.x === 0) {
    if (halfHeight === 0) return start;
    // skewX 的定义是「局部 y 越大越往右偏」，顶边的局部 y 是负的，
    // 所以要乘 effect.y 才能让被拖的那条边跟着指针走。
    const delta = Math.atan((localDelta.x * effect.y) / halfHeight);
    return { ...start, skewX: start.skewX + delta };
  }
  if (effect.x !== 0 && effect.y === 0) {
    if (halfWidth === 0) return start;
    const delta = Math.atan((localDelta.y * effect.x) / halfWidth);
    return { ...start, skewY: start.skewY + delta };
  }
  return start; // 角上不做斜切，PS 的 Ctrl+拖角是扭曲，本次不支持
}

/**
 * 缩放：在框的局部坐标里改宽高，再把中心补偿回去，
 * 让没被拖的那条边/那个角留在原地。
 */
function resize(args: TransformDragArgs, localDelta: Point, linear: (p: Point) => Point) {
  const { start, handle, shift, alt } = args;
  const effect = handle && EDGE_EFFECT[handle];
  if (!effect) return start;

  let dx = localDelta.x * effect.x;
  let dy = localDelta.y * effect.y;

  // Shift 等比：只在角上有意义，取位移较大的那轴当主轴
  if (shift && effect.x !== 0 && effect.y !== 0 && start.rect.height !== 0) {
    const aspect = Math.abs(start.rect.width / start.rect.height);
    if (Math.abs(dx) > Math.abs(dy)) dy = dx / aspect;
    else dx = dy * aspect;
  }

  // Alt 从中心缩放：两侧同时动，尺寸变化加倍且中心不移
  const factor = alt ? 2 : 1;
  const width = start.rect.width + dx * factor;
  const height = start.rect.height + dy * factor;

  const center = centerOf(start.rect);
  const shiftLocal = alt
    ? { x: 0, y: 0 }
    : { x: (dx * effect.x) / 2, y: (dy * effect.y) / 2 };
  const shiftDoc = linear(shiftLocal);

  const nextCenter = { x: center.x + shiftDoc.x, y: center.y + shiftDoc.y };
  return {
    ...start,
    rect: {
      x: nextCenter.x - width / 2,
      y: nextCenter.y - height / 2,
      width,
      height,
    },
  };
}

/**
 * 算出拖拽后的新状态。纯函数，不碰 store。
 *
 * 返回的 rect 可能带负宽高（拖过头翻面了），这是有意保留的——
 * 负宽高就是镜像翻转，PS 也允许拖过对边把图翻过来。绘制时
 * boxMatrix 会自然处理，不要在这里 normalize 掉。
 */
export function dragTransform(args: TransformDragArgs): TransformState {
  const { start, anchor, current, handle, ctrl } = args;
  if (!handle) return start;

  if (handle === 'inside') {
    return translate(start, current.x - anchor.x, current.y - anchor.y);
  }
  if (handle === 'rotate') {
    return rotate(args);
  }

  // 控制点的拖拽要换到框自身的坐标轴上，否则框转过之后
  // 拖右边缘会朝屏幕右方长，而不是朝框自己的右方长
  const toLocal = docToLocal(start);
  if (!toLocal) return start;

  const localAnchor = applyMatrix(toLocal, anchor);
  const localCurrent = applyMatrix(toLocal, current);
  const localDelta = { x: localCurrent.x - localAnchor.x, y: localCurrent.y - localAnchor.y };

  if (ctrl) return skew(args, localDelta);

  // 局部位移换回文档方向：只要线性部分，去掉平移
  const spin = rotation(start.angle);
  const linear = (p: Point) => applyMatrix(spin, p);
  return resize(args, localDelta, linear);
}

/**
 * 光标该指的方向。返回语义值而不是 CSS 字符串：
 * engine 不该认识 CSS，映射成 `ns-resize` 之类的事留给 tools 层。
 *
 * 旋转光标有 8 个方向（N/NE/E/SE/S/SW/W/NW），对应框周围的 8 个区域。
 */
export type CursorHint =
  | 'ns'
  | 'ew'
  | 'nwse'
  | 'nesw'
  | 'move'
  | 'rotate-n'
  | 'rotate-ne'
  | 'rotate-e'
  | 'rotate-se'
  | 'rotate-s'
  | 'rotate-sw'
  | 'rotate-w'
  | 'rotate-nw'
  | 'none';

/** 每个控制点朝外的法向量（局部坐标，y 轴向下） */
const HANDLE_NORMAL: Record<string, Point> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

/** 把方向角归到最近的 45° 档，再落到四种双向箭头上 */
const HINT_BY_SECTOR: CursorHint[] = ['ew', 'nwse', 'ns', 'nesw', 'ew', 'nwse', 'ns', 'nesw'];

/** 旋转光标：8 个扇区对应 8 个方向，扇区 0 = 正东 */
const ROTATE_BY_SECTOR: CursorHint[] = [
  'rotate-e',
  'rotate-se',
  'rotate-s',
  'rotate-sw',
  'rotate-w',
  'rotate-nw',
  'rotate-n',
  'rotate-ne',
];

function hintForDirection(direction: Point): CursorHint {
  if (direction.x === 0 && direction.y === 0) return 'none';
  const angle = Math.atan2(direction.y, direction.x);
  // 除以 45°、四舍五入，取模 8 得到扇区。双向箭头本身对称，所以 8 档只有 4 种值
  const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return HINT_BY_SECTOR[sector];
}

/**
 * 悬停提示。**光标必须跟着框一起转**：框转 90° 之后，原来的"上边"
 * 已经在屏幕左侧，还给 ns-resize 就是在骗用户——箭头方向和实际能拉的
 * 方向差 90°。所以把法向量过一遍变换的线性部分，再按屏幕上的实际角度选箭头。
 *
 * ctrl 为真时表示斜切：那时边是沿自身滑动，方向与法向垂直。
 *
 * point 是指针位置（文档坐标），旋转时用它算出光标朝哪个方向。
 * 未提供时退化成朝北（与旧行为一致，但不该发生——旋转总有指针位置）。
 */
export function cursorHintFor(
  handle: BoxHandle,
  state: TransformState,
  ctrl: boolean,
  point?: Point,
): CursorHint {
  if (handle === 'rotate') {
    if (!point) return 'rotate-n'; // 回退：旧代码路径可能没传，给个默认方向
    const center = centerOf(state.rect);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    // 正好在中心时给正东（扇区 0），不会是 undefined
    if (dx === 0 && dy === 0) return 'rotate-e';
    const angle = Math.atan2(dy, dx);
    const sector = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
    return ROTATE_BY_SECTOR[sector];
  }
  if (handle === 'inside') return 'move';
  if (handle === null) return 'none';

  const normal = HANDLE_NORMAL[handle];
  if (!normal) return 'none';

  /*
   * 按实际半宽半高缩放，而不是直接用 ±1 的单位法向：
   * 200×100 的框，左上角的对角线是 -153° 而不是 -135°，用单位法向会算错扇区。
   * 顺带处理了镜像——负宽高会自然把方向翻过去，不用另外判符号。
   */
  const scaled = {
    x: (normal.x * state.rect.width) / 2,
    y: (normal.y * state.rect.height) / 2,
  };
  // 只要线性部分：方向不受平移影响
  const linear = compose(rotation(state.angle), skewing(state.skewX, state.skewY));
  const mapped = applyMatrix({ ...linear, e: 0, f: 0 }, scaled);
  // 斜切时边沿自身滑动，把方向转 90°
  const direction = ctrl ? { x: -mapped.y, y: mapped.x } : mapped;
  return hintForDirection(direction);
}
