/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';
import styles from './colorPicker.module.css';
import IconButton from './IconButton';
import { parseSwatchFile } from '../../engine/swatchFile';
import { addCustomLibrary, type CustomLibrary } from '../../engine/customLibraries';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

interface SwatchImportProps {
  /** 当前选中的色库，是导入的才显示删除按钮 */
  current?: CustomLibrary;
  onImported: (library: CustomLibrary) => void;
  onRemoved: (id: string) => void;
}

/**
 * 导入 / 删除色库。
 *
 * 潘通等专有色库不能内置（色号与配方有知识产权，Adobe 自己也已经把潘通
 * 从 PS 里移除、改成单独订阅），所以走「用户导入自己的正版文件」这条路 ——
 * 这也是现在 PS 的实际工作方式。支持 .ase 与 .aco。
 *
 * 文件只在本地解析，不上传（规约 §7）。
 */
export default function SwatchImport({ current, onImported, onRemoved }: SwatchImportProps) {
  const t = useT();
  const showToast = useEditorStore((state) => state.showToast);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const { swatches, reasonKey } = parseSwatchFile(file.name, buffer);
      // showToast 收词条 key 而不是成品文字（I18N.md §3），切语言时旧提示才会跟着变
      if (reasonKey) {
        showToast(reasonKey, 'error');
        return;
      }

      const outcome = addCustomLibrary(file.name, swatches);
      if (outcome.reasonKey || !outcome.library) {
        showToast(outcome.reasonKey ?? 'swatch.empty', 'error');
        return;
      }

      onImported(outcome.library);
      showToast('swatch.imported', 'success', { count: outcome.library.colors!.length });
    } catch {
      // 读文件本身可能失败（权限、文件被删），不能让整个面板白屏（规约 §7）
      showToast('swatch.readFailed', 'error');
    }
  };

  return (
    <div className={styles.libraryActions}>
      {/*
        走隐藏的 file input + 按钮触发，而不是把 input 直接摆出来：
        原生 file input 的样式各浏览器差别很大，没法和其他控件统一
      */}
      <input
        ref={inputRef}
        type="file"
        accept=".ase,.aco"
        className={styles.hiddenFile}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // 清掉 value，否则再选同一个文件不触发 change
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      <button
        type="button"
        className={styles.importButton}
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={13} />
        {t('swatch.import')}
      </button>

      {current ? (
        <IconButton label={t('swatch.remove')} onClick={() => onRemoved(current.id)}>
          <Trash2 size={14} />
        </IconButton>
      ) : null}
    </div>
  );
}
