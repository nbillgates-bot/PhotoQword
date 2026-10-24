/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 把触屏的多点事件翻译成视图操作与编辑命令。
 *
 * 判定逻辑全在 engine/touchGestures.ts（纯函数、可单测），这里只负责三件
 * 组件层的事：持有状态、持有长按定时器、把识别出的手势派发到 store。
 *
 * 缩放平移复用桌面那套 rAF 合并（engine/pendingView + hooks/useViewFrame），
 * 不另写一份 —— 手指的事件密度比滚轮还高，更需要每帧只提交一次。
 *
 * **只处理 pointerType === 'touch'。** 鼠标与手写笔一律返回 false 交回原路径，
 * 桌面端行为因此一字不改（规约第零节）。
 */

import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../store';
import type { Point } from '../types';
import { isTouchPointer } from '../engine/inputCapability';
import {
  EMPTY_GESTURE,
  gestureCancel,
  gestureDown,
  gestureMove,
  gestureUp,
  takeLongPress,
  LONG_PRESS_MS,
  type GestureAction,
  type GestureState,
} from '../engine/touchGestures';
import { useViewFrame } from './useViewFrame';

interface UseTouchGesturesArgs {
  /** 客户端坐标 -> 视口内坐标。手势的一切位置都用视口坐标 */
  toViewport: (clientX: number, clientY: number) => Point;
  /** 长按到时：画布用它开上下文菜单（替代右键） */
  onLongPress: (point: Point) => void;
  /** 第二根手指落下，作废单指那一笔 */
  onAbortStroke: () => void;
}

/** 手势层是否接管了这个事件。true = 调用方不要再交给工具 */
export type Claimed = boolean;

export function useTouchGestures({ toViewport, onLongPress, onAbortStroke }: UseTouchGesturesArgs) {
  const stateRef = useRef<GestureState>(EMPTY_GESTURE);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewFrame = useViewFrame();

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 派发识别结果。缩放在前平移在后，与 nudgeView 内部顺序一致 */
  const dispatch = useCallback(
    (actions: GestureAction[]) => {
      for (const action of actions) {
        if (action.kind === 'pinch') viewFrame.zoomBy(action.factor, action.focus);
        else if (action.kind === 'pan') viewFrame.panBy(action.dx, action.dy);
        else if (action.kind === 'cancelStroke') onAbortStroke();
        else if (action.kind === 'longPress') onLongPress(action.point);
        else if (action.kind === 'tap') {
          // 双指 = 撤销，三指 = 重做（PS on iPad 的既有肌肉记忆）
          const store = useEditorStore.getState();
          if (action.fingers === 2) store.undo();
          else store.redo();
        }
      }
    },
    [viewFrame, onAbortStroke, onLongPress],
  );

  const apply = useCallback(
    (step: { state: GestureState; actions: GestureAction[] }) => {
      stateRef.current = step.state;
      dispatch(step.actions);
    },
    [dispatch],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent): Claimed => {
      if (!isTouchPointer(event.pointerType)) return false;
      const point = toViewport(event.clientX, event.clientY);
      apply(gestureDown(stateRef.current, { id: event.pointerId, point }, event.timeStamp));

      /*
       * 长按定时器只为第一根手指排。到点不直接开菜单，而是回去问
       * takeLongPress —— 期间可能已经被移动、被第二根手指作废了。
       */
      clearTimer();
      if (stateRef.current.longPress) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          // 用候选自己的起始时刻 + 阈值当"现在"：定时器实际到点时间会有抖动，
          // 拿它去比会偶发地判成"还不够久"
          const candidate = stateRef.current.longPress;
          if (candidate) apply(takeLongPress(stateRef.current, candidate.start + LONG_PRESS_MS));
        }, LONG_PRESS_MS);
      }
      // 多指阶段由手势层独占；第一根手指仍然交给工具
      return stateRef.current.multi;
    },
    [toViewport, apply, clearTimer],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent): Claimed => {
      if (!isTouchPointer(event.pointerType)) return false;
      const point = toViewport(event.clientX, event.clientY);
      apply(gestureMove(stateRef.current, { id: event.pointerId, point }));
      // 长按候选被移动打断了就把定时器也撤掉，省一次空跑
      if (!stateRef.current.longPress) clearTimer();
      return stateRef.current.multi;
    },
    [toViewport, apply, clearTimer],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent): Claimed => {
      if (!isTouchPointer(event.pointerType)) return false;
      const wasMulti = stateRef.current.multi;
      clearTimer();
      apply(gestureUp(stateRef.current, event.pointerId, event.timeStamp));
      /*
       * 抬手要按**抬手前**是否多指来判定接管。
       * 抬到只剩一根手指时 multi 仍为 true，那一根的 up 也不该回到工具，
       * 否则工具会收到一个没有配对 down 的 up。
       */
      return wasMulti;
    },
    [apply, clearTimer],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent): Claimed => {
      if (!isTouchPointer(event.pointerType)) return false;
      const wasMulti = stateRef.current.multi;
      clearTimer();
      apply(gestureCancel(stateRef.current, event.pointerId));
      return wasMulti;
    },
    [apply, clearTimer],
  );

  /** 卸载时收尾：留着的定时器会对着已卸载的组件开菜单 */
  useEffect(() => clearTimer, [clearTimer]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
