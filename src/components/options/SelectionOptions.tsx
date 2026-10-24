/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Copy, Minus, Plus, SquareDashed } from 'lucide-react';
import styles from './Options.module.css';
import Slider from '../ui/Slider';
import Checkbox from '../ui/Checkbox';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Select from '../ui/Select';
import NumberInput from '../ui/NumberInput';
import { useEditorStore } from '../../store';
import type { SelectionMode, WandSampleSize } from '../../types/tools';
import { WAND_SAMPLE_SIZES } from '../../types/tools';
import type { ToolId } from '../../types';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

const MODES = [
  { value: 'new' as SelectionMode, icon: <SquareDashed size={13} />, title: 'selection.mode.new' },
  { value: 'add' as SelectionMode, icon: <Plus size={13} />, title: 'selection.mode.add' },
  { value: 'subtract' as SelectionMode, icon: <Minus size={13} />, title: 'selection.mode.subtract' },
  { value: 'intersect' as SelectionMode, icon: <Copy size={13} />, title: 'selection.mode.intersect' },
];

const MARQUEE_STYLES = [
  { value: 'normal', label: 'selection.style.normal' },
  { value: 'fixed-ratio', label: 'selection.style.fixedRatio' },
  { value: 'fixed-size', label: 'selection.style.fixedSize' },
];

/** 底部提示语的词条 key：按工具给出该工具的操作方式，与 PS 状态栏的提示同义 */
function hintKeyFor(tool: ToolId): string {
  if (tool === 'polygon-lasso') return 'options.polygonLasso.hint';
  if (tool === 'lasso') return 'options.lasso.hint';
  if (tool === 'wand') return 'options.wand.hint';
  return 'options.marquee.hint';
}

/**
 * 选区工具的选项栏。
 *
 * 控件顺序照搬 PS：运算方式 → 羽化 →（魔棒：取样大小、容差）→ 消除锯齿 →
 * （魔棒：连续、对所有图层取样）→（选框：样式及其参数）。
 * 顺序不是随手排的，PS 用户是靠位置找控件的，换位置等于让人重新学。
 */
export default function SelectionOptions({ tool }: { tool: ToolId }) {
  const t = useT();
  const options = useEditorStore((state) => state.toolOptions);
  const setToolOption = useEditorStore((state) => state.setToolOption);
  const selection = useEditorStore((state) => state.selection);
  const deselect = useEditorStore((state) => state.deselect);
  const selectAllPixels = useEditorStore((state) => state.selectAllPixels);
  const invertSelectionState = useEditorStore((state) => state.invertSelectionState);

  const isMarquee = tool === 'marquee-rect' || tool === 'marquee-ellipse';
  const isRect = tool === 'marquee-rect';
  const isWand = tool === 'wand';

  /*
   * 取样大小的选项文字带尺寸插值，所以在组件里现算，不做成模块常量。
   * 1 像素那档 PS 中文版叫「取样点」，其余是「3 x 3 平均」这种。
   */
  const sampleSizeOptions = WAND_SAMPLE_SIZES.map((size) => ({
    value: String(size),
    label: size === 1 ? t('selection.samplePoint') : t('selection.sampleAverage', { size }),
  }));
  const modes = MODES.map((mode) => ({ ...mode, title: t(mode.title) }));
  const marqueeStyles = useTranslatedOptions(MARQUEE_STYLES);

  return (
    <>
      <div className={styles.group}>
        <SegmentedControl
          ariaLabel={t('selection.modeLabel')}
          value={options.selectionMode}
          segments={modes}
          onChange={(value) => setToolOption('selectionMode', value)}
        />
      </div>

      {/* 羽化。PS 的魔棒选项栏没有这一项，它的羽化在「选择 > 修改 > 羽化」里 */}
      {!isWand && (
        <div className={styles.sliderCell}>
          <Slider
            label={t('selection.feather')}
            min={0}
            max={50}
            unit="px"
            value={options.featherRadius}
            onChange={(value) => setToolOption('featherRadius', value)}
          />
        </div>
      )}

      {isWand && (
        <>
          <div className={styles.group}>
            <label className={styles.label}>{t('selection.sampleSize')}</label>
            <Select
              value={String(options.wandSampleSize)}
              onChange={(value) => setToolOption('wandSampleSize', Number(value) as WandSampleSize)}
              options={sampleSizeOptions}
            />
          </div>
          <div className={styles.sliderCell}>
            <Slider
              label={t('options.tolerance')}
              min={0}
              max={100}
              value={options.wandTolerance}
              onChange={(value) => setToolOption('wandTolerance', value)}
            />
          </div>
        </>
      )}

      {/*
       * 消除锯齿是所有选区工具共用的开关。矩形选框上 PS 是置灰而不是隐藏——
       * 矩形边界必然落在整像素上，本来就没有锯齿可消。
       */}
      <Checkbox
        label={t('selection.antiAlias')}
        checked={options.selectionAntiAlias}
        disabled={isRect}
        onChange={(value) => setToolOption('selectionAntiAlias', value)}
      />

      {isWand && (
        <>
          <Checkbox
            label={t('options.contiguous')}
            checked={options.wandContiguous}
            onChange={(value) => setToolOption('wandContiguous', value)}
          />
          <Checkbox
            label={t('selection.sampleAllLayers')}
            checked={options.wandSampleAllLayers}
            onChange={(value) => setToolOption('wandSampleAllLayers', value)}
          />
        </>
      )}

      {isMarquee && (
        <div className={styles.group}>
          <label className={styles.label}>{t('common.style')}</label>
          <Select
            value={options.marqueeStyle}
            onChange={(value) =>
              setToolOption('marqueeStyle', value as 'normal' | 'fixed-ratio' | 'fixed-size')
            }
            options={marqueeStyles}
          />
        </div>
      )}

      {isMarquee && options.marqueeStyle === 'fixed-ratio' && (
        <div className={styles.group}>
          <NumberInput
            label={t('common.width')}
            value={options.marqueeRatioW}
            min={0.1}
            max={1000}
            step={0.1}
            onChange={(value) => setToolOption('marqueeRatioW', value)}
          />
          <NumberInput
            label={t('common.height')}
            value={options.marqueeRatioH}
            min={0.1}
            max={1000}
            step={0.1}
            onChange={(value) => setToolOption('marqueeRatioH', value)}
          />
        </div>
      )}

      {isMarquee && options.marqueeStyle === 'fixed-size' && (
        <div className={styles.group}>
          <NumberInput
            label={t('common.width')}
            value={options.marqueeSizeW}
            min={1}
            max={10000}
            unit="px"
            onChange={(value) => setToolOption('marqueeSizeW', value)}
          />
          <NumberInput
            label={t('common.height')}
            value={options.marqueeSizeH}
            min={1}
            max={10000}
            unit="px"
            onChange={(value) => setToolOption('marqueeSizeH', value)}
          />
        </div>
      )}

      <div className={styles.group}>
        <Button variant="ghost" onClick={selectAllPixels}>
          {t('menu.select.all')}
        </Button>
        <Button variant="ghost" onClick={invertSelectionState}>
          {t('menu.select.inverse')}
        </Button>
        <Button variant="ghost" disabled={!selection} onClick={deselect}>
          {t('menu.select.deselect')}
        </Button>
      </div>

      <span className={styles.hint}>
        {selection
          ? t('status.selection', { width: Math.round(selection.bounds.width), height: Math.round(selection.bounds.height) })
          : t(hintKeyFor(tool))}
      </span>
    </>
  );
}
