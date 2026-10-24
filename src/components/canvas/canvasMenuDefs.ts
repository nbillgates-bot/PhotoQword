/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ContextMenuItem } from '../ui/ContextMenu';
import type { EditorStore } from '../../store';
import type { Layer } from '../../types';
import type { TranslateFn } from '../../i18n/translate';

/**
 * 画布右键菜单：顶部列出光标下命中的图层，下方是常用命令。
 *
 * 对齐 PS 的移动工具右键行为——PS 在画布上右键会列出该点所有
 * 有像素的图层，点一下就切过去。这是图层多时最快的选层方式。
 */
export function canvasMenuItems(
  store: EditorStore,
  hits: Layer[],
  t: TranslateFn,
): ContextMenuItem[] {
  const items: ContextMenuItem[] = [];

  // 命中的图层列表放最上面，与 PS 一致
  if (hits.length > 0) {
    items.push({ id: 'hits-heading', label: t('canvasMenu.pickLayer'), heading: true });
    for (const layer of hits) {
      items.push({
        id: `pick-${layer.id}`,
        label: layer.name,
        checked: layer.id === store.activeLayerId,
        run: () => store.selectLayer(layer.id),
      });
    }
    items.push({ id: 's-hits', separator: true });
  }

  return items.concat(selectionItems(store, t), layerItems(store, t));
}

/** 选区相关命令。无选区时相关项禁用，与 PS 一致 */
function selectionItems(store: EditorStore, t: TranslateFn): ContextMenuItem[] {
  const hasSelection = Boolean(store.selection);
  return [
    {
      id: 'select-all',
      label: t('menu.select.all'),
      shortcut: 'Ctrl+A',
      run: () => store.selectAllPixels(),
    },
    {
      id: 'deselect',
      label: t('menu.select.deselect'),
      shortcut: 'Ctrl+D',
      disabled: !hasSelection,
      run: () => store.deselect(),
    },
    {
      id: 'invert',
      label: t('menu.select.inverse'),
      shortcut: 'Ctrl+Shift+I',
      disabled: !hasSelection,
      run: () => store.invertSelectionState(),
    },
    { id: 's-sel', separator: true },
    {
      id: 'free-transform',
      label: t('menu.edit.freeTransform'),
      shortcut: 'Ctrl+T',
      run: () => store.beginTransform(),
    },
    { id: 's-clip', separator: true },
    {
      id: 'cut',
      label: t('menu.edit.cut'),
      shortcut: 'Ctrl+X',
      disabled: !hasSelection,
      run: () => store.cutSelection(),
    },
    {
      id: 'copy',
      label: t('menu.edit.copy'),
      shortcut: 'Ctrl+C',
      disabled: !hasSelection,
      run: () => store.copySelection(),
    },
    {
      id: 'paste',
      label: t('menu.edit.paste'),
      shortcut: 'Ctrl+V',
      disabled: !store.clipboard,
      run: () => store.pasteClipboard(),
    },
  ];
}

/** 当前图层的常用命令，与图层面板右键的高频项保持一致 */
function layerItems(store: EditorStore, t: TranslateFn): ContextMenuItem[] {
  const active = store.layers.find((item) => item.id === store.activeLayerId);
  if (!active) return [];
  const hasSelection = Boolean(store.selection);

  return [
    { id: 's-layer', separator: true },
    {
      id: 'layer-via-copy',
      label: t('menu.layer.viaCopy'),
      shortcut: 'Ctrl+J',
      run: () => store.layerViaCopy(),
    },
    {
      id: 'layer-via-cut',
      label: t('menu.layer.viaCut'),
      shortcut: 'Ctrl+Shift+J',
      disabled: !hasSelection,
      run: () => store.layerViaCut(),
    },
    { id: 's-layer2', separator: true },
    {
      id: 'add-mask',
      label: hasSelection ? t('layerBar.maskFromSelection') : t('menu.layer.addMask'),
      disabled: Boolean(active.mask),
      run: () => store.addMask(active.id, hasSelection ? 'selection' : 'reveal'),
    },
    {
      id: 'layer-style',
      label: t('menu.layer.style'),
      run: () => store.openDialog('layer-style'),
    },
  ];
}
