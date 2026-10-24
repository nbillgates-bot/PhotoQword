/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useId } from 'react';
import styles from './ui.module.css';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** 填了就按它分组显示；相邻同名的归为一组 */
  group?: string;
  /** 置灰且不可选。给「列出来但用不了」的项用，例如本机没装的字体 */
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  label?: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
}

/** 按 group 字段切成连续的段；没有 group 的走单段，保持原有渲染 */
function toGroups<T extends string>(options: SelectOption<T>[]) {
  const groups: { name?: string; items: SelectOption<T>[] }[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.name === option.group) {
      last.items.push(option);
      continue;
    }
    groups.push({ name: option.group, items: [option] });
  }
  return groups;
}

export default function Select<T extends string>({
  label,
  value,
  options,
  onChange,
}: SelectProps<T>) {
  const id = useId();
  const groups = toGroups(options);

  return (
    <div className={styles.fieldRow}>
      {label ? (
        <label className={styles.labelInline} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <select
        id={id}
        className={styles.select}
        value={value}
        aria-label={label}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {groups.map((group) =>
          // 用原生 optgroup 而不是自绘分隔线：分组语义能被读屏软件识别，
          // 且各浏览器的下拉样式一致
          group.name ? (
            <optgroup key={group.name} label={group.name}>
              {group.items.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ) : (
            group.items.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))
          ),
        )}
      </select>
    </div>
  );
}
