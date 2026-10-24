/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useMemo, useState } from 'react';
import styles from './Dialogs.module.css';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Slider from '../ui/Slider';
import { useEditorStore } from '../../store';
import { FILTERS } from './filterDefs';
import { cloneCanvas, ctx2d, createCanvas } from '../../engine/canvasUtils';
import { useT } from '../../hooks/useT';

/** 缩略图边长，用于滤镜预览格 */
const THUMB = 120;

/** 滤镜库：网格里每张卡片是该滤镜作用在当前图层缩略图上的真实效果 */
export default function FilterDialog() {
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const bumpRevision = useEditorStore((state) => state.bumpRevision);
  const pushHistory = useEditorStore((state) => state.pushHistory);
  const closeDialog = useEditorStore((state) => state.closeDialog);

  const [selected, setSelected] = useState<string | null>(null);
  const [strength, setStrength] = useState(50);
  const [baseline, setBaseline] = useState<HTMLCanvasElement | null>(null);
  const t = useT();

  // 打开对话框时锁定一份原始像素，之后所有预览都从它重算
  useEffect(() => {
    if (activeLayer) setBaseline(cloneCanvas(activeLayer.canvas));
  }, [activeLayer]);

  /** 小尺寸缩略图，只算一次，供所有卡片复用 */
  const thumbSource = useMemo(() => {
    if (!baseline) return null;
    const scale = Math.min(THUMB / baseline.width, THUMB / baseline.height, 1);
    const canvas = createCanvas(
      Math.max(1, Math.round(baseline.width * scale)),
      Math.max(1, Math.round(baseline.height * scale)),
    );
    ctx2d(canvas).drawImage(baseline, 0, 0, canvas.width, canvas.height);
    return canvas;
  }, [baseline]);

  /** 每个滤镜的预览图。强度变化时只需重算，不触碰真实图层 */
  const previews = useMemo(() => {
    if (!thumbSource) return {};
    const map: Record<string, string> = {};
    FILTERS.forEach((filter) => {
      const copy = cloneCanvas(thumbSource);
      try {
        filter.apply(copy, strength);
        map[filter.id] = copy.toDataURL('image/png');
      } catch {
        // 单个滤镜出错不该影响整个网格
        map[filter.id] = thumbSource.toDataURL('image/png');
      }
    });
    return map;
  }, [thumbSource, strength]);

  const preview = (filterId: string, value: number) => {
    if (!activeLayer || !baseline) return;
    const filter = FILTERS.find((item) => item.id === filterId);
    if (!filter) return;
    const ctx = ctx2d(activeLayer.canvas);
    ctx.clearRect(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);
    ctx.drawImage(baseline, 0, 0);
    filter.apply(activeLayer.canvas, value);
    bumpRevision();
  };

  const choose = (filterId: string) => {
    setSelected(filterId);
    preview(filterId, strength);
  };

  const changeStrength = (value: number) => {
    setStrength(value);
    if (selected) preview(selected, value);
  };

  const restore = () => {
    if (!activeLayer || !baseline) return;
    const ctx = ctx2d(activeLayer.canvas);
    ctx.clearRect(0, 0, activeLayer.canvas.width, activeLayer.canvas.height);
    ctx.drawImage(baseline, 0, 0);
    bumpRevision();
  };

  const submit = () => {
    if (selected) {
      const filterKey = FILTERS.find((f) => f.id === selected)?.label ?? '';
      // 滤镜只改当前图层
      pushHistory('action.filter', {
        layerIds: activeLayer ? [activeLayer.id] : undefined,
        labelParamKeys: { name: filterKey },
      });
    }
    closeDialog();
  };

  const cancel = () => {
    restore();
    closeDialog();
  };

  if (!activeLayer) return null;
  const current = FILTERS.find((item) => item.id === selected);

  return (
    <Modal
      title={t('filterDialog.title')}
      width={560}
      onClose={cancel}
      footer={
        <>
          <Button variant="primary" onClick={submit} disabled={!selected}>
            {t('common.apply')}
          </Button>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.filterGrid}>
          {FILTERS.map((filter) => (
            <button
              type="button"
              key={filter.id}
              className={styles.filterCard}
              aria-pressed={selected === filter.id}
              style={
                selected === filter.id ? { borderColor: 'var(--accent-primary)' } : undefined
              }
              onClick={() => choose(filter.id)}
            >
              {previews[filter.id] && (
                <img src={previews[filter.id]} alt="" className={styles.filterThumb} />
              )}
              <span>{t(filter.label)}</span>
            </button>
          ))}
        </div>

        {current?.hasStrength && (
          <Slider
            label={t('common.strength')}
            min={1}
            max={100}
            value={strength}
            unit="%"
            onChange={changeStrength}
          />
        )}
      </div>
    </Modal>
  );
}
