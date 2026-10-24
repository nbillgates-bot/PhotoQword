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
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

type Format = 'png' | 'jpeg' | 'webp';

const FORMATS = [
  { value: 'png' as Format, label: 'export.png' },
  { value: 'jpeg' as Format, label: 'export.jpeg' },
  { value: 'webp' as Format, label: 'export.webp' },
];

interface ExportDialogProps {
  onExport: (format: Format, quality: number) => void;
}

/** 导出对话框。质量仅对 JPEG / WebP 生效 */
export default function ExportDialog({ onExport }: ExportDialogProps) {
  const t = useT();
  const formats = useTranslatedOptions(FORMATS);
  const doc = useEditorStore((state) => state.doc);
  const closeDialog = useEditorStore((state) => state.closeDialog);

  const [format, setFormat] = useState<Format>('png');
  const [quality, setQuality] = useState(92);

  const submit = () => {
    onExport(format, quality);
    closeDialog();
  };

  return (
    <Modal
      title={t('export.title')}
      onClose={closeDialog}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('common.export')}
          </Button>
          <Button onClick={closeDialog}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <Select label={t('saveAs.format')} value={format} options={formats} onChange={setFormat} />

        {format !== 'png' && (
          <Slider label={t('saveAs.quality')} min={10} max={100} value={quality} unit="%" onChange={setQuality} />
        )}

        <p className={styles.hint}>
          {t('export.hint', { width: doc?.width ?? 0, height: doc?.height ?? 0 })}
        </p>
      </div>
    </Modal>
  );
}
