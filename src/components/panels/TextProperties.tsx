/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import styles from './Panels.module.css';
import Select from '../ui/Select';
import Slider from '../ui/Slider';
import IconButton from '../ui/IconButton';
import ColorPicker from '../ui/ColorPicker';
import { FONT_WEIGHTS, NORMAL_WEIGHT, nearestWeight } from '../../engine/fontWeights';
import { useEditorStore } from '../../store';
import type { Layer, TextData } from '../../types';
import { TEXT_ALIGNS } from '../../types/tools';
import { useFontOptions } from '../../hooks/useFontOptions';
import { useT } from '../../hooks/useT';

interface TextPropertiesProps {
  layer: Layer;
  data: TextData;
  onChange: (patch: Partial<TextData>) => void;
  onCommit: (label: string) => void;
}

const WEIGHT_OPTIONS = FONT_WEIGHTS.map((weight) => ({
  value: String(weight.value),
  label: weight.label,
}));

/** 图标按 TEXT_ALIGNS 的顺序对应，文案与顺序的唯一来源在 types/tools.ts */
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

/** 文字图层属性编辑器。所有改动即时重绘图层，松手时才写历史 */
export default function TextProperties({ data, onChange, onCommit }: TextPropertiesProps) {
  const t = useT();
  const fontOptions = useFontOptions();
  const applyTextColor = useEditorStore((state) => state.applyTextColor);

  return (
    <div className={styles.adjustBody}>
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t('text.content')}</span>
        <textarea
          className={styles.textarea}
          value={data.content}
          rows={3}
          onChange={(event) => onChange({ content: event.target.value })}
          onBlur={() => onCommit('action.editText')}
        />
      </label>

      <Select
        label={t('text.font')}
        value={data.fontFamily}
        options={fontOptions}
        onChange={(fontFamily) => {
          onChange({ fontFamily });
          onCommit('action.textFont');
        }}
      />

      <Select
        label={t('text.fontStyle')}
        value={String(nearestWeight(data.fontWeight ?? NORMAL_WEIGHT).value)}
        options={WEIGHT_OPTIONS}
        onChange={(value) => {
          onChange({ fontWeight: Number(value) });
          onCommit('action.textFontStyle');
        }}
      />

      <Slider
        label={t('text.fontSize')}
        min={6}
        max={400}
        value={data.fontSize}
        unit="px"
        onChange={(fontSize) => onChange({ fontSize })}
        onCommit={() => onCommit('action.textFontSize')}
      />

      <Slider
        label={t('text.lineHeight')}
        min={0.6}
        max={3}
        step={0.05}
        value={data.lineHeight}
        onChange={(lineHeight) => onChange({ lineHeight })}
        onCommit={() => onCommit('action.textLineHeight')}
      />

      <Slider
        label={t('text.letterSpacing')}
        min={-20}
        max={80}
        value={data.letterSpacing}
        unit="px"
        onChange={(letterSpacing) => onChange({ letterSpacing })}
        onCommit={() => onCommit('action.textLetterSpacing')}
      />

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('common.style')}</span>
        <div className={styles.actions}>
          <IconButton
            label={t('text.bold')}
            active={data.bold}
            onClick={() => {
              onChange({ bold: !data.bold });
              onCommit('action.textBold');
            }}
          >
            <Bold size={14} />
          </IconButton>
          <IconButton
            label={t('text.italic')}
            active={data.italic}
            onClick={() => {
              onChange({ italic: !data.italic });
              onCommit('action.textItalic');
            }}
          >
            <Italic size={14} />
          </IconButton>
          <IconButton
            label={t('text.underline')}
            active={data.underline}
            onClick={() => {
              onChange({ underline: !data.underline });
              onCommit('action.textUnderline');
            }}
          >
            <Underline size={14} />
          </IconButton>
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('text.align')}</span>
        <div className={styles.actions} role="radiogroup" aria-label={t('text.align')}>
          {TEXT_ALIGNS.map(({ value, labelKey }) => {
            const Icon = ALIGN_ICONS[value];
            return (
              <IconButton
                key={value}
                label={t(labelKey)}
                active={data.align === value}
                onClick={() => {
                  onChange({ align: value });
                  onCommit('action.textAlign');
                }}
              >
                <Icon size={14} />
              </IconButton>
            );
          })}
        </div>
      </div>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t('common.color')}</span>
        {/*
          走 applyTextColor 而不是 onChange：编辑中且选了字时只染选中那几个字。
          没在编辑时它内部会改整层基色并清掉颜色段，历史也由它写。
        */}
        <ColorPicker
          color={data.color}
          label={t('text.color')}
          keepTextEdit
          onChange={applyTextColor}
        />
      </div>
    </div>
  );
}
