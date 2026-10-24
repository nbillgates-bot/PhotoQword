/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { History as HistoryIcon, Redo2, Undo2 } from 'lucide-react';
import styles from './Panels.module.css';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';
import { historyLabel } from '../../i18n/historyLabel';

/** 历史记录面板：点击任意条目可直接跳到那一步 */
export default function HistoryPanel() {
  const history = useEditorStore((state) => state.history);
  const historyIndex = useEditorStore((state) => state.historyIndex);
  const jumpHistory = useEditorStore((state) => state.jumpHistory);
  const undo = useEditorStore((state) => state.undo);
  const redo = useEditorStore((state) => state.redo);
  const canUndo = useEditorStore((state) => state.canUndo());
  const canRedo = useEditorStore((state) => state.canRedo());
  const t = useT();

  return (
    <div>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>
          {t('history.title')} ({history.length})
        </span>
        <div className={styles.actions}>
          <IconButton label={t('common.undo')} disabled={!canUndo} onClick={undo}>
            <Undo2 size={14} />
          </IconButton>
          <IconButton label={t('common.redo')} disabled={!canRedo} onClick={redo}>
            <Redo2 size={14} />
          </IconButton>
        </div>
      </div>

      <div className={styles.historyList}>
        {history.length === 0 && (
          <div className={styles.empty}>
            <HistoryIcon size={20} />
            <span>{t('history.empty')}</span>
          </div>
        )}
        {history.map((entry, index) => (
          <button
            type="button"
            key={entry.id}
            className={`${styles.historyItem} ${index === historyIndex ? styles.historyCurrent : ''} ${
              index > historyIndex ? styles.historyFuture : ''
            }`}
            onClick={() => jumpHistory(index)}
            aria-current={index === historyIndex}
          >
            <span className={styles.historyIndex}>{index + 1}</span>
            {/* label 是词条 key（见 HistoryEntry），在这里按当前语言渲染 */}
            <span>{historyLabel(entry, t)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
