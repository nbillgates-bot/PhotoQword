/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useId } from 'react';
import styles from './ui.module.css';

interface NumberInputProps {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export default function NumberInput({
  label,
  value,
  min = 1,
  max = 100000,
  step = 1,
  unit,
  onChange,
}: NumberInputProps) {
  const id = useId();

  return (
    <div className={styles.fieldRow}>
      {label ? (
        <label className={styles.labelInline} htmlFor={id}>
          {label}
        </label>
      ) : null}
      <input
        id={id}
        type="number"
        className={styles.number}
        value={value}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (!Number.isNaN(next)) onChange(next);
        }}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isNaN(next)) return;
          onChange(Math.min(max, Math.max(min, next)));
        }}
      />
      {unit ? <span className={styles.unit}>{unit}</span> : null}
    </div>
  );
}
