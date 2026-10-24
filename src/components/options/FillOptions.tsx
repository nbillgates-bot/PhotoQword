/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Options.module.css';
import Slider from '../ui/Slider';
import Checkbox from '../ui/Checkbox';
import Select from '../ui/Select';
import { useEditorStore } from '../../store';
import type { GradientKind } from '../../types/tools';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

/** label 存词条 key，由 useTranslatedOptions 在渲染时翻译 */
const GRADIENT_KINDS: { value: GradientKind; label: string }[] = [
  { value: 'linear', label: 'gradient.linear' },
  { value: 'radial', label: 'gradient.radial' },
];

/** 油漆桶参数 */
export function BucketOptions() {
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);
  const t = useT();

  return (
    <>
      <div className={styles.sliderCell}>
        <Slider
          label={t('options.tolerance')}
          min={0}
          max={100}
          value={options.bucketTolerance}
          onChange={(value) => setToolOption('bucketTolerance', value)}
        />
      </div>
      <Checkbox
        label={t('options.contiguous')}
        checked={options.bucketContiguous}
        onChange={(value) => setToolOption('bucketContiguous', value)}
      />
      <span className={styles.hint}>{t('options.bucket.hint')}</span>
    </>
  );
}

/** 渐变参数 */
export function GradientOptions() {
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);
  const t = useT();
  const kinds = useTranslatedOptions(GRADIENT_KINDS);

  return (
    <>
      <div className={styles.group}>
        <Select
          label={t('common.mode')}
          value={options.gradientKind}
          options={kinds}
          onChange={(value) => setToolOption('gradientKind', value)}
        />
      </div>
      <Checkbox
        label={t('options.reverse')}
        checked={options.gradientReverse}
        onChange={(value) => setToolOption('gradientReverse', value)}
      />
      <span className={styles.hint}>{t('options.gradient.hint')}</span>
    </>
  );
}
