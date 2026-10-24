/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { ImagePlus, FolderOpen, Upload } from 'lucide-react';
import styles from './CanvasArea.module.css';
import Button from '../ui/Button';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

interface EmptyStateProps {
  onOpenFile: () => void;
  /** 正有文件悬在画布上方。此时提示换成「松手即可打开」 */
  dragOver?: boolean;
}

export default function EmptyState({ onOpenFile, dragOver = false }: EmptyStateProps) {
  const openDialog = useEditorStore((state) => state.openDialog);
  const t = useT();

  return (
    <div className={styles.emptyState}>
      <ImagePlus size={64} className={styles.emptyIcon} strokeWidth={1.2} />
      <div className={styles.emptyTitle}>{t('empty.title')}</div>
      <p className={styles.emptyText}>{t('empty.text')}</p>
      <div className={styles.emptyActions}>
        <Button variant="primary" onClick={() => openDialog('new')}>
          <ImagePlus size={15} />
          {t('empty.newDoc')}
        </Button>
        <Button onClick={onOpenFile}>
          <FolderOpen size={15} />
          {t('empty.openImage')}
        </Button>
      </div>

      {/*
        拖放提示做成独立的虚线框，而不是并进上面那段说明文字：
        它同时是拖放的落点指示——悬停时整块高亮，用户才知道松手有用。
      */}
      <div className={`${styles.dropHint} ${dragOver ? styles.dropHintActive : ''}`}>
        <Upload size={18} strokeWidth={1.6} />
        <div className={styles.dropHintBody}>
          <span className={styles.dropHintTitle}>
            {t(dragOver ? 'empty.dropNow' : 'empty.dropTitle')}
          </span>
          <span className={styles.dropHintFormats}>{t('empty.dropFormats')}</span>
        </div>
      </div>
    </div>
  );
}
