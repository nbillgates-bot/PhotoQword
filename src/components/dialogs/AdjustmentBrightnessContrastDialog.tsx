/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import { useEditorStore } from '../../store';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Slider from '../ui/Slider';
import styles from './Dialogs.module.css';
import { useT } from '../../hooks/useT';

/** 亮度/对比度调整图层参数对话框 */
export default function AdjustmentBrightnessContrastDialog() {
  const t = useT();
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const setAdjustmentParams = useEditorStore((state) => state.setAdjustmentParams);
  const bumpRevision = useEditorStore((state) => state.bumpRevision);

  const initial = activeLayer?.adjustmentData?.params || {
    brightness: 0,
    contrast: 0,
    saturation: 0,
    hue: 0,
    exposure: 0,
    temperature: 0,
    vibrance: 0,
  };

  const [brightness, setBrightness] = useState((initial.brightness as number) ?? 0);
  const [contrast, setContrast] = useState((initial.contrast as number) ?? 0);

  const handleBrightnessChange = (value: number) => {
    setBrightness(value);
    if (!activeLayer?.id) return;
    setAdjustmentParams(activeLayer.id, { ...initial, brightness: value });
    bumpRevision();
  };

  const handleContrastChange = (value: number) => {
    setContrast(value);
    if (!activeLayer?.id) return;
    setAdjustmentParams(activeLayer.id, { ...initial, contrast: value });
    bumpRevision();
  };

  return (
    <Modal title={t('adjustLayer.brightnessContrast')} onClose={closeDialog}>
      <div className={styles.dialogContent}>
        <div className={styles.field}>
          <Slider
            label={t('adjust.brightness')}
            min={-150}
            max={150}
            value={brightness}
            onChange={handleBrightnessChange}
            unit=""
          />
        </div>
        <div className={styles.field}>
          <Slider
            label={t('adjust.contrast')}
            min={-150}
            max={150}
            value={contrast}
            onChange={handleContrastChange}
            unit=""
          />
        </div>
      </div>
      <div className={styles.dialogActions}>
        <Button onClick={closeDialog}>{t('common.done')}</Button>
      </div>
    </Modal>
  );
}
