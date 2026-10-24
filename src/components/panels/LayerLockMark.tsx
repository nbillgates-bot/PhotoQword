/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Lock, LockOpen } from 'lucide-react';
import styles from './Panels.module.css';
import type { Layer } from '../../types';
import { useT } from '../../hooks/useT';

/**
 * 行尾的锁标记，与 PS 一致：
 * 全部锁定画实心锁，只锁了细分项（透明/像素/位置）画淡一点的锁。
 * 点它切「全部锁定」，细分锁在面板顶部的锁定栏里改。
 */
export default function LayerLockMark({
  layer,
  onToggle,
}: {
  layer: Layer;
  onToggle: () => void;
}) {
  const t = useT();
  const partial =
    !layer.locked &&
    Boolean(layer.lockTransparent || layer.lockPixels || layer.lockPosition);
  const title = layer.locked
    ? t('lock.unlockAll')
    : partial
      ? t('lock.partial')
      : t('lock.all');

  return (
    <button
      type="button"
      className={[
        styles.miniButton,
        styles.lockButton,
        layer.locked ? styles.miniActive : '',
        partial ? styles.lockPartial : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={title}
      aria-label={title}
      aria-pressed={layer.locked}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {layer.locked || partial ? <Lock size={13} /> : <LockOpen size={13} />}
    </button>
  );
}
