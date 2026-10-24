/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 一帧之内累积起来的视图变化。
 *
 * **为什么需要它：** 滚轮和指针的到达频率远高于屏幕刷新率——触控板一次惯性
 * 滑动能吐上百个 wheel 事件。每个事件都直接写 store 的话，一帧之内会触发
 * 好几轮「React 重渲染 + 全量合成」，而其中只有最后一轮的结果真的上屏，
 * 前面几轮纯属白烧。所以事件只往这里累积，每帧提交一次。
 *
 * 纯数据 + 纯函数：不认识 rAF，也不认识 store。调度在 hooks/useViewFrame.ts。
 */

import type { Point } from '../types';

export interface PendingView {
  /** 缩放倍率，**累乘**。1 表示这一帧没有缩放 */
  zoomFactor: number;
  /** 平移增量（视口像素），累加 */
  panX: number;
  panY: number;
  /**
   * 缩放焦点（视口内坐标）。取**最后一次**事件的位置。
   *
   * 严格来说，「两次带各自焦点的缩放」与「一次合成倍率 + 最后那个焦点的缩放」
   * 并不完全等价：中间指针移动过，锚点就有偏差。但被合并的事件都来自同一次
   * 手势、同一帧之内（≤16ms），指针位移最多几个像素，锚点偏差在亚像素量级，
   * 肉眼不可见；而换来的是每帧只合成一次。PS 与 Photopea 也都这么做。
   */
  focus: Point | null;
}

/** 什么都没积压的初始态。**不要直接改它**，所有操作都返回新对象 */
export const EMPTY_PENDING: PendingView = Object.freeze({
  zoomFactor: 1,
  panX: 0,
  panY: 0,
  focus: null,
});

/** 这一帧是否无事可做。zoomFactor 恰好为 1 且没有平移时不必提交 */
export function isPendingEmpty(pending: PendingView): boolean {
  return pending.zoomFactor === 1 && pending.panX === 0 && pending.panY === 0;
}

/**
 * 累积一次缩放。
 *
 * 非法倍率（0、负数、NaN）直接忽略：它们会把 zoom 污染成 NaN，
 * 而 NaN 的 zoom 会让整条渲染链算出 NaN 坐标，画面直接空白且不报错。
 */
export function addZoom(pending: PendingView, factor: number, focus: Point | null): PendingView {
  if (!Number.isFinite(factor) || factor <= 0) return pending;
  return {
    ...pending,
    zoomFactor: pending.zoomFactor * factor,
    // 焦点取最后一次；这次没给焦点时保留上一次的，不要退回 null
    focus: focus ?? pending.focus,
  };
}

/** 累积一次平移。非有限增量忽略，理由同 addZoom */
export function addPan(pending: PendingView, dx: number, dy: number): PendingView {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return pending;
  return { ...pending, panX: pending.panX + dx, panY: pending.panY + dy };
}
