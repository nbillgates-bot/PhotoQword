/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import Select from '../ui/Select';
import IconButton from '../ui/IconButton';
import { BLEND_MODES, LAYER_COLORS } from '../../types';
import type { LayerFilter } from '../../engine/layerFilter';
import { FILTER_ATTRIBUTES, FILTER_TYPES } from './layerFilterDefs';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

interface LayerFilterValueProps {
  filter: LayerFilter;
  onChange: (patch: Partial<LayerFilter>) => void;
}

/*
 * 颜色下拉的 value 用词条 key，不用显示文字。
 * undefined 进不了 <select> 的 value，得挑个字符串来代表「无」；
 * 用显示文字的话切一次语言 value 就全变了，选中项会对不上。
 */
const COLOR_OPTIONS = LAYER_COLORS.map((entry) => ({
  value: entry.label,
  label: entry.label,
}));

/**
 * 过滤条件控件。按 kind 分派，与 PS 一致：
 * 类型 → 一排图标开关，名称 → 文本框，模式/颜色/属性 → 下拉。
 */
export default function LayerFilterValue({ filter, onChange }: LayerFilterValueProps) {
  const t = useT();
  const blendOptions = useTranslatedOptions(BLEND_MODES);
  const attrOptions = useTranslatedOptions(FILTER_ATTRIBUTES);
  const colorOptions = useTranslatedOptions(COLOR_OPTIONS);

  switch (filter.kind) {
    case 'type':
      return (
        <div className={styles.filterTypes} role="group" aria-label={t('panel.filterByType')}>
          {FILTER_TYPES.map(({ value, label, Icon }) => {
            const on = filter.types.includes(value);
            return (
              <IconButton
                key={value}
                label={t(label)}
                className={styles.filterTypeButton}
                active={on}
                onClick={() =>
                  onChange({
                    // 多选开关：勾上的类型取并集，一个都不勾等于不限
                    types: on
                      ? filter.types.filter((item) => item !== value)
                      : [...filter.types, value],
                  })
                }
              >
                <Icon size={13} />
              </IconButton>
            );
          })}
        </div>
      );

    case 'name':
      return (
        <input
          type="text"
          className={styles.filterInput}
          value={filter.name}
          placeholder={t('panel.filterNamePlaceholder')}
          aria-label={t('panel.filterByName')}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      );

    case 'mode':
      return (
        <Select value={filter.mode} options={blendOptions} onChange={(mode) => onChange({ mode })} />
      );

    case 'color':
      return (
        <Select
          value={LAYER_COLORS.find((entry) => entry.value === filter.color)?.label ?? 'layerColor.none'}
          options={colorOptions}
          onChange={(key) =>
            onChange({ color: LAYER_COLORS.find((entry) => entry.label === key)?.value })
          }
        />
      );

    case 'attribute':
      return (
        <Select
          value={filter.attribute}
          options={attrOptions}
          onChange={(attribute) => onChange({ attribute })}
        />
      );

    default:
      return null;
  }
}
