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

/** 模糊/锐化/涂抹/减淡/加深 共用。hint 传的是词条 key，不是成品文字 */
export default function EffectOptions({ hint }: { hint?: string }) {
  const t = useT();
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);

  return (
    <>
      <div className={styles.sliderCell}>
        <Slider
          label={t('options.brushSize')}
          min={5}
          max={300}
          value={options.effectSize}
          onChange={(value) => setToolOption('effectSize', value)}
        />
      </div>
      <div className={styles.sliderCell}>
        <Slider
          label={t('common.strength')}
          min={1}
          max={100}
          value={options.effectStrength}
          onChange={(value) => setToolOption('effectStrength', value)}
        />
      </div>
      {hint ? <span className={styles.hint}>{t(hint)}</span> : null}
    </>
  );
}
