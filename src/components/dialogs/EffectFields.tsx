/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import Slider from '../ui/Slider';
import Select from '../ui/Select';
import ColorPicker from '../ui/ColorPicker';
import styles from './Dialogs.module.css';
import { BLEND_MODES, type BlendMode } from '../../types';
import type { FieldDef } from './effectDefs';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

interface EffectFieldsProps {
  fields: FieldDef[];
  /** 当前效果的参数对象 */
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

/**
 * 效果参数编辑区。
 * 纯展示：按 FieldDef 分派控件类型，不认识具体是哪个效果。
 */
export default function EffectFields({ fields, values, onChange }: EffectFieldsProps) {
  const t = useT();
  /*
   * BLEND_MODES 的 label 存的是词条 key，必须先翻。
   * 之前直接把它交给 Select，图层样式里的混合模式下拉显示的是
   * 'blend.normal' 这种原始 key。
   */
  const blendOptions = useTranslatedOptions(BLEND_MODES);

  return (
    <div className={styles.effectFields}>
      {fields.map((field) => {
        if (field.kind === 'slider') {
          return (
            <Slider
              key={field.key}
              label={t(field.labelKey)}
              min={field.min}
              max={field.max}
              unit={field.unit}
              value={Number(values[field.key] ?? 0)}
              onChange={(value) => onChange(field.key, value)}
            />
          );
        }

        if (field.kind === 'color') {
          return (
            <div key={field.key} className={styles.effectColorRow}>
              <span className={styles.effectFieldLabel}>{t(field.labelKey)}</span>
              <ColorPicker
                label={t(field.labelKey)}
                color={String(values[field.key] ?? '#000000')}
                onChange={(color) => onChange(field.key, color)}
              />
            </div>
          );
        }

        if (field.kind === 'blend') {
          return (
            <Select<BlendMode>
              key={field.key}
              label={t(field.labelKey)}
              value={(values[field.key] as BlendMode) ?? 'normal'}
              options={blendOptions}
              onChange={(value) => onChange(field.key, value)}
            />
          );
        }

        return (
          <Select
            key={field.key}
            label={t(field.labelKey)}
            value={String(values[field.key] ?? field.options[0].value)}
            options={field.options.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            onChange={(value) => onChange(field.key, value)}
          />
        );
      })}
    </div>
  );
}
