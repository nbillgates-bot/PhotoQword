/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './BottomSheet.module.css';
import IconButton from './IconButton';
import { useT } from '../../hooks/useT';

interface BottomSheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * 从屏幕底部升起的临时面板。
 *
 * 为什么不直接用 Modal：Modal 是居中 + 可拖标题栏的对话框（对齐 PS 的对话框），
 * 手指够不到屏幕正中，也没有必要在手机上拖窗口。这里是另一种容器，
 * 但对话框的那几条无障碍要求照旧：role="dialog"、Esc 关闭、打开时移入焦点
 * （规约 §5）。
 *
 * 只在窄屏用。桌面端的任何路径都不会渲染它。
 */
export default function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const t = useT();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 捕获阶段 + 阻止冒泡：别让 Esc 顺带取消掉正在进行的裁剪或变换
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      /* 点空白处关闭，是 bottom-sheet 的通用惯例；只认落在背景本身的点击 */
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={styles.sheet}
      >
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
