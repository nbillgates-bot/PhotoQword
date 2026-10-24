/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useRef } from 'react';
import { useEditorStore } from '../store';
import { guideAtPoint, guideOutsideDoc } from '../engine/guides';
import type { Guide, Point } from '../types';

/** 正在拖的参考线。fresh 表示这条是本次拖拽新建的 */
interface DragSession {
  id: string;
  orientation: 'h' | 'v';
  pointerId: number;
  fresh: boolean;
}

interface UseGuideDragArgs {
  /** 客户端坐标 -> 文档坐标 */
  toDoc: (clientX: number, clientY: number) => Point;
}

/**
 * 参考线的拖拽交互，覆盖 PS 的两条路径：
 * 从标尺拖出新参考线，以及在画布上拖动已有参考线。
 *
 * 拖拽中直接改 store 而不另存一份预览状态——参考线本来就画在覆盖层上，
 * 改 store 就等于实时预览，省掉一套预览绘制代码。
 */
export function useGuideDrag({ toDoc }: UseGuideDragArgs) {
  const session = useRef<DragSession | null>(null);

  /** 把参考线挪到指针当前位置 */
  const trackTo = useCallback(
    (clientX: number, clientY: number) => {
      const drag = session.current;
      if (!drag) return;
      const store = useEditorStore.getState();
      const { doc } = store;
      if (!doc) return;
      const point = toDoc(clientX, clientY);
      const raw = drag.orientation === 'h' ? point.y : point.x;
      /*
       * 拖拽中不夹到文档范围内：PS 里参考线是跟着光标走的，
       * 拖到画布外（含拖回标尺）也照样跟随，松手时才判定要不要删。
       * 夹了会让参考线黏在文档边缘，看起来像"位置不对"。
       */
      store.moveGuide(drag.id, Math.round(raw));
    },
    [toDoc],
  );

  /**
   * 在标尺上按下：新建一条参考线并立刻进入拖拽。
   * orientation 由哪把标尺决定——横标尺拖出水平线，竖标尺拖出垂直线。
   */
  const startFromRuler = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>, orientation: 'h' | 'v') => {
      const store = useEditorStore.getState();
      const { doc } = store;
      if (!doc) return;
      event.preventDefault();
      // 从标尺拖出时参考线要跟着显示，否则拖了半天看不见
      if (!store.showGuides) store.toggleGuides();

      const point = toDoc(event.clientX, event.clientY);
      const raw = orientation === 'h' ? point.y : point.x;
      /*
       * 同 trackTo：新建时也不夹。在标尺上按下时光标还在文档外（坐标为负），
       * 夹成 0 会让参考线一出生就贴在图片顶边/左边，与 PS 不符。
       */
      const id = store.addGuide(orientation, Math.round(raw));

      session.current = { id, orientation, pointerId: event.pointerId, fresh: true };
      // 捕获指针：拖拽会离开标尺进到画布里，不捕获就丢事件
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [toDoc],
  );

  /** 在画布上按下：压住参考线才接管，返回是否接管 */
  const startFromCanvas = useCallback(
    (event: React.PointerEvent<Element>): boolean => {
      const store = useEditorStore.getState();
      const { doc, guides, showGuides, zoom } = store;
      if (!doc || !showGuides || guides.length === 0) return false;

      const hit: Guide | null = guideAtPoint(guides, toDoc(event.clientX, event.clientY), zoom);
      if (!hit) return false;

      session.current = {
        id: hit.id,
        orientation: hit.orientation,
        pointerId: event.pointerId,
        fresh: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return true;
    },
    [toDoc],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent): boolean => {
      const drag = session.current;
      if (!drag || drag.pointerId !== event.pointerId) return false;
      trackTo(event.clientX, event.clientY);
      return true;
    },
    [trackTo],
  );

  /** 松手定案：落在文档外就删掉这条参考线，与 PS 一致 */
  const onPointerUp = useCallback(
    (event: React.PointerEvent): boolean => {
      const drag = session.current;
      if (!drag || drag.pointerId !== event.pointerId) return false;
      session.current = null;

      const store = useEditorStore.getState();
      const { doc } = store;
      const point = toDoc(event.clientX, event.clientY);
      const raw = drag.orientation === 'h' ? point.y : point.x;
      if (!doc || guideOutsideDoc(drag.orientation, raw, doc)) {
        store.deleteGuide(drag.id);
      }
      return true;
    },
    [toDoc],
  );

  /** 拖拽中（用于让画布跳过工具的指针处理） */
  const dragging = useCallback(() => session.current !== null, []);

  return { startFromRuler, startFromCanvas, onPointerMove, onPointerUp, dragging };
}
