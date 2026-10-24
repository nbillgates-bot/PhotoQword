/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 把滚轮/拖动产生的视图变化合并到每帧一次提交。
 *
 * 事件到达频率远高于刷新率（触控板一次滑动上百个 wheel），逐个写 store
 * 会一帧触发好几轮重渲染与合成，只有最后一轮上屏。这里让事件只往
 * PendingView 里累积（纯逻辑在 engine/pendingView），rAF 到点提交一次。
 *
 * 顺带管「是否正在交互」：起手置位、停手 SETTLE_MS 之后复位。
 * 渲染质量按它分档（见 engine/viewportRender），所以一次手势只写两次 store。
 */

import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../store';
import type { Point } from '../types';
import {
  addPan,
  addZoom,
  EMPTY_PENDING,
  isPendingEmpty,
  type PendingView,
} from '../engine/pendingView';

/**
 * 手势停止多久算「落定」。
 *
 * 120ms 是试出来的：短于约 80ms 会被滚轮的自然间隔误判成停手，
 * 于是交互中途插进一次高质量重绘，反而更卡；长于 200ms 用户已经在等了。
 */
const SETTLE_MS = 120;

export function useViewFrame() {
  const pendingRef = useRef<PendingView>(EMPTY_PENDING);
  const frameRef = useRef(0);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 提交这一帧攒下的变化 */
  const flush = useCallback(() => {
    frameRef.current = 0;
    const pending = pendingRef.current;
    pendingRef.current = EMPTY_PENDING;
    if (isPendingEmpty(pending)) return;
    useEditorStore.getState().nudgeView({
      zoomFactor: pending.zoomFactor,
      panX: pending.panX,
      panY: pending.panY,
      focus: pending.focus,
    });
  }, []);

  const schedule = useCallback(() => {
    // 已经排了就不重复排：一帧只提交一次
    if (frameRef.current === 0) frameRef.current = requestAnimationFrame(flush);

    const store = useEditorStore.getState();
    store.setViewInteracting(true);
    if (settleRef.current !== null) clearTimeout(settleRef.current);
    settleRef.current = setTimeout(() => {
      settleRef.current = null;
      useEditorStore.getState().setViewInteracting(false);
    }, SETTLE_MS);
  }, [flush]);

  /** 累积一次缩放。factor 是相对倍率，focus 是视口内坐标 */
  const zoomBy = useCallback(
    (factor: number, focus: Point | null) => {
      pendingRef.current = addZoom(pendingRef.current, factor, focus);
      schedule();
    },
    [schedule],
  );

  /** 累积一次平移，单位是视口像素 */
  const panBy = useCallback(
    (dx: number, dy: number) => {
      pendingRef.current = addPan(pendingRef.current, dx, dy);
      schedule();
    },
    [schedule],
  );

  // 卸载时收尾：留着的 rAF 与定时器会对着已卸载的组件写 store
  useEffect(
    () => () => {
      if (frameRef.current !== 0) cancelAnimationFrame(frameRef.current);
      if (settleRef.current !== null) clearTimeout(settleRef.current);
    },
    [],
  );

  return { zoomBy, panBy };
}
