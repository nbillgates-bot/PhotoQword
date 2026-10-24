/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useEditorStore } from '../../store';
import styles from './Panels.module.css';
import { MIN_PANEL_WIDTH, maxPanelWidth } from '../../engine/panelWidth';
import { useT } from '../../hooks/useT';

/**
 * 面板与画布之间的拖拽分隔条。
 *
 * 宽度由「视口右边缘到指针」的距离决定，不用累加位移：累加会在指针被夹住
 * （拖到屏幕边缘之外）时继续攒偏移，松手后面板跳一大截。按绝对位置算就没这问题。
 *
 * 键盘也能调：role="separator" + 左右方向键，能用鼠标做的操作尽量也能用键盘
 * 完成（规约 §5）。
 */

/** 方向键一次调多少像素 */
const KEY_STEP = 16;

function currentViewportWidth(): number {
  return typeof window === 'undefined' ? 1600 : window.innerWidth;
}

export default function PanelSplitter() {
  const t = useT();
  const panelWidth = useEditorStore((state) => state.panelWidth);
  const setPanelWidth = useEditorStore((state) => state.setPanelWidth);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // 只响应主键：右键留给上下文菜单，中键是自动滚动
    if (event.button !== 0) return;
    draggingRef.current = true;
    // 必须捕获指针：不捕获时指针移出这条窄带就收不到 move，拖到一半卡住
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      // 面板贴着右边缘，所以宽度就是「右边缘到指针」的距离
      setPanelWidth(currentViewportWidth() - event.clientX, currentViewportWidth());
    },
    [setPanelWidth],
  );

  const finish = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // 往左是变宽（面板在右侧），与拖动方向一致
      const delta =
        event.key === 'ArrowLeft' ? KEY_STEP : event.key === 'ArrowRight' ? -KEY_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      setPanelWidth(panelWidth + delta, currentViewportWidth());
    },
    [panelWidth, setPanelWidth],
  );

  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="vertical"
      aria-label={t('panel.resizeWidth')}
      aria-valuenow={panelWidth}
      aria-valuemin={MIN_PANEL_WIDTH}
      aria-valuemax={maxPanelWidth(currentViewportWidth())}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      // 触屏被系统手势打断时也要收尾，否则会一直停在拖动态
      onPointerCancel={finish}
      onKeyDown={onKeyDown}
    />
  );
}
