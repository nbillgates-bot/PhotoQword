/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import uiStyles from './ui.module.css';
import ColorPickerDialog from './ColorPickerDialog';
import { useT } from '../../hooks/useT';
import { useTextFocusRestore } from '../../hooks/useTextColorSink';

interface ColorPickerProps {
  color: string;
  label: string;
  size?: number;
  /** 保留以兼容既有调用点；改成对话框后不再需要对齐方向 */
  alignRight?: boolean;
  /**
   * 是否在文字编辑期间保持编辑态。
   *
   * 文字编辑用的是真 textarea，点这个色块会让它 blur，而 blur 默认提交并退出编辑 ——
   * 于是"选中几个字再点颜色"永远走不通，颜色还没选编辑就结束了。
   * 打开这个开关会给色块和对话框都打上标记，TextEditor 见到标记就不退出。
   */
  keepTextEdit?: boolean;
  onChange: (color: string) => void;
}

/**
 * 颜色色块。点击打开 PS 风格的拾色器对话框。
 *
 * 之前这里直接渲染一个 absolute 定位的浮层，工具栏和属性面板都在
 * overflow 容器里，浮层会被裁掉（CLAUDE.md 3.4）。改成 Modal 之后
 * 不受容器裁剪影响，也顺带拿到了焦点管理和 Esc 关闭。
 */
export default function ColorPicker({
  color,
  label,
  size = 26,
  keepTextEdit,
  onChange,
}: ColorPickerProps) {
  const t = useT();
  const restoreTextFocus = useTextFocusRestore();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={uiStyles.swatch}
        style={{ width: size, height: size }}
        title={`${label}：${color}`}
        aria-label={t('color.pickerOf', { name: label, color })}
        aria-haspopup="dialog"
        // 标记要在 pointerdown 之前就在 DOM 上，对话框那时还没挂载，所以色块自己也得带
        data-keep-text-edit={keepTextEdit ? '' : undefined}
        onClick={() => setOpen(true)}
      >
        <span className={uiStyles.swatchFill} style={{ background: color }} />
      </button>

      {open ? (
        <ColorPickerDialog
          initial={color}
          title={label}
          keepTextEdit={keepTextEdit}
          onConfirm={(next) => {
            onChange(next);
            setOpen(false);
            // onChange 里的上色本身也会请求焦点，这里兜住「颜色没变」的情形
            if (keepTextEdit) restoreTextFocus();
          }}
          onCancel={() => {
            setOpen(false);
            if (keepTextEdit) restoreTextFocus();
          }}
        />
      ) : null}
    </>
  );
}
