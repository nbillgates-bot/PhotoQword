/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';
import styles from './Panels.module.css';
import type { Layer } from '../../types';
import { useT } from '../../hooks/useT';
import type { TranslateFn } from '../../i18n/translate';

interface LayerNameProps {
  layer: Layer;
  onRename: (name: string) => void;
}

/**
 * 图层类型的词条 key。直接复用过滤栏那套 layerType.*——
 * 同一个类型在两处必须叫同一个名字，另起一套迟早翻得不一样。
 * adjustment 过滤栏里没有，单独补一条。
 */
const TYPE_KEY: Record<Layer['type'], string> = {
  raster: 'layerType.raster',
  text: 'layerType.text',
  shape: 'layerType.shape',
  group: 'layerType.group',
  adjustment: 'layerType.adjustment',
};

/** 行高压到单行后类型和不透明度没地方放，收进 title 里 */
function tooltipFor(layer: Layer, t: TranslateFn): string {
  const parts = [
    layer.name,
    t(TYPE_KEY[layer.type]),
    t('layerTip.opacity', { value: Math.round(layer.opacity) }),
  ];
  if (layer.type === 'group' && layer.blendMode === 'pass-through') parts.push(t('blend.passThrough'));
  if (layer.mask) parts.push(t(layer.maskEnabled === false ? 'layerTip.maskOff' : 'layerAttr.masked'));
  return t('layerTip.wrap', { parts: parts.join(' · ') });
}

/** 图层名，双击进入重命名。Enter 提交，Esc 放弃 */
export default function LayerName({ layer, onRename }: LayerNameProps) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(layer.name);

  useEffect(() => setDraft(layer.name), [layer.name]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== layer.name) onRename(next);
    else setDraft(layer.name);
  };

  if (editing) {
    return (
      <input
        className={styles.nameInput}
        value={draft}
        autoFocus
        aria-label={t('layerTip.nameField')}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(layer.name);
            setEditing(false);
          }
        }}
        onClick={(event) => event.stopPropagation()}
      />
    );
  }

  return (
    <div
      className={styles.layerName}
      onDoubleClick={(event) => {
        event.stopPropagation();
        setEditing(true);
      }}
      title={tooltipFor(layer, t)}
    >
      {layer.name}
    </div>
  );
}
