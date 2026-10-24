/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';
import styles from './Panels.module.css';
import Slider from '../ui/Slider';
import { useEditorStore } from '../../store';
import { flatten, makeThumbnail } from '../../engine/compositor';
import { MAX_ZOOM, MIN_ZOOM } from '../../store/viewSlice';
import { useT } from '../../hooks/useT';

/** 导航器：整图预览 + 缩放控制 + 文档信息 */
export default function NavigatorPanel() {
  const t = useT();
  const doc = useEditorStore((state) => state.doc);
  const layers = useEditorStore((state) => state.layers);
  const revision = useEditorStore((state) => state.revision);
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const selection = useEditorStore((state) => state.selection);

  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!doc) {
      setPreview('');
      return;
    }
    const handle = requestAnimationFrame(() => {
      const flat = flatten(layers, doc.width, doc.height);
      setPreview(makeThumbnail(flat, 240));
    });
    return () => cancelAnimationFrame(handle);
  }, [doc, layers, revision]);

  if (!doc) {
    return <div className={styles.empty}>{t('status.noDoc')}</div>;
  }

  return (
    <div className={styles.navigator}>
      <div className={styles.navPreview}>
        {preview && <img src={preview} alt={t('nav.preview')} className={styles.navImage} />}
      </div>

      <Slider
        label={t('options.zoom.label')}
        min={Math.round(MIN_ZOOM * 100)}
        max={Math.round(MAX_ZOOM * 100)}
        value={Math.round(zoom * 100)}
        unit="%"
        onChange={(value) => setZoom(value / 100)}
      />

      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('nav.document')}</span>
        <span>{doc.name}</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('nav.size')}</span>
        <span>
          {doc.width} × {doc.height} px
        </span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('newDoc.resolution')}</span>
        <span>{doc.resolution} DPI</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('nav.layerCount')}</span>
        <span>{layers.length}</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('nav.selection')}</span>
        <span>
          {selection
            ? `${Math.round(selection.bounds.width)} × ${Math.round(selection.bounds.height)}`
            : t('common.none')}
        </span>
      </div>
    </div>
  );
}
