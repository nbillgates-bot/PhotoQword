/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useId } from 'react';
import styles from './ui.module.css';
import { useT } from '../../hooks/useT';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  /** 是否显示右侧数字输入框 */
  showInput?: boolean;
  onChange: (value: number) => void;
  /** 拖拽结束时触发，用于把连续调整合并成一条历史记录 */
  onCommit?: (value: number) => void;
}

export default function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  showInput = true,
  onChange,
  onCommit,
}: SliderProps) {
  const t = useT();
  const id = useId();

  return (
    <div className={styles.fieldRow}>
      <label className={styles.labelInline} htmlFor={id}>
        {label}
      </label>
      <div className={styles.sliderWrap}>
        <input
          id={id}
          type="range"
          className={styles.slider}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          onPointerUp={() => onCommit?.(value)}
          onKeyUp={() => onCommit?.(value)}
        />
        {showInput ? (
          <input
            type="number"
            className={styles.number}
            min={min}
            max={max}
            step={step}
            value={Math.round(value * 100) / 100}
            aria-label={t('slider.valueOf', { name: label })}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (!Number.isNaN(next)) onChange(Math.min(max, Math.max(min, next)));
            }}
            onBlur={() => onCommit?.(value)}
          />
        ) : (
          <span className={styles.unit}>
            {Math.round(value)}
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}
