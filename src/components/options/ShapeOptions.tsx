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
import Checkbox from '../ui/Checkbox';
import { useEditorStore } from '../../store';
import { SHAPE_KINDS } from '../../engine/shapeRender';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

export default function ShapeOptions() {
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);
  const needsPoints = options.shapeKind === 'star' || options.shapeKind === 'polygon';
  const t = useT();
  const kinds = useTranslatedOptions(SHAPE_KINDS);

  return (
    <>
      <div className={styles.group}>
        <Select
          label={t('shape.label')}
          value={options.shapeKind}
          options={kinds}
          onChange={(value) => setToolOption('shapeKind', value)}
        />
      </div>
      <Checkbox
        label={t('shape.filled')}
        checked={options.shapeFilled}
        onChange={(value) => setToolOption('shapeFilled', value)}
      />
      <div className={styles.sliderCell}>
        <Slider
          label={t('effect.stroke')}
          min={0}
          max={60}
          value={options.shapeStrokeWidth}
          onChange={(value) => setToolOption('shapeStrokeWidth', value)}
        />
      </div>
      {options.shapeKind === 'rect' ? (
        <div className={styles.sliderCell}>
          <Slider
            label={t('shape.radius')}
            min={0}
            max={200}
            value={options.shapeRadius}
            onChange={(value) => setToolOption('shapeRadius', value)}
          />
        </div>
      ) : null}
      {needsPoints ? (
        <div className={styles.sliderCell}>
          <Slider
            label={t('shape.points')}
            min={3}
            max={20}
            value={options.shapePoints}
            onChange={(value) => setToolOption('shapePoints', value)}
          />
        </div>
      ) : null}
      <span className={styles.hint}>{t('shape.hint')}</span>
    </>
  );
}
