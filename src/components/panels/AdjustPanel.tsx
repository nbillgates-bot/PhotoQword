/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import styles from './Panels.module.css';
import Slider from '../ui/Slider';
import Button from '../ui/Button';
import { useEditorStore } from '../../store';
import { DEFAULT_ADJUST, applyAdjust, type AdjustParams } from '../../engine/adjustments';
import { cloneCanvas, ctx2d } from '../../engine/canvasUtils';
import { useT } from '../../hooks/useT';

/** 从基准画布重新计算目标画布的像素。基准不变，所以可以反复预览 */
function renderAdjust(
  target: HTMLCanvasElement,
  base: HTMLCanvasElement,
  params: AdjustParams,
): void {
  const ctx = ctx2d(target);
  const baseCtx = ctx2d(base);
  const image = baseCtx.getImageData(0, 0, base.width, base.height);
  applyAdjust(image, params);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.putImageData(image, 0, 0);
}

interface AdjustField {
  key: keyof AdjustParams;
  labelKey: string;
  min: number;
  max: number;
}

const FIELDS: AdjustField[] = [
  { key: 'brightness', labelKey: 'adjust.brightness', min: -100, max: 100 },
  { key: 'contrast', labelKey: 'adjust.contrast', min: -100, max: 100 },
  { key: 'saturation', labelKey: 'adjust.saturation', min: -100, max: 100 },
  { key: 'vibrance', labelKey: 'adjust.vibrance', min: -100, max: 100 },
  { key: 'exposure', labelKey: 'adjust.exposure', min: -100, max: 100 },
  { key: 'hue', labelKey: 'adjust.hue', min: -180, max: 180 },
  { key: 'temperature', labelKey: 'adjust.temperature', min: -100, max: 100 },
];

const PRESETS: Array<{ labelKey: string; params: Partial<AdjustParams> }> = [
  { labelKey: 'adjust.preset.bright', params: { brightness: 18, contrast: 10 } },
  { labelKey: 'adjust.preset.soft', params: { contrast: -12, saturation: -8 } },
  { labelKey: 'adjust.preset.vivid', params: { saturation: 28, contrast: 14 } },
  { labelKey: 'adjust.preset.warm', params: { temperature: 30, vibrance: 10 } },
  { labelKey: 'adjust.preset.cool', params: { temperature: -30, saturation: 6 } },
  { labelKey: 'adjust.preset.highContrast', params: { contrast: 42, exposure: 6 } },
];

/**
 * 调整面板：拖动滑块时实时预览。
 * 预览的实现是「保留一份原始像素副本，每次都从副本重算」，
 * 这样连续拖动不会把误差累积到图层上。
 */
export default function AdjustPanel() {
  const t = useT();
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const bumpRevision = useEditorStore((state) => state.bumpRevision);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const [params, setParams] = useState<AdjustParams>(DEFAULT_ADJUST);
  const [baseline, setBaseline] = useState<HTMLCanvasElement | null>(null);

  /** 第一次调整时抓一份原图作为基准 */
  const ensureBaseline = () => {
    if (baseline || !activeLayer) return baseline;
    const copy = cloneCanvas(activeLayer.canvas);
    setBaseline(copy);
    return copy;
  };

  const preview = (next: AdjustParams, base: HTMLCanvasElement | null) => {
    if (!activeLayer || !base) return;
    renderAdjust(activeLayer.canvas, base, next);
    bumpRevision();
  };

  const update = (key: keyof AdjustParams, value: number) => {
    const base = ensureBaseline();
    const next = { ...params, [key]: value };
    setParams(next);
    preview(next, base);
  };

  const applyPreset = (patch: Partial<AdjustParams>) => {
    const base = ensureBaseline();
    const next = { ...DEFAULT_ADJUST, ...patch };
    setParams(next);
    preview(next, base);
  };

  const reset = () => {
    if (activeLayer && baseline) {
      renderAdjust(activeLayer.canvas, baseline, DEFAULT_ADJUST);
      bumpRevision();
    }
    setParams(DEFAULT_ADJUST);
  };

  const apply = () => {
    if (!baseline) return;
    // 调整只作用于当前图层，点名它避免多图层文档下多余的整幅读取
    pushHistory('action.adjustColor', activeLayer ? { layerIds: [activeLayer.id] } : undefined);
    setBaseline(null);
    setParams(DEFAULT_ADJUST);
  };

  const cancel = () => {
    reset();
    setBaseline(null);
  };

  if (!activeLayer) {
    return <div className={styles.empty}>{t('panel.pickLayer')}</div>;
  }

  return (
    <div className={styles.adjustBody}>
      {FIELDS.map((field) => (
        <Slider
          key={field.key}
          label={t(field.labelKey)}
          min={field.min}
          max={field.max}
          value={params[field.key]}
          onChange={(value) => update(field.key, value)}
        />
      ))}

      <div>
        <span className={styles.fieldLabel}>{t('newDoc.preset')}</span>
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <Button key={preset.labelKey} onClick={() => applyPreset(preset.params)}>
              {t(preset.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <div className={styles.adjustFooter}>
        <Button variant="primary" onClick={apply} disabled={!baseline}>
          {t('common.apply')}
        </Button>
        <Button onClick={cancel} disabled={!baseline}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
