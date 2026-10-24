/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Options.module.css';
import Slider from '../ui/Slider';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

export default function EraserOptions() {
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
          value={options.eraserSize}
          onChange={(value) => setToolOption('eraserSize', value)}
        />
      </div>
      <div className={styles.sliderCell}>
        <Slider
          label={t('brush.hardness')}
          min={0}
          max={100}
          value={options.eraserHardness}
          onChange={(value) => setToolOption('eraserHardness', value)}
        />
      </div>
      <div className={styles.sliderCell}>
        <Slider
          label={t('common.opacity')}
          min={1}
          max={100}
          value={options.eraserOpacity}
          onChange={(value) => setToolOption('eraserOpacity', value)}
        />
      </div>
    </>
  );
}
