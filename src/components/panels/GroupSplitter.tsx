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
import { useT } from '../../hooks/useT';

/**
 * 历史组与图层组之间的水平拖拽分隔条。
 *
 * 与 PanelSplitter（垂直，调面板总宽）是同一套做法，只是换了轴：
 * 比例由「指针在面板区里的相对位置」决定，不用累加位移 —— 累加会在指针被夹住
 * 时继续攒偏移，松手后面板跳一大截。
 *
 * 键盘也能调：role="separator" + 上下方向键（规约 §5）。
 */

/** 方向键一次调多少比例（0.05 = 5%） */
const KEY_STEP = 0.05;

export default function GroupSplitter() {
  const t = useT();
  const ratio = useEditorStore((state) => state.historyGroupRatio);
  const setRatio = useEditorStore((state) => state.setHistoryGroupRatio);
  const draggingRef = useRef(false);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    draggingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      /*
       * 比例 = (指针 Y - 面板区顶边) / 面板区高度。
       *
       * 用 parentElement 而不是 currentTarget：分隔条自己只有 4px 高，
       * 拿它算比例会得到 0 或 1 这种没用的值。父节点才是整个面板区。
       */
      const host = event.currentTarget.parentElement;
      if (!host) return;
      const box = host.getBoundingClientRect();
      if (box.height <= 0) return;
      setRatio((event.clientY - box.top) / box.height);
    },
    [setRatio],
  );

  const finish = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // 往上是历史组变小，与拖动方向一致
      const delta = event.key === 'ArrowUp' ? -KEY_STEP : event.key === 'ArrowDown' ? KEY_STEP : 0;
      if (delta === 0) return;
      event.preventDefault();
      setRatio(ratio + delta);
    },
    [ratio, setRatio],
  );

  return (
    <div
      className={styles.groupSplitter}
      role="separator"
      aria-orientation="horizontal"
      aria-label={t('panel.resizeGroupHeight')}
      // aria-valuenow 要整数百分比，0.3 -> 30
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={10}
      aria-valuemax={90}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={onKeyDown}
    />
  );
}
