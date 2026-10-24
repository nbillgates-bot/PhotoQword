/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import styles from './colorPicker.module.css';
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from '../../engine/color';
import { clamp } from '../../engine/canvasUtils';
import SvField from './SvField';
import ColorFields from './ColorFields';
import ColorLibraryPanel from './ColorLibraryPanel';
import { useT } from '../../hooks/useT';

/** 常用色板 */
const PRESETS = [
  '#000000', '#404040', '#808080', '#c0c0c0', '#ffffff',
  '#ff5252', '#ff9800', '#ffeb3b', '#66bb6a', '#26c6da',
  '#4a9eff', '#5c6bc0', '#ab47bc', '#ec407a', '#8d6e63',
  '#1b5e20', '#0d47a1', '#4a148c', '#b71c1c', '#e65100',
];

interface ColorPickerDialogProps {
  /** 打开时的颜色，作为"当前颜色"参照 */
  initial: string;
  title?: string;
  /** 见 ColorPicker 同名 prop：文字编辑期间不打断编辑 */
  keepTextEdit?: boolean;
  onConfirm: (color: string) => void;
  onCancel: () => void;
}

/**
 * PS 风格的拾色器对话框。
 *
 * 之前是个 absolute 定位的小浮层，在 overflow 容器里会被裁掉
 * （CLAUDE.md 3.4 记的坑），而且缺少数值输入和确定/取消。
 * 改成走 Modal：不会被裁、有焦点管理、Esc 可关，并补上
 * HSB/RGB 数值输入与"当前色 / 新颜色"对比色块。
 */
export default function ColorPickerDialog({
  initial,
  title,
  keepTextEdit,
  onConfirm,
  onCancel,
}: ColorPickerDialogProps) {
  const t = useT();
  const [color, setColor] = useState(initial);
  // PS 的拾色器与颜色库是两个视图互相切换，不是同屏并列
  const [showLibrary, setShowLibrary] = useState(false);
  const hsv = rgbToHsv(hexToRgb(color));
  const rgb = hexToRgb(color);

  const setHsv = (patch: Partial<typeof hsv>) =>
    setColor(rgbToHex(hsvToRgb({ ...hsv, ...patch })));

  const setRgb = (patch: Partial<typeof rgb>) => setColor(rgbToHex({ ...rgb, ...patch }));

  return (
    <Modal
      // 调用方没给标题时用默认的「拾色器」，与 PS 的窗口标题一致
      title={title ?? t('color.pickerTitle')}
      width={440}
      keepTextEdit={keepTextEdit}
      onClose={onCancel}
      footer={
        <>
          {/* PS 里这个按钮在拾色器和颜色库两个视图之间来回切 */}
          <Button variant="ghost" onClick={() => setShowLibrary((previous) => !previous)}>
            {showLibrary ? t('color.pickerTitle') : t('colorLib.title')}
          </Button>
          <span className={styles.footerSpacer} />
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={() => onConfirm(color)}>
            {t('common.ok')}
          </Button>
        </>
      }
    >
      {showLibrary ? (
        <ColorLibraryPanel value={color} onPick={setColor} />
      ) : (
        <>
          <div className={styles.dialogBody}>
            <SvField
              hue={hsv.h}
              saturation={hsv.s}
              value={hsv.v}
              onChange={(s, v) => setHsv({ s, v })}
            />

            <input
              type="range"
              className={styles.hueVertical}
              min={0}
              max={359}
              value={Math.round(hsv.h)}
              aria-label={t('color.hue')}
              onChange={(event) => setHsv({ h: Number(event.target.value) })}
            />

            <div className={styles.dialogSide}>
              {/* 当前色 / 新颜色对比，PS 里靠这个判断改动幅度 */}
              <div className={styles.compare}>
                <span className={styles.compareLabel}>{t('color.new')}</span>
                <span className={styles.compareChip} style={{ background: color }} />
                <span className={styles.compareChip} style={{ background: initial }} />
                <span className={styles.compareLabel}>{t('color.current')}</span>
              </div>

              <ColorFields
                hsv={hsv}
                rgb={rgb}
                hex={color}
                onHsvChange={setHsv}
                onRgbChange={setRgb}
                onHexChange={setColor}
              />
            </div>
          </div>

          <div className={styles.presets}>
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={styles.preset}
                style={{ background: preset }}
                title={preset}
                aria-label={preset}
                onClick={() => setColor(preset)}
              />
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/** 供外部复用的取值钳制，避免各处重复写 clamp 逻辑 */
export function clampChannel(value: number): number {
  return Math.round(clamp(value, 0, 255));
}
