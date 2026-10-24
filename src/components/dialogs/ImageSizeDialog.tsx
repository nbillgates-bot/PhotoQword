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
import NumberInput from '../ui/NumberInput';
import Checkbox from '../ui/Checkbox';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

/** 图像大小：会缩放全部图层像素 */
export default function ImageSizeDialog() {
  const t = useT();
  const doc = useEditorStore((state) => state.doc);
  const resizeImage = useEditorStore((state) => state.resizeImage);
  const closeDialog = useEditorStore((state) => state.closeDialog);

  const [width, setWidth] = useState(doc?.width ?? 0);
  const [height, setHeight] = useState(doc?.height ?? 0);
  const [locked, setLocked] = useState(true);

  if (!doc) return null;
  const ratio = doc.width / doc.height;

  const changeWidth = (value: number) => {
    setWidth(value);
    if (locked) setHeight(Math.max(1, Math.round(value / ratio)));
  };

  const changeHeight = (value: number) => {
    setHeight(value);
    if (locked) setWidth(Math.max(1, Math.round(value * ratio)));
  };

  const submit = () => {
    resizeImage(width, height);
    closeDialog();
  };

  return (
    <Modal
      title={t('menu.image.size')}
      onClose={closeDialog}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('common.ok')}
          </Button>
          <Button onClick={closeDialog}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <div className={styles.row}>
          <NumberInput
            label={t('common.width')}
            value={width}
            min={1}
            max={8000}
            unit="px"
            onChange={changeWidth}
          />
          <NumberInput
            label={t('common.height')}
            value={height}
            min={1}
            max={8000}
            unit="px"
            onChange={changeHeight}
          />
        </div>
        <Checkbox label={t('imageSize.lockRatio')} checked={locked} onChange={setLocked} />
        <p className={styles.hint}>
          {t('imageSize.hint', { width: doc.width, height: doc.height })}
        </p>
      </div>
    </Modal>
  );
}
