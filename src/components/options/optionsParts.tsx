/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Options.module.css';
import { useEditorStore } from '../../store';
import BrushOptions from './BrushOptions';
import Button from '../ui/Button';
import Slider from '../ui/Slider';
import { useT } from '../../hooks/useT';

/**
 * 选项栏里那些没必要各占一个文件的小组件。
 * 生成组件的工厂函数在 optionsFactories，映射表在 optionsDefs。
 */

/** 铅笔是硬边的，PS 的铅笔选项栏没有笔尖形状一栏 */
export function PencilOptions() {
  return <BrushOptions showShape={false} />;
}

export function CloneOptions() {
  const t = useT();
  return (
    <>
      <BrushOptions showShape={false} />
      <span className={styles.hint}>{t('options.clone.hint')}</span>
    </>
  );
}

export function ZoomOptions() {
  const zoom = useEditorStore((state) => state.zoom);
  const setZoom = useEditorStore((state) => state.setZoom);
  const actualPixels = useEditorStore((state) => state.actualPixels);
  const t = useT();
  return (
    <>
      <div className={styles.sliderCell}>
        <Slider
          label={t('options.zoom.label')}
          min={2}
          max={3200}
          unit="%"
          value={Math.round(zoom * 100)}
          onChange={(value) => setZoom(value / 100)}
        />
      </div>
      <Button variant="ghost" onClick={actualPixels}>
        {t('options.actualPixels')}
      </Button>
    </>
  );
}
