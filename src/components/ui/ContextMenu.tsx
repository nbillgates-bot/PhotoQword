/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import styles from './ui.module.css';

/** 一个菜单项。separator 为真时只画分隔线，其余字段忽略 */
export interface ContextMenuItem {
  id: string;
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  /** 分组标题，不可点。对应 PS 菜单里那种灰色小标题 */
  heading?: boolean;
  /** 左侧打勾，给单选/开关类的项用 */
  checked?: boolean;
  /** 左侧色块，给「图层颜色」这类需要示意颜色的项用 */
  swatch?: string;
  run?: () => void;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  /** 鼠标位置（视口坐标） */
  x: number;
  y: number;
  onClose: () => void;
}

/**
 * 右键上下文菜单。
 *
 * 用 fixed 定位：菜单的触发点在可滚动的面板里，
 * 绝对定位会被 overflow 裁掉（与工具栏 flyout 同一个坑）。
 */
export default function ContextMenu({ items, x, y, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  /*
   * 翻转要在 DOM 上量真实尺寸，不能按项数估算：
   * 菜单宽度取决于最长的那条文案。useLayoutEffect 保证在浏览器绘制前改完，
   * 否则会看到菜单先出现在错的位置再跳一下。
   */
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const left = x + box.width > window.innerWidth ? Math.max(4, x - box.width) : x;
    const top = y + box.height > window.innerHeight ? Math.max(4, y - box.height) : y;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    // 捕获阶段：面板自己也监听 pointerdown，不能让它先把菜单关掉
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={styles.contextMenu}
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      // 菜单自己也要能右键，否则会弹出浏览器原生菜单盖在上面
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className={styles.contextSep} role="separator" />
        ) : item.heading ? (
          // 用 presentation 而不是 menuitem：它不可聚焦，读屏软件报成菜单项会误导
          <div key={item.id} className={styles.contextHeading} role="presentation">
            {item.label}
          </div>
        ) : (
          <button
            key={item.id}
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
            aria-checked={item.checked}
            className={styles.contextItem}
            disabled={item.disabled}
            onClick={() => {
              item.run?.();
              onClose();
            }}
          >
            {item.checked !== undefined ? (
              <span className={styles.contextCheck} aria-hidden="true">
                {item.checked ? <Check size={12} /> : null}
              </span>
            ) : null}
            {item.swatch !== undefined ? (
              <span
                className={styles.contextSwatch}
                style={{ background: item.swatch }}
                aria-hidden="true"
              />
            ) : null}
            <span className={styles.contextLabel}>{item.label}</span>
            {item.shortcut ? <span className={styles.contextShortcut}>{item.shortcut}</span> : null}
          </button>
        ),
      )}
    </div>
  );
}
