/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useRef, useEffect } from 'react';
import styles from './Options.module.css';
import gradientStyles from './GradientOptions.module.css';
import Slider from '../ui/Slider';
import Checkbox from '../ui/Checkbox';
import Select from '../ui/Select';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import type { GradientKind, CanvasBlendMode } from '../../types/tools';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

const GRADIENT_KINDS: Array<{ value: GradientKind; label: string; icon: string }> = [
  { value: 'linear', label: 'gradient.kind.linear', icon: '━' },
  { value: 'radial', label: 'gradient.kind.radial', icon: '◉' },
  { value: 'angle', label: 'gradient.kind.angle', icon: '⟲' },
  { value: 'reflected', label: 'gradient.kind.reflected', icon: '⇄' },
  { value: 'diamond', label: 'gradient.kind.diamond', icon: '◇' },
];

/*
 * 渐变的混合模式。词条直接复用图层混合模式那套 blend.*——
 * 同一个混合模式在两处必须叫同一个名字，另起一套词条迟早会翻得不一样。
 * 值用的是 canvas 的 globalCompositeOperation 名，与图层那边的 BlendMode 不同，
 * 所以选项表还得单独一份，只是文案共用。
 */
const BLEND_MODES: Array<{ value: CanvasBlendMode; label: string }> = [
  { value: 'source-over', label: 'blend.normal' },
  { value: 'multiply', label: 'blend.multiply' },
  { value: 'screen', label: 'blend.screen' },
  { value: 'overlay', label: 'blend.overlay' },
  { value: 'soft-light', label: 'blend.softLight' },
  { value: 'hard-light', label: 'blend.hardLight' },
  { value: 'color-dodge', label: 'blend.colorDodge' },
  { value: 'color-burn', label: 'blend.colorBurn' },
  { value: 'darken', label: 'blend.darken' },
  { value: 'lighten', label: 'blend.lighten' },
  { value: 'difference', label: 'blend.difference' },
  { value: 'exclusion', label: 'blend.exclusion' },
];

/** 渐变预览条：显示当前前景色到背景色的渐变 */
function GradientPreview({ from, to, reverse }: { from: string; to: string; reverse: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const t = useT();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, reverse ? to : from);
    gradient.addColorStop(1, reverse ? from : to);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, [from, to, reverse]);

  return (
    <canvas
      ref={canvasRef}
      className={gradientStyles.preview}
      width={100}
      height={24}
      title={t('gradient.preview')}
    />
  );
}

/** 渐变工具选项栏，模仿 PS 1:1 */
export default function GradientOptionsEnhanced() {
  const t = useT();
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);
  const foreground = useEditorStore((state) => state.foreground);
  const background = useEditorStore((state) => state.background);
  const blendOptions = useTranslatedOptions(BLEND_MODES);

  return (
    <div className={styles.row}>
      <GradientPreview from={foreground} to={background} reverse={options.gradientReverse} />

      <div className={gradientStyles.kindPicker} role="radiogroup" aria-label={t('gradient.kindLabel')}>
        {GRADIENT_KINDS.map(({ value, label, icon }) => (
          <IconButton
            key={value}
            label={t(label)}
            active={options.gradientKind === value}
            onClick={() => setToolOption('gradientKind', value)}
          >
            <span className={gradientStyles.kindIcon}>{icon}</span>
          </IconButton>
        ))}
      </div>

      <div className={styles.selectCell}>
        <Select
          label={t('common.mode')}
          value={options.gradientMode}
          options={blendOptions}
          onChange={(value) => setToolOption('gradientMode', value as CanvasBlendMode)}
        />
      </div>

      <div className={styles.sliderCell}>
        <Slider
          label={t('common.opacity')}
          min={1}
          max={100}
          value={options.gradientOpacity}
          onChange={(value) => setToolOption('gradientOpacity', value)}
          unit="%"
        />
      </div>

      <Checkbox
        label={t('options.reverse')}
        checked={options.gradientReverse}
        onChange={(value) => setToolOption('gradientReverse', value)}
      />

      <span className={styles.hint}>{t('gradient.hint')}</span>
    </div>
  );
}
