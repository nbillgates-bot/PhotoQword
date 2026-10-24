/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ReactNode } from 'react';
import styles from './ui.module.css';

export interface Segment<T extends string> {
  value: T;
  label?: string;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  segments: Segment<T>[];
  ariaLabel: string;
  onChange: (value: T) => void;
}

export default function SegmentedControl<T extends string>({
  value,
  segments,
  ariaLabel,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={ariaLabel}>
      {segments.map((segment) => (
        <button
          key={segment.value}
          type="button"
          role="radio"
          aria-checked={value === segment.value}
          title={segment.title ?? segment.label}
          className={[styles.segment, value === segment.value ? styles.segmentActive : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(segment.value)}
        >
          {segment.icon}
          {segment.label}
        </button>
      ))}
    </div>
  );
}
