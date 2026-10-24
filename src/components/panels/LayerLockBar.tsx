/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Grid2x2, Lock, Move, Paintbrush } from 'lucide-react';
import type { ComponentType } from 'react';
import styles from './Panels.module.css';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import { LOCK_LABEL, shownAsLocked, type LockKind } from '../../engine/layerLock';
import { useT } from '../../hooks/useT';

/**
 * 锁定栏：「锁定：」+ 四个开关，顺序与 PS 图层面板一致
 * （透明像素 / 图像像素 / 位置 / 全部）。
 *
 * PS 用的是棋盘格、笔刷、十字箭头、锁头四个图标，这里取语义最接近的替代。
 */
const LOCKS: { kind: LockKind; Icon: ComponentType<{ size?: number }> }[] = [
  { kind: 'transparent', Icon: Grid2x2 },
  { kind: 'pixels', Icon: Paintbrush },
  { kind: 'position', Icon: Move },
  { kind: 'all', Icon: Lock },
];

export default function LayerLockBar() {
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const toggleSelectedLock = useEditorStore((state) => state.toggleSelectedLock);
  const t = useT();

  const active = layers.find((layer) => layer.id === activeLayerId) ?? null;

  return (
    <div className={styles.lockRow} role="group" aria-label={t('lock.label')}>
      {/* 冒号写进词条：中文用全角「：」，英文用半角「:」，标点跟着语言走 */}
      <span className={styles.lockLabel}>{t('lock.rowPrefix')}</span>
      {LOCKS.map(({ kind, Icon }) => {
        const on = active ? shownAsLocked(active, kind) : false;
        return (
          <IconButton
            key={kind}
            label={t(LOCK_LABEL[kind])}
            className={styles.lockBarButton}
            active={on}
            /*
             * 勾了「全部锁定」时 PS 把另外三个显示为锁上并置灰，
             * 点它们没反应，要先解开全部锁定。
             */
            disabled={!active || (kind !== 'all' && active.locked)}
            onClick={() => toggleSelectedLock(kind)}
          >
            <Icon size={13} />
          </IconButton>
        );
      })}
    </div>
  );
}
