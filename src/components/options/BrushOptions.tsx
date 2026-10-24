/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Options.module.css';
import Slider from '../ui/Slider';
import Select from '../ui/Select';
import { useEditorStore } from '../../store';
import type { BrushShape } from '../../types/tools';
import { useT } from '../../hooks/useT';

const SHAPES: { value: BrushShape; label: string }[] = [
  { value: 'round', label: 'brush.round' },
  { value: 'square', label: 'brush.square' },
  { value: 'soft', label: 'brush.soft' },
];

/** 画笔 / 铅笔 / 仿制图章 共用的参数条 */
export default function BrushOptions({ showShape = true }: { showShape?: boolean }) {
  const t = useT();
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);

  return (
    <>
      <div className={styles.sliderCell}>
        <Slider
          label={t('common.size')}
          min={1}
          max={500}
          value={options.brushSize}
          onChange={(value) => setToolOption('brushSize', value)}
        />
      </div>
      <div className={styles.sliderCell}>
        <Slider
          label={t('brush.hardness')}
          min={0}
          max={100}
          value={options.brushHardness}
          onChange={(value) => setToolOption('brushHardness', value)}
        />
      </div>
      <div className={styles.sliderCell}>
        <Slider
          label={t('common.opacity')}
          min={1}
          max={100}
          value={options.brushOpacity}
          onChange={(value) => setToolOption('brushOpacity', value)}
        />
      </div>
      {showShape ? (
        <div className={styles.group}>
          <Select
            label={t('brush.tip')}
            value={options.brushShape}
            options={SHAPES}
            onChange={(value) => setToolOption('brushShape', value)}
          />
        </div>
      ) : null}
    </>
  );
}
