/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import Select from '../ui/Select';
import Slider from '../ui/Slider';
import Checkbox from '../ui/Checkbox';
import ColorPicker from '../ui/ColorPicker';
import { SHAPE_KINDS } from '../../engine/shapeRender';
import type { ShapeData } from '../../types';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

interface ShapePropertiesProps {
  data: ShapeData;
  onChange: (patch: Partial<ShapeData>) => void;
  onCommit: (label: string) => void;
}

/** 形状图层属性编辑器。形状图层保留矢量参数，可反复修改而不损失质量 */
export default function ShapeProperties({ data, onChange, onCommit }: ShapePropertiesProps) {
  const t = useT();
  const kinds = useTranslatedOptions(SHAPE_KINDS);

  return (
    <div className={styles.adjustBody}>
      <Select
        label={t('shape.label')}
        value={data.kind}
        options={kinds}
        onChange={(kind) => {
          onChange({ kind });
          onCommit('action.shapeKind');
        }}
      />

      <Checkbox
        label={t('shape.filled')}
        checked={data.filled}
        onChange={(filled) => {
          onChange({ filled });
          onCommit('action.shapeFilled');
        }}
      />

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('shape.fillColor')}</span>
        <ColorPicker
          color={data.fill}
          label={t('shape.fillColor')}
          onChange={(fill) => {
            onChange({ fill });
            onCommit('action.shapeFill');
          }}
        />
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('shape.strokeColor')}</span>
        <ColorPicker
          color={data.stroke}
          label={t('shape.strokeColor')}
          onChange={(stroke) => {
            onChange({ stroke });
            onCommit('action.shapeStroke');
          }}
        />
      </div>

      <Slider
        label={t('shape.strokeWidth')}
        min={0}
        max={80}
        value={data.strokeWidth}
        unit="px"
        onChange={(strokeWidth) => onChange({ strokeWidth })}
        onCommit={() => onCommit('action.shapeStrokeWidth')}
      />

      {data.kind === 'rect' && (
        <Slider
          label={t('shape.radius')}
          min={0}
          max={200}
          value={data.radius}
          unit="px"
          onChange={(radius) => onChange({ radius })}
          onCommit={() => onCommit('action.shapeRadius')}
        />
      )}

      {(data.kind === 'star' || data.kind === 'polygon') && (
        <Slider
          label={t('shape.points')}
          min={3}
          max={24}
          value={data.points}
          onChange={(points) => onChange({ points })}
          onCommit={() => onCommit('action.shapePoints')}
        />
      )}
    </div>
  );
}
