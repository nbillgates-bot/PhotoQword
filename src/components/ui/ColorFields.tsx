/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './colorPicker.module.css';
import type { HSV, RGB } from '../../engine/color';
import { useT } from '../../hooks/useT';

interface ColorFieldsProps {
  hsv: HSV;
  rgb: RGB;
  hex: string;
  onHsvChange: (patch: Partial<HSV>) => void;
  onRgbChange: (patch: Partial<RGB>) => void;
  onHexChange: (hex: string) => void;
}

/** 一行数值输入。数据定义 + 通用渲染，避免堆六个几乎一样的 JSX 块 */
interface FieldDef {
  key: string;
  label: string;
  suffix?: string;
  max: number;
  value: number;
  onChange: (value: number) => void;
}

export default function ColorFields({
  hsv,
  rgb,
  hex,
  onHsvChange,
  onRgbChange,
  onHexChange,
}: ColorFieldsProps) {
  const t = useT();
  // HSB 与 RGB 各三行，用数据驱动渲染
  const fields: FieldDef[] = [
    { key: 'h', label: 'H', suffix: '°', max: 359, value: Math.round(hsv.h), onChange: (h) => onHsvChange({ h }) },
    { key: 's', label: 'S', suffix: '%', max: 100, value: Math.round(hsv.s * 100), onChange: (s) => onHsvChange({ s: s / 100 }) },
    { key: 'b', label: 'B', suffix: '%', max: 100, value: Math.round(hsv.v * 100), onChange: (v) => onHsvChange({ v: v / 100 }) },
    { key: 'r', label: 'R', max: 255, value: rgb.r, onChange: (r) => onRgbChange({ r }) },
    { key: 'g', label: 'G', max: 255, value: rgb.g, onChange: (g) => onRgbChange({ g }) },
    { key: 'bl', label: 'B', max: 255, value: rgb.b, onChange: (b) => onRgbChange({ b }) },
  ];

  const commitHex = (value: string) => {
    const normalized = value.startsWith('#') ? value : `#${value}`;
    // 只接受合法值，非法输入让 React 重渲染回原值
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized)) onHexChange(normalized.toLowerCase());
  };

  return (
    <div className={styles.fields}>
      {fields.map((field, index) => (
        <label
          key={field.key}
          className={`${styles.field} ${index === 3 ? styles.fieldGap : ''}`}
        >
          <span className={styles.fieldLabel}>{field.label}</span>
          <input
            type="number"
            className={styles.fieldInput}
            min={0}
            max={field.max}
            value={field.value}
            aria-label={t('color.channelOf', { name: field.label })}
            onChange={(event) => {
              const next = Number(event.target.value);
              if (Number.isFinite(next)) field.onChange(Math.min(field.max, Math.max(0, next)));
            }}
          />
          {field.suffix ? <span className={styles.fieldSuffix}>{field.suffix}</span> : null}
        </label>
      ))}

      <label className={`${styles.field} ${styles.fieldGap}`}>
        <span className={styles.fieldLabel}>#</span>
        <input
          className={styles.fieldInput}
          value={hex.replace('#', '')}
          aria-label={t('color.hex')}
          onChange={(event) => commitHex(event.target.value)}
        />
      </label>
    </div>
  );
}
