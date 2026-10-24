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
import { LAYER_COLORS } from '../../types';
import { childrenOf, ungroupTarget } from '../../engine/layerTree';
import { canClip } from '../../engine/clipping';
import type { TranslateFn } from '../../i18n/translate';

/**
 * 图层行右键菜单的内容。
 *
 * 项目与顺序对齐 PS 中文版：只收高频命令，不是把「图层」菜单整个搬过来。
 * 可用性判断必须与对应 action 的前置条件一致，否则会出现
 * 「菜单项亮着但点了弹报错」。
 */
export function layerMenuItems(store: EditorStore, layer: Layer, t: TranslateFn): ContextMenuItem[] {
  const selected = store.selectedLayers();
  // 多选时命令作用于整个选中集合，标签也要跟着变，与 PS 一致
  const many = selected.length > 1;
  const isGroup = layer.type === 'group';
  const count = selected.length;

  const siblings = childrenOf(store.layers, layer.parentId ?? null);
  const canMergeDown = !isGroup && siblings.findIndex((item) => item.id === layer.id) > 0;
  const ungroupId = ungroupTarget(store.layers, layer.id);

  return [
    {
      id: 'duplicate',
      label: many
        ? t('layerMenu.duplicateMany', { count })
        : isGroup
          ? t('layerMenu.duplicateGroup')
          : t('layerMenu.duplicateLayer'),
      run: () => (many ? store.duplicateSelectedLayers() : store.duplicateLayer(layer.id)),
    },
    {
      id: 'delete',
      label: many
        ? t('layerMenu.deleteMany', { count })
        : isGroup
          ? t('layerMenu.deleteGroup')
          : t('layerMenu.deleteLayer'),
      run: () => (many ? store.deleteSelectedLayers() : store.deleteLayer(layer.id)),
    },
    { id: 's1', separator: true },
    ...groupItems(store, layer, many, ungroupId, t),
    { id: 's-style', separator: true },
    {
      id: 'layer-style',
      label: t('menu.layer.style'),
      run: () => store.openDialog('layer-style'),
    },
    {
      id: 'clear-style',
      label: t('menu.layer.clearStyle'),
      disabled: !layer.effects,
      run: () => {
        store.setLayerEffects(layer.id, undefined);
        // 效果是非像素属性，meta 里整存，不必扫像素
        store.pushHistory('action.clearLayerStyle', { layerIds: [] });
      },
    },
    { id: 's2', separator: true },
    ...maskItems(store, layer, t),
    {
      id: 'merge-down',
      label: t('menu.layer.mergeDown'),
      disabled: !canMergeDown,
      run: () => store.mergeDown(layer.id),
    },
    {
      id: 'rasterize',
      label: t('menu.layer.rasterize'),
      disabled: layer.type === 'raster' || isGroup,
      run: () => store.rasterizeLayer(layer.id),
    },
    { id: 's3', separator: true },
    ...colorItems(store, layer, t),
  ];
}

/** 编组相关。选中组时「合并组」替掉「向下合并」的位置 */
function groupItems(
  store: EditorStore,
  layer: Layer,
  many: boolean,
  ungroupId: string | null,
  t: TranslateFn,
): ContextMenuItem[] {
  return [
    {
      id: 'group',
      label: many ? t('layerMenu.groupFromLayers') : t('menu.layer.group'),
      shortcut: 'Ctrl+G',
      run: () => (many ? store.groupSelectedLayers() : store.groupLayers([layer.id])),
    },
    {
      id: 'ungroup',
      label: t('menu.layer.ungroup'),
      shortcut: 'Ctrl+Shift+G',
      disabled: !ungroupId,
      run: () => ungroupId && store.ungroup(ungroupId),
    },
    {
      id: 'merge-group',
      label: t('menu.layer.mergeGroup'),
      disabled: layer.type !== 'group',
      run: () => store.mergeGroup(layer.id),
    },
    {
      id: 'clip',
      // 与 PS 一样是一个开关，标签随当前状态变
      label: layer.clipped ? t('menu.layer.releaseClippingMask') : t('menu.layer.createClippingMask'),
      shortcut: 'Ctrl+Alt+G',
      // 已剪贴的随时能释放；要创建就得同级里下面真有一层可剪
      disabled: !layer.clipped && !canClip(store.layers, layer.id),
      run: () => store.toggleClipped(),
    },
  ];
}

/** 蒙版相关。已有蒙版时添加项禁用，没有时删除/应用项禁用 */
function maskItems(store: EditorStore, layer: Layer, t: TranslateFn): ContextMenuItem[] {
  const hasMask = Boolean(layer.mask);
  return [
    {
      id: 'add-mask',
      label: store.selection ? t('layerBar.maskFromSelection') : t('menu.layer.addMask'),
      disabled: hasMask,
      run: () => store.addMask(layer.id, store.selection ? 'selection' : 'reveal'),
    },
    {
      id: 'delete-mask',
      label: t('menu.layer.deleteMask'),
      disabled: !hasMask,
      run: () => store.deleteMask(layer.id),
    },
    {
      id: 'apply-mask',
      label: t('menu.layer.applyMask'),
      disabled: !hasMask,
      run: () => store.applyMaskToLayer(layer.id),
    },
  ];
}

/**
 * 颜色标记。
 *
 * PS 是二级子菜单，这里平铺成一段。浏览器里的 hover 子菜单
 * 鼠标斜着划出去就关，比 PS 难用，平铺反而更接近「照做但别更难用」。
 * 真需要嵌套（例如以后加「转换为」）时再让 ContextMenu 支持子菜单。
 */
function colorItems(store: EditorStore, layer: Layer, t: TranslateFn): ContextMenuItem[] {
  return LAYER_COLORS.map((entry) => ({
    id: `color-${entry.label}`,
    label: t(entry.label),
    // 当前颜色前面不打勾，靠色块自身高亮已经够辨认；无色项给个透明块占位
    swatch: entry.value ?? 'transparent',
    disabled: (layer.color ?? undefined) === entry.value,
    run: () => store.setSelectedColor(entry.value),
  }));
}
