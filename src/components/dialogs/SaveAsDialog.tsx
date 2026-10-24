/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import styles from './Dialogs.module.css';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Slider from '../ui/Slider';
import { useEditorStore } from '../../store';
import { FORMATS, formatById, type FormatId } from '../../engine/formats/registry';
import { buildSaveName, cleanBaseName } from '../../engine/formats/saveNaming';
import { useT } from '../../hooks/useT';

interface SaveAsDialogProps {
  onSave: (formatId: FormatId, fileName: string, quality: number) => void;
}

/**
 * 「存储为」对话框，只在浏览器没有 showSaveFilePicker 时出现
 * （Firefox / Safari）。支持的浏览器上弹的是系统原生文件框，走不到这里。
 *
 * 只问文件名和格式，不问目录 —— 目录由浏览器的下载设置决定，网页无权干预。
 * 这是 PS 的存储为在浏览器里能做到的最接近的形态。
 */
export default function SaveAsDialog({ onSave }: SaveAsDialogProps) {
  const t = useT();
  const doc = useEditorStore((state) => state.doc);
  const saveTarget = useEditorStore((state) => state.saveTarget);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const suggested = useEditorStore((state) => state.dialogPayload);

  const [name, setName] = useState(
    cleanBaseName(
      typeof suggested === 'string' ? suggested : (doc?.name ?? t('doc.untitled')),
      t('doc.untitled'),
    ),
  );
  const [formatId, setFormatId] = useState<FormatId>(saveTarget?.formatId ?? 'psd');
  const [quality, setQuality] = useState(saveTarget?.quality ?? 92);

  const format = formatById(formatId);
  const size = doc ?? { width: 1, height: 1 };
  const fileName = buildSaveName(name, format, size);

  const submit = () => {
    if (!doc) return;
    onSave(formatId, fileName, quality);
    closeDialog();
  };

  return (
    <Modal
      title={t('menu.file.saveAs')}
      width={420}
      onClose={closeDialog}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('shortcuts.file.save')}
          </Button>
          <Button onClick={closeDialog}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>{t('saveAs.fileName')}</span>
          <input
            className={styles.input}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
          />
        </label>

        <Select
          label={t('saveAs.format')}
          value={formatId}
          options={FORMATS.map((item) => ({ value: item.id, label: t(item.labelKey) }))}
          onChange={(value) => setFormatId(value as FormatId)}
        />

        {format.hasQuality ? (
          <Slider
            label={t('saveAs.quality')}
            min={10}
            max={100}
            value={quality}
            unit="%"
            onChange={setQuality}
          />
        ) : null}

        {/*
          文件名要加粗，但整句必须是**一条**词条 —— 拆成前后两半再拼，
          语序不同的语言就拼不对（I18N.md §1.3）。
          做法是先用哨兵占位翻译整句，再按哨兵切开，把 <strong> 塞进中间。
        */}
        <p className={styles.hint}>
          {(() => {
            // 哨兵取 U+0000：正常文案里绝不会出现。
            // 用空格当哨兵会被英文句子本来就有的空格切错
            const SENTINEL = '\u0000';
            const parts = t('saveAs.willSave', { name: SENTINEL }).split(SENTINEL);
            return (
              <>
                {parts[0]}
                <strong>{fileName}</strong>
                {parts[1] ?? ''}
              </>
            );
          })()}{' '}
          {format.layered ? t('saveAs.keepsLayers') : t('saveAs.flattens')}
        </p>
        <p className={styles.hint}>{t('saveAs.downloadOnlyHint')}</p>
      </div>
    </Modal>
  );
}
