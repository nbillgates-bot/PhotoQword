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
import Select from '../ui/Select';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

type Background = 'white' | 'transparent' | 'black';

/**
 * 预设清单。labelKey 是词条 key，尺寸数字不进词条表——
 * 「1920×1080」在任何语言里都是这么写，翻译它只会带来两份要同步的真值。
 */
const PRESETS = [
  { labelKey: 'newDoc.preset.custom', width: 0, height: 0 },
  { labelKey: 'newDoc.preset.1080p', width: 1920, height: 1080 },
  { labelKey: 'newDoc.preset.4k', width: 3840, height: 2160 },
  { labelKey: 'newDoc.preset.square', width: 1080, height: 1080 },
  { labelKey: 'newDoc.preset.story', width: 1080, height: 1920 },
  { labelKey: 'newDoc.preset.a4', width: 2480, height: 3508 },
  { labelKey: 'newDoc.preset.cover', width: 1200, height: 630 },
];

const BACKGROUNDS: { value: Background; labelKey: string }[] = [
  { value: 'white', labelKey: 'newDoc.bg.white' },
  { value: 'transparent', labelKey: 'newDoc.bg.transparent' },
  { value: 'black', labelKey: 'newDoc.bg.black' },
];

/** 新建文档对话框 */
export default function NewDocDialog() {
  const createDoc = useEditorStore((state) => state.createDoc);
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const t = useT();

  // 未命名是文档名（用户数据），按打开对话框那一刻的语言取值
  const [name, setName] = useState(() => t('doc.untitled'));
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [resolution, setResolution] = useState(72);
  const [background, setBackground] = useState<Background>('white');
  // 存 key 而不是显示文本，切语言时选中项不会因为文本变了而丢
  const [presetKey, setPresetKey] = useState(PRESETS[0].labelKey);

  const submit = () => {
    createDoc({
      name: name.trim() || t('doc.untitled'),
      width,
      height,
      background,
      resolution,
    });
    closeDialog();
  };

  const applyPreset = (key: string) => {
    setPresetKey(key);
    const found = PRESETS.find((item) => item.labelKey === key);
    if (found && found.width > 0) {
      setWidth(found.width);
      setHeight(found.height);
    }
  };

  return (
    <Modal
      title={t('newDoc.title')}
      onClose={closeDialog}
      footer={
        <>
          <Button variant="primary" onClick={submit}>
            {t('newDoc.create')}
          </Button>
          <Button onClick={closeDialog}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>{t('newDoc.name')}</span>
          <input
            className={styles.input}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <Select
          label={t('newDoc.preset')}
          value={presetKey}
          options={PRESETS.map((item) => ({ value: item.labelKey, label: t(item.labelKey) }))}
          onChange={applyPreset}
        />

        <div className={styles.row}>
          <NumberInput
            label={t('common.width')}
            value={width}
            min={1}
            max={8000}
            unit="px"
            onChange={setWidth}
          />
          <NumberInput
            label={t('common.height')}
            value={height}
            min={1}
            max={8000}
            unit="px"
            onChange={setHeight}
          />
        </div>

        <div className={styles.row}>
          <NumberInput
            label={t('newDoc.resolution')}
            value={resolution}
            min={1}
            max={600}
            unit="DPI"
            onChange={setResolution}
          />
          <Select
            label={t('newDoc.background')}
            value={background}
            options={BACKGROUNDS.map((item) => ({ value: item.value, label: t(item.labelKey) }))}
            onChange={setBackground}
          />
        </div>
      </div>
    </Modal>
  );
}
