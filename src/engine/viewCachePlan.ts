/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 合成结果复用的决策。
 *
 * 平移和缩放不改变任何图层的内容，只改变「看它的位置和倍率」。上一帧的合成
 * 结果因此大部分仍然可用：平移时把它整体挪一下、只补新露出的边条；缩放时
 * 先把它拉伸顶上，停手后再精确重算一遍。
 *
 * 这个模块只**判断**能不能复用、要补哪几块，不碰画布——决策是纯逻辑，
 * 单独测得清；画布操作在 viewCache.ts。
 *
 * 正确性的依据是 CanvasArea 那个合成 effect 的依赖表：那张表就是
 * 「什么时候必须重合成」的既有契约。缓存键取它减去 zoom/panX/panY
 * ——正是这三项该被缓存吸收，其余任意一项变了都必须全量重算。
 */

import type { Viewport } from './compositor';

/** 一次合成结果的几何身份 */
export interface CacheGeometry {
  /** 主画布尺寸（设备像素） */
  viewWidth: number;
  viewHeight: number;
  /** 文档像素 → 屏幕像素的倍率（含 dpr） */
  scale: number;
  /** 文档 (0,0) 在视口坐标里的位置 */
  originX: number;
  originY: number;
}

export type ViewCachePlan =
  /** 全量重合成 */
  | { kind: 'full' }
  /** 原样复用，一个像素都不用重画 */
  | { kind: 'reuse' }
  /** 整体平移后补上新露出的边条 */
  | { kind: 'shift'; dx: number; dy: number; strips: Viewport[] }
  /** 把缓存拉伸到新倍率顶上（画质降级，停手后会被精确结果替换） */
  | { kind: 'rescale' };

/**
 * 允许拉伸复用的倍率范围。
 *
 * 超出这个范围就重新全量合成一次并换掉缓存，于是缓存自然形成
 * 「每跨过一档换一层」的多级效果，内存只占一张——不必真的存一串金字塔。
 *
 * 上界 2：放大一倍以内的拉伸虽然发虚但轮廓还在，能撑住手势中的中间帧。
 * 下界 0.5：缩小是降采样，本来就比放大耐看，同样给一档。
 */
const RESCALE_MAX = 2;
const RESCALE_MIN = 0.5;

/**
 * 平移复用允许的取整误差（设备像素）。
 *
 * 位图整体挪动只能按整像素挪，而 origin 是浮点的。误差大于这个阈值时
 * 挪出来的画面与真实位置差得看得出来，而且连续平移会累积漂移，
 * 所以宁可全量重画。滚轮平移的增量本来就是整数，这一条只在
 * 触控板的小数增量下生效。
 */
const SHIFT_EPSILON = 0.01;

function nearlyInteger(value: number): boolean {
  return Math.abs(value - Math.round(value)) <= SHIFT_EPSILON;
}

/**
 * 决定能不能复用、怎么复用。
 *
 * 输入都是调用方已经有的：缓存的几何 vs 新的几何，以及是否正在交互。
 * 交互中允许拉伸降质，停手后这个函数会返回 full 触发精确重算。
 */
export function planViewCache(
  cached: CacheGeometry | null,
  current: CacheGeometry,
  interacting: boolean,
): ViewCachePlan {
  // 没缓存或尺寸不一样：无法复用，全量重算
  if (
    !cached ||
    cached.viewWidth !== current.viewWidth ||
    cached.viewHeight !== current.viewHeight
  ) {
    return { kind: 'full' };
  }

  const scaleRatio = current.scale / cached.scale;

  // 倍率变了
  if (scaleRatio !== 1) {
    // 交互中且在合理范围内：拉伸缓存顶上
    if (interacting && scaleRatio >= RESCALE_MIN && scaleRatio <= RESCALE_MAX) {
      return { kind: 'rescale' };
    }
    // 否则全量重算
    return { kind: 'full' };
  }

  // 倍率没变，看平移
  const dx = current.originX - cached.originX;
  const dy = current.originY - cached.originY;

  // 没动
  if (dx === 0 && dy === 0) return { kind: 'reuse' };

  // 挪了非整数像素：blit 会累积漂移，不如重画
  if (!nearlyInteger(dx) || !nearlyInteger(dy)) return { kind: 'full' };

  const dxi = Math.round(dx);
  const dyi = Math.round(dy);

  // 挪的距离超过整屏：整个视口都是新内容
  if (Math.abs(dxi) >= current.viewWidth || Math.abs(dyi) >= current.viewHeight) {
    return { kind: 'full' };
  }

  return { kind: 'shift', dx: dxi, dy: dyi, strips: computeStrips(dxi, dyi, current) };
}

/**
 * 内容整体挪 (dx,dy) 之后，哪几块是新露出来的。
 *
 * 两条边条：竖的贴左或右边、通高；横的贴上或下边，但**只覆盖竖条没占的那段**
 * ——竖条一定紧贴某条竖边，所以剩下的正好是一个区间，两条不重叠。
 * 重叠了也不会画错（每条都是清空后重画），但那块要白画两遍。
 */
function computeStrips(dx: number, dy: number, geometry: CacheGeometry): Viewport[] {
  const { viewWidth: width, viewHeight: height } = geometry;
  const strips: Viewport[] = [];

  // 竖条：往右挪露出左边，往左挪露出右边
  const stripWidth = Math.min(Math.abs(dx), width);
  const stripX = dx > 0 ? 0 : width - stripWidth;
  if (stripWidth > 0) {
    strips.push({ x: stripX, y: 0, width: stripWidth, height });
  }

  // 横条：躲开竖条占的那一段
  const restX = dx > 0 ? stripWidth : 0;
  const restWidth = width - stripWidth;
  const stripHeight = Math.min(Math.abs(dy), height);
  if (stripHeight > 0 && restWidth > 0) {
    strips.push({
      x: restX,
      y: dy > 0 ? 0 : height - stripHeight,
      width: restWidth,
      height: stripHeight,
    });
  }

  return strips;
}
