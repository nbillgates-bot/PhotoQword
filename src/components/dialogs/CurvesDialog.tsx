/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';
import { useEditorStore } from '../../store';
import { applyCurves, defaultCurves, type CurvePoint, type CurvesParams } from '../../engine/curves';
import { histogram, type LevelsChannelId } from '../../engine/levels';
import { cloneCanvas, ctx2d } from '../../engine/canvasUtils';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import CurveEditor from './CurveEditor';
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

/** 曲线：拖控制点调色调，实时预览，对齐 PS 的 Ctrl+M */
export default function CurvesDialog() {
  const t = useT();
  const channels = useTranslatedOptions(CHANNELS);
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const bumpRevision = useEditorStore((state) => state.bumpRevision);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const [channel, setChannel] = useState<LevelsChannelId>('rgb');
  const [params, setParams] = useState<CurvesParams>(defaultCurves);
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
    if (snapshot.width > 0 && snapshot.height > 0) {
      setHist(histogram(ctx2d(snapshot).getImageData(0, 0, snapshot.width, snapshot.height)));
    }
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
      applyCurves(image, params);
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
    pushHistory('action.curves', { layerIds: [activeLayer.id] });
    closeDialog();
  };

  const cancel = () => {
    restore();
    closeDialog();
  };

  if (!activeLayer) return null;

  const setPoints = (points: CurvePoint[]) => {
    setParams({ ...params, [channel]: points });
  };

  return (
    <Modal
      title={t('menu.image.curves')}
      width={360}
      onClose={cancel}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('common.ok')}
          </Button>
          <Button onClick={() => setParams(defaultCurves())}>{t('common.reset')}</Button>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <Select label={t('levels.channel')} value={channel} options={channels} onChange={setChannel} />
        <CurveEditor
          points={params[channel]}
          histogram={hist ? (channel === 'rgb' ? hist.luma : hist[channel]) : undefined}
          onChange={setPoints}
        />
        <p className={styles.hint}>{t('curves.hint')}</p>
      </div>
    </Modal>
  );
}
