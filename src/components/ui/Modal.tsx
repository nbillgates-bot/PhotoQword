/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import styles from './ui.module.css';
import IconButton from './IconButton';
import { useDragPanel } from '../../hooks/useDragPanel';
import { useT } from '../../hooks/useT';

interface ModalProps {
  title: string;
  width?: number;
  onClose: () => void;
  footer?: ReactNode;
  /**
   * 在这个对话框里操作时不打断正在进行的文字编辑。
   *
   * 只有拾色器需要（选中几个字 → 点色块 → 挑颜色，整个过程 textarea 不能退出编辑）。
   * 默认关着：别的对话框（改画布尺寸之类）打开时该照常提交文字。
   */
  keepTextEdit?: boolean;
  children: ReactNode;
}

export default function Modal({
  title,
  width = 380,
  onClose,
  footer,
  keepTextEdit,
  children,
}: ModalProps) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  // 拖标题栏移动，与 PS 的对话框一致
  const { offset, dragging, handlers } = useDragPanel(panelRef);

  // Esc 关闭，并把焦点移入弹窗，避免键盘用户被留在背景里
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className={styles.backdrop} data-keep-text-edit={keepTextEdit ? '' : undefined}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={styles.modal}
        style={{ width, transform: `translate(${offset.x}px, ${offset.y}px)` }}
      >
        <div
          className={`${styles.modalHeader} ${styles.modalDragHandle} ${dragging ? styles.modalDragging : ''}`}
          {...handlers}
        >
          <span>{title}</span>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer ? <div className={styles.modalFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}
