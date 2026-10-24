/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Point } from '../types';
import { clampDragOffset } from '../engine/dragOffset';

/** 直接展开到把手元素上的一组指针事件 */
interface DragHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  /** 触屏被系统手势打断时也要收尾，否则会一直停在拖动态 */
  onPointerCancel: () => void;
}

interface DragPanel {
  /** 当前位移，拼进 transform */
  offset: Point;
  /** 拖动中，可用来临时关掉过渡动画 */
  dragging: boolean;
  /** 绑到标题栏（拖动把手）上 */
  handlers: DragHandlers;
}

/**
 * 拖标题栏移动面板。位移用 transform 叠加，不改原本的定位方式，
 * 所以居中布局的对话框拿来就能用，初始位置不变。
 *
 * @param panelRef 被移动的元素，用来算夹取边界
 */
export function useDragPanel(panelRef: React.RefObject<HTMLElement | null>): DragPanel {
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  /** 按下瞬间的指针位置、当时的位移、以及位移为 0 时的面板矩形 */
  const start = useRef<{
    pointer: Point;
    offset: Point;
    base: { x: number; y: number; width: number; height: number };
  } | null>(null);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // 只响应主键：右键留给上下文菜单，中键是自动滚动
      if (event.button !== 0) return;
      // 标题栏上的按钮（关闭）不该同时起拖
      if ((event.target as HTMLElement).closest('button')) return;
      const panel = panelRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      start.current = {
        pointer: { x: event.clientX, y: event.clientY },
        offset,
        // 反推位移为 0 时的位置，夹取以它为基准
        base: {
          x: rect.left - offset.x,
          y: rect.top - offset.y,
          width: rect.width,
          height: rect.height,
        },
      };
      setDragging(true);
      /*
       * 必须捕获指针：不捕获时指针移出标题栏就收不到 move，拖到一半卡住。
       * 捕获之后后续事件全部送到这个元素，所以 move/up 也挂在它自己身上，
       * 不需要往 window 上加监听器。
       */
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [offset, panelRef],
  );

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const from = start.current;
    if (!from) return;
    setOffset(
      clampDragOffset(
        {
          x: from.offset.x + (event.clientX - from.pointer.x),
          y: from.offset.y + (event.clientY - from.pointer.y),
        },
        {
          base: from.base,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        },
      ),
    );
  }, []);

  const finish = useCallback(() => {
    start.current = null;
    setDragging(false);
  }, []);

  return {
    offset,
    dragging,
    handlers: { onPointerDown, onPointerMove, onPointerUp: finish, onPointerCancel: finish },
  };
}
