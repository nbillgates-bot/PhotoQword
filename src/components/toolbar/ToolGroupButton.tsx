/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import styles from './Toolbar.module.css';
import type { ToolDef } from './toolDefs';
import type { ToolId } from '../../types';
import { useT } from '../../hooks/useT';
import {
  flyoutHeight,
  placeRight,
  type FlyoutPlacer,
} from '../../engine/flyoutPlacement';

interface ToolGroupButtonProps {
  group: ToolDef[];
  activeTool: ToolId;
  /** 该组当前显示的工具（记住上次在组内的选择） */
  displayTool: ToolDef;
  onSelect: (id: ToolId) => void;
  /**
   * 弹出层落位策略。默认弹在按钮右侧（竖向工具栏，PS 的做法）；
   * 手机底部工具条传 placeAbove 弹到上方。
   *
   * 传函数而不是传一个 `above` 布尔：规约 1.3 禁止为加功能塞 flag 参数，
   * 差异做成传入的策略。两个策略本身在 engine/flyoutPlacement 里单测。
   */
  place?: FlyoutPlacer;
}

/** 长按展开的毫秒数。PS 大约 0.25s，太长会显得迟钝 */
const LONG_PRESS_MS = 250;

/**
 * 工具组按钮，交互对齐 PS：
 * - 单击 = 选中当前显示的工具
 * - 右键 / 长按 / 点右下角三角 = 在按钮右侧展开同组工具
 *
 * 弹出层用 fixed 定位并挂在按钮右侧，否则会被工具栏的
 * overflow-y: auto 裁掉（这是之前弹出层"跑到别处"的原因）。
 */
export default function ToolGroupButton({
  group,
  activeTool,
  displayTool,
  onSelect,
  place = placeRight,
}: ToolGroupButtonProps) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);
  const hasSiblings = group.length > 1;
  const isActive = group.some((tool) => tool.id === activeTool);
  const Icon = displayTool.icon;
  const open = pos !== null;
  const t = useT();
  const displayName = t(displayTool.label);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * 按落位策略算坐标并展开。
   *
   * 高度只能估（浮层还没渲染，量不到真实高度）。行高取 30：粗指针下 css 会把
   * flyoutItem 压到 40，这里估小了只会让浮层比实际短一点，落位仍在视口内 ——
   * 估大了反而会把靠上的浮层无谓地往下推。
   */
  const openFlyout = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos(
      place({
        button: rect,
        flyout: { width: 176, height: flyoutHeight(group.length, 30) },
        viewport: { width: window.innerWidth, height: window.innerHeight },
      }),
    );
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setPos(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPos(null);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => clearTimer, []);

  return (
    <div className={styles.slot} ref={wrapRef}>
      <button
        type="button"
        ref={buttonRef}
        className={`${styles.toolButton} ${isActive ? styles.active : ''}`}
        title={`${displayName} (${displayTool.shortcut})${
          hasSiblings ? t('toolbar.groupHint') : ''
        }`}
        aria-label={displayName}
        aria-pressed={isActive}
        onClick={() => {
          clearTimer();
          if (open) {
            setPos(null);
            return;
          }
          onSelect(displayTool.id);
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (hasSiblings) openFlyout();
        }}
        onPointerDown={() => {
          if (!hasSiblings) return;
          timerRef.current = window.setTimeout(openFlyout, LONG_PRESS_MS);
        }}
        onPointerUp={clearTimer}
        onPointerLeave={clearTimer}
      >
        <Icon size={18} />
        {hasSiblings ? (
          <span
            className={styles.groupMark}
            role="presentation"
            onPointerDown={(event) => {
              // 直接点三角立刻展开，不必等长按
              event.stopPropagation();
              event.preventDefault();
              openFlyout();
            }}
          />
        ) : null}
      </button>

      {pos ? (
        <div
          className={styles.flyout}
          role="menu"
          aria-label={t('toolbar.groupFlyout', { name: displayName })}
          style={{ left: pos.left, top: pos.top }}
        >
          {group.map((tool) => {
            const ItemIcon = tool.icon;
            const selected = tool.id === activeTool;
            return (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                aria-current={selected}
                className={`${styles.flyoutItem} ${selected ? styles.flyoutActive : ''}`}
                onClick={() => {
                  onSelect(tool.id);
                  setPos(null);
                }}
              >
                <span className={styles.flyoutCheck}>{selected ? <Check size={11} /> : null}</span>
                <ItemIcon size={15} />
                <span className={styles.flyoutLabel}>{t(tool.label)}</span>
                <span className={styles.flyoutKey}>{tool.shortcut}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
