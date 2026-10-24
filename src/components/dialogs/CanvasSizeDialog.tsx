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
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

/**
 * 九宫格锚点。字符串里同时含纵横关键字，
 * docSlice 的 anchorOffset 用 includes 判断，所以顺序无关。
 */
const ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
];

/** 九个锚点的词条 key。渲染时 t() 一遍 */
const ANCHOR_LABEL_KEY: Record<string, string> = {
  'top-left': 'anchor.topLeft',
  'top-center': 'anchor.topCenter',
  'top-right': 'anchor.topRight',
  'middle-left': 'anchor.middleLeft',
  'middle-center': 'anchor.middleCenter',
  'middle-right': 'anchor.middleRight',
  'bottom-left': 'anchor.bottomLeft',
  'bottom-center': 'anchor.bottomCenter',
  'bottom-right': 'anchor.bottomRight',
};

/** 画布大小：只改画布范围，不缩放像素 */
export default function CanvasSizeDialog() {
  const t = useT();
  const doc = useEditorStore((state) => state.doc);
  const resizeCanvasTo = useEditorStore((state) => state.resizeCanvasTo);
  const closeDialog = useEditorStore((state) => state.closeDialog);

  const [width, setWidth] = useState(doc?.width ?? 0);
  const [height, setHeight] = useState(doc?.height ?? 0);
  const [anchor, setAnchor] = useState('middle-center');

  if (!doc) return null;

  const submit = () => {
    resizeCanvasTo(width, height, anchor);
    closeDialog();
  };

  return (
    <Modal
      title={t('menu.image.canvasSize')}
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
          <NumberInput label={t('common.width')} value={width} min={1} max={8000} unit="px" onChange={setWidth} />
          <NumberInput
            label={t('common.height')}
            value={height}
            min={1}
            max={8000}
            unit="px"
            onChange={setHeight}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('canvasSize.anchor')}</span>
          <div className={styles.anchorGrid} role="radiogroup" aria-label={t('canvasSize.anchor')}>
            {ANCHORS.map((item) => (
              <button
                type="button"
                key={item}
                role="radio"
                aria-checked={anchor === item}
                aria-label={t(ANCHOR_LABEL_KEY[item])}
                title={t(ANCHOR_LABEL_KEY[item])}
                className={`${styles.anchorCell} ${anchor === item ? styles.anchorActive : ''}`}
                onClick={() => setAnchor(item)}
              >
                ·
              </button>
            ))}
          </div>
        </div>

        <p className={styles.hint}>
          {t('canvasSize.hint', { width: doc.width, height: doc.height })}
        </p>
      </div>
    </Modal>
  );
}
