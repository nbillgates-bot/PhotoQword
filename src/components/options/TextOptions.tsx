/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import styles from './Options.module.css';
import Select from '../ui/Select';
import IconButton from '../ui/IconButton';
import ColorPicker from '../ui/ColorPicker';
import { FONT_WEIGHTS, nearestWeight } from '../../engine/fontWeights';
import { colorAt } from '../../engine/textRuns';
import { useEditorStore } from '../../store';
import type { TextData } from '../../types';
import { TEXT_ALIGNS } from '../../types/tools';
import { useFontOptions } from '../../hooks/useFontOptions';
import { useT } from '../../hooks/useT';

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72, 96, 120, 144, 200, 288];
const SIZE_OPTIONS = FONT_SIZES.map((size) => ({ value: String(size), label: `${size} px` }));

const WEIGHT_OPTIONS = FONT_WEIGHTS.map((w) => ({ value: String(w.value), label: w.label }));

/** 图标按 TEXT_ALIGNS 的顺序对应，文案与顺序的唯一来源在 types/tools.ts */
const ALIGN_ICONS = { left: AlignLeft, center: AlignCenter, right: AlignRight } as const;

/**
 * 文字工具选项栏，模仿 PS 顶部工具栏布局。
 * 编辑当前选中的文字图层，没选中文字层则显示默认配置（用于下次新建）。
 */
export default function TextOptions() {
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const updateTextLayer = useEditorStore((state) => state.updateTextLayer);
  const toolOptions = useEditorStore((state) => state.toolOptions);
  const setToolOptions = useEditorStore((state) => state.setToolOption);
  const foreground = useEditorStore((state) => state.foreground);
  const pushHistory = useEditorStore((state) => state.pushHistory);
  const bumpRevision = useEditorStore((state) => state.bumpRevision);
  const applyTextColor = useEditorStore((state) => state.applyTextColor);
  const setForeground = useEditorStore((state) => state.setForeground);
  const textSelection = useEditorStore((state) => state.textSelection);
  const fontOptions = useFontOptions();
  const t = useT();

  const isTextLayer = activeLayer?.type === 'text' && activeLayer.textData;
  const data = isTextLayer
    ? activeLayer.textData!
    : {
        fontFamily: (toolOptions.textFontFamily as string) ?? 'Arial',
        fontSize: (toolOptions.textFontSize as number) ?? 48,
        fontWeight: (toolOptions.textFontWeight as number) ?? 400,
        bold: (toolOptions.textBold as boolean) ?? false,
        italic: (toolOptions.textItalic as boolean) ?? false,
        underline: (toolOptions.textUnderline as boolean) ?? false,
        align: (toolOptions.textAlign as TextData['align']) ?? 'left',
        color: foreground,
      };

  const handleChange = (patch: Partial<TextData>) => {
    if (isTextLayer) {
      updateTextLayer(activeLayer.id, patch);
      bumpRevision();
    } else {
      if (patch.fontFamily !== undefined) setToolOptions('textFontFamily', patch.fontFamily);
      if (patch.fontSize !== undefined) setToolOptions('textFontSize', patch.fontSize);
      if (patch.fontWeight !== undefined) setToolOptions('textFontWeight', patch.fontWeight);
      if (patch.bold !== undefined) setToolOptions('textBold', patch.bold);
      if (patch.italic !== undefined) setToolOptions('textItalic', patch.italic);
      if (patch.underline !== undefined) setToolOptions('textUnderline', patch.underline);
      if (patch.align !== undefined) setToolOptions('textAlign', patch.align);
    }
  };

  const commit = (label: string) => {
    // 只改了这一个文字图层的像素，点名免得历史去扫全部图层
    if (isTextLayer) pushHistory(label, { layerIds: [activeLayer.id] });
  };

  /*
   * 色块显示的是「光标/选区起点那个字」的颜色，不是整层基色。
   * 对齐 PS：把光标放在一个红字上，颜色块就显示红色。
   */
  const selectionColor = isTextLayer
    ? colorAt(activeLayer.textData!.colorRuns, textSelection?.start ?? 0, data.color)
    : data.color;

  const handleColorChange = (color: string) => {
    if (isTextLayer) {
      applyTextColor(color);
      return;
    }
    // 没有文字层时这个色块是「下次新建用的颜色」，即前景色
    setForeground(color);
  };

  return (
    <div className={styles.row}>
      <div className={styles.selectCell}>
        <Select
          label={t('text.font')}
          value={data.fontFamily}
          options={fontOptions}
          onChange={(fontFamily) => {
            handleChange({ fontFamily });
            commit('action.textFont');
          }}
        />
      </div>

      {/* PS 里字体样式下拉紧跟在字体家族右边，字号在它们之后 */}
      <div className={styles.selectCell}>
        <Select
          label={t('text.fontStyle')}
          value={String(nearestWeight(data.fontWeight ?? 400).value)}
          options={WEIGHT_OPTIONS}
          onChange={(value) => {
            handleChange({ fontWeight: Number(value) });
            commit('action.textFontStyle');
          }}
        />
      </div>

      <div className={styles.selectCell}>
        <Select
          label={t('text.fontSize')}
          value={String(data.fontSize)}
          options={SIZE_OPTIONS}
          onChange={(value) => {
            handleChange({ fontSize: Number(value) });
            commit('action.textFontSize');
          }}
        />
      </div>

      <div className={styles.iconGroup}>
        <IconButton
          label={t('text.bold')}
          active={data.bold}
          onClick={() => {
            handleChange({ bold: !data.bold });
            commit('action.textBold');
          }}
        >
          <Bold size={14} />
        </IconButton>
        <IconButton
          label={t('text.italic')}
          active={data.italic}
          onClick={() => {
            handleChange({ italic: !data.italic });
            commit('action.textItalic');
          }}
        >
          <Italic size={14} />
        </IconButton>
        <IconButton
          label={t('text.underline')}
          active={data.underline}
          onClick={() => {
            handleChange({ underline: !data.underline });
            commit('action.textUnderline');
          }}
        >
          <Underline size={14} />
        </IconButton>
      </div>

      <div className={styles.iconGroup} role="radiogroup" aria-label={t('text.align')}>
        {TEXT_ALIGNS.map(({ value, labelKey }) => {
          const Icon = ALIGN_ICONS[value];
          return (
            <IconButton
              key={value}
              label={t(labelKey)}
              active={data.align === value}
              onClick={() => {
                handleChange({ align: value });
                commit('action.textAlign');
              }}
            >
              <Icon size={14} />
            </IconButton>
          );
        })}
      </div>

      {/*
        颜色走 applyTextColor 而不是 handleChange：编辑中且选了字时只染那几个字，
        没在编辑才改整层基色。keepTextEdit 让点色块不打断编辑。
      */}
      <ColorPicker
        color={selectionColor}
        label={t('text.color')}
        keepTextEdit
        onChange={handleColorChange}
      />
    </div>
  );
}
