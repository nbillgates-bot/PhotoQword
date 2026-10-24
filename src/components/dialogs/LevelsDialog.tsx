/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store';
import {
  applyLevels,
  autoLevels,
  defaultLevels,
  histogram,
  type LevelsChannel,
  type LevelsChannelId,
  type LevelsParams,
} from '../../engine/levels';
import { cloneCanvas, ctx2d } from '../../engine/canvasUtils';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Slider from '../ui/Slider';
import Select from '../ui/Select';
import Histogram from './Histogram';
import styles from './Dialogs.module.css';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

const CHANNELS: Array<{ value: LevelsChannelId; label: string }> = [
  { value: 'rgb', label: 'RGB' },
  { value: 'r', label: 'channel.red' },
  { value: 'g', label: 'channel.green' },
  { value: 'b', label: 'channel.blue' },
];

type Histograms = ReturnType<typeof histogram>;

/** 从画布取一份直方图；空画布返回 null */
function sample(source: HTMLCanvasElement): Histograms | null {
  if (source.width === 0 || source.height === 0) return null;
  return histogram(ctx2d(source).getImageData(0, 0, source.width, source.height));
}

/** 色阶：输入黑场/灰场/白场 + 输出范围，实时预览，对齐 PS 的 Ctrl+L */
export default function LevelsDialog() {
  const t = useT();
  // RGB 那档不进词条表：各语言都写 RGB，翻译函数会把它原样吐回来
  const channels = useTranslatedOptions(CHANNELS);
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const bumpRevision = useEditorStore((state) => state.bumpRevision);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const [channel, setChannel] = useState<LevelsChannelId>('rgb');
  const [params, setParams] = useState<LevelsParams>(defaultLevels);
  const [baseline, setBaseline] = useState<HTMLCanvasElement | null>(null);
  const [hist, setHist] = useState<Histograms | null>(null);

  const layerId = activeLayer?.id;
  const canvas = activeLayer?.canvas;

  /**
   * 快照原始像素并算直方图。只认图层 id：
   * 预览会一直改 canvas，跟着 canvas 走就会把预览结果当成基准。
   */
  useEffect(() => {
    if (!canvas) return;
    const snapshot = cloneCanvas(canvas);
    setBaseline(snapshot);
    setHist(sample(snapshot));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerId]);

  // 每次都从基准图重算，直接在图层上叠加会累积误差
  useEffect(() => {
    if (!canvas || !baseline) return;
    const context = ctx2d(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(baseline, 0, 0);
    if (canvas.width > 0 && canvas.height > 0) {
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      applyLevels(image, params);
      context.putImageData(image, 0, 0);
    }
    bumpRevision();
  }, [params, canvas, baseline, bumpRevision]);

  const restore = () => {
    if (!canvas || !baseline) return;
    const context = ctx2d(canvas);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(baseline, 0, 0);
    bumpRevision();
  };

  const submit = () => {
    if (!activeLayer) return;
    pushHistory('action.levels', { layerIds: [activeLayer.id] });
    closeDialog();
  };

  const cancel = () => {
    restore();
    closeDialog();
  };

  if (!activeLayer) return null;

  const current = params[channel];

  const patch = (partial: Partial<LevelsChannel>) => {
    setParams({ ...params, [channel]: { ...current, ...partial } });
  };

  /** 自动色阶按基准图算，否则会在已预览的结果上二次拉伸 */
  const auto = () => {
    if (!baseline || baseline.width === 0 || baseline.height === 0) return;
    setParams(autoLevels(ctx2d(baseline).getImageData(0, 0, baseline.width, baseline.height)));
  };

  return (
    <Modal
      title={t('menu.image.levels')}
      width={420}
      onClose={cancel}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('common.ok')}
          </Button>
          <Button onClick={auto}>{t('levels.auto')}</Button>
          <Button onClick={() => setParams(defaultLevels())}>{t('common.reset')}</Button>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <Select label={t('levels.channel')} value={channel} options={channels} onChange={setChannel} />

        {hist && <Histogram data={channel === 'rgb' ? hist.luma : hist[channel]} />}

        <div className={styles.sectionTitle}>{t('levels.input')}</div>
        <Slider
          label={t('levels.black')}
          min={0}
          max={254}
          value={current.inBlack}
          onChange={(v) => patch({ inBlack: Math.min(v, current.inWhite - 1) })}
        />
        <Slider
          label={t('levels.gamma')}
          min={0.1}
          max={9.99}
          step={0.01}
          value={current.gamma}
          onChange={(v) => patch({ gamma: v })}
        />
        <Slider
          label={t('levels.white')}
          min={1}
          max={255}
          value={current.inWhite}
          onChange={(v) => patch({ inWhite: Math.max(v, current.inBlack + 1) })}
        />

        <div className={styles.sectionTitle}>{t('levels.output')}</div>
        <Slider
          label={t('levels.black')}
          min={0}
          max={255}
          value={current.outBlack}
          onChange={(v) => patch({ outBlack: v })}
        />
        <Slider
          label={t('levels.white')}
          min={0}
          max={255}
          value={current.outWhite}
          onChange={(v) => patch({ outWhite: v })}
        />
      </div>
    </Modal>
  );
}
