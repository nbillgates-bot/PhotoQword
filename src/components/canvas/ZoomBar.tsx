/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Maximize2, Minus, Plus, Scan } from 'lucide-react';
import styles from './CanvasArea.module.css';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

interface ZoomBarProps {
  onFit: () => void;
}

export default function ZoomBar({ onFit }: ZoomBarProps) {
  const t = useT();
  const zoom = useEditorStore((state) => state.zoom);
  const zoomIn = useEditorStore((state) => state.zoomIn);
  const zoomOut = useEditorStore((state) => state.zoomOut);
  const actualPixels = useEditorStore((state) => state.actualPixels);

  return (
    <div className={styles.zoomBar}>
      <IconButton label={t('zoom.out')} onClick={() => zoomOut()}>
        <Minus size={15} />
      </IconButton>
      <span className={styles.zoomLevel}>
        {zoom < 0.1 ? (zoom * 100).toFixed(1) : Math.round(zoom * 100)}%
      </span>
      <IconButton label={t('zoom.in')} onClick={() => zoomIn()}>
        <Plus size={15} />
      </IconButton>
      <IconButton label={t('zoom.fit')} onClick={onFit}>
        <Maximize2 size={14} />
      </IconButton>
      <IconButton label={t('zoom.actual')} onClick={actualPixels}>
        <Scan size={14} />
      </IconButton>
    </div>
  );
}
