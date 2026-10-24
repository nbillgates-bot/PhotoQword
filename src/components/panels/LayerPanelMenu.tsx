/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import { Menu } from 'lucide-react';
import styles from './Panels.module.css';
import IconButton from '../ui/IconButton';
import ContextMenu, { type ContextMenuItem } from '../ui/ContextMenu';
import { useEditorStore } from '../../store';
import { THUMB_SIZE_OPTIONS } from '../../engine/thumbSize';
import { useT } from '../../hooks/useT';

/**
 * 图层面板右上角的面板菜单（PS 里那个 ☰）。
 *
 * PS 的「面板选项…」是一个对话框，里面是缩览图大小的单选 + 缩览图内容。
 * 这里做成菜单里直接勾选：项目、用词、取值都和那个对话框一致，
 * 少一次开关对话框的往返，选项本身没有任何增减。
 */
export default function LayerPanelMenu() {
  const t = useT();
  const size = useEditorStore((state) => state.layerThumbSize);
  const clip = useEditorStore((state) => state.layerThumbClip);
  const setSize = useEditorStore((state) => state.setLayerThumbSize);
  const setClip = useEditorStore((state) => state.setLayerThumbClip);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  const items: ContextMenuItem[] = [
    { id: 'size-title', label: t('panelMenu.thumbSize'), heading: true },
    ...THUMB_SIZE_OPTIONS.map((option) => ({
      id: `size-${option.value}`,
      label: option.label,
      checked: size === option.value,
      run: () => setSize(option.value),
    })),
    { id: 's1', separator: true },
    { id: 'clip-title', label: t('panelMenu.thumbContent'), heading: true },
    {
      id: 'clip-bounds',
      label: t('panelMenu.layerBounds'),
      checked: clip === 'bounds',
      run: () => setClip('bounds'),
    },
    {
      id: 'clip-document',
      label: t('panelMenu.wholeDoc'),
      checked: clip === 'document',
      run: () => setClip('document'),
    },
  ];

  return (
    <>
      <IconButton
        label={t('panelMenu.options')}
        className={styles.panelMenuButton}
        onClick={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          // 菜单挂在按钮左下角，与 PS 的面板菜单落点一致
          setAt({ x: box.left, y: box.bottom });
        }}
      >
        <Menu size={13} />
      </IconButton>
      {at ? (
        <ContextMenu items={items} x={at.x} y={at.y} onClose={() => setAt(null)} />
      ) : null}
    </>
  );
}
