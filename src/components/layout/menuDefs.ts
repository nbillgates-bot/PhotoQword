/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { EditorStore } from '../../store/types';
import { ungroupTarget } from '../../engine/layerTree';
import { canClip } from '../../engine/clipping';

/** 菜单项动作能拿到的上下文，避免菜单定义直接依赖组件 */
export interface MenuActionContext {
  store: EditorStore;
  pickFile: (mode: 'open' | 'place') => void;
  /** 存储：有关联文件就直接写回，没有则转「存储为」 */
  save: () => void;
  /** 存储为：总是先问文件名和位置 */
  saveAs: () => void;
}

export interface MenuItemDef {
  id: string;
  /**
   * 菜单项文字。给函数是为了「创建/释放剪贴蒙版」这类
   * PS 里同一项在两个标签之间切换的命令，读取一律走 menuItemLabel。
   */
  label: string | ((store: EditorStore) => string);
  shortcut?: string;
  /** 分隔线 */
  divider?: boolean;
  run?: (ctx: MenuActionContext) => void;
  /** 返回 true 时置灰 */
  disabled?: (store: EditorStore) => boolean;
  /** 勾选状态 */
  checked?: (store: EditorStore) => boolean;
}

export interface MenuDef {
  id: string;
  label: string;
  items: MenuItemDef[];
}

/** 取菜单项当前该显示的文字 */
export function menuItemLabel(item: MenuItemDef, store: EditorStore): string {
  return typeof item.label === 'function' ? item.label(store) : item.label;
}

const sep = (id: string): MenuItemDef => ({ id, label: '', divider: true });
const noDoc = (store: EditorStore) => !store.doc;

const fileMenu: MenuDef = {
  id: 'file',
  label: 'menu.file',
  items: [
    {
      id: 'new',
      label: 'menu.file.new',
      shortcut: 'Ctrl+N',
      run: ({ store }) => store.openDialog('new'),
    },
    { id: 'open', label: 'menu.file.open', shortcut: 'Ctrl+O', run: ({ pickFile }) => pickFile('open') },
    {
      id: 'place',
      label: 'menu.file.place',
      disabled: noDoc,
      run: ({ pickFile }) => pickFile('place'),
    },
    sep('f1'),
    {
      /*
       * PS 的「存储」：已关联文件直接写回、不弹窗；从没存过才弹存储为。
       * 存的是 PSD（唯一能保留图层的格式），PNG/JPG 走下面的「导出」。
       */
      id: 'save',
      label: 'menu.file.save',
      shortcut: 'Ctrl+S',
      disabled: noDoc,
      run: ({ save }) => save(),
    },
    {
      id: 'save-as',
      label: 'menu.file.saveAs',
      shortcut: 'Ctrl+Shift+S',
      disabled: noDoc,
      run: ({ saveAs }) => saveAs(),
    },
    {
      id: 'export',
      label: 'menu.file.export',
      shortcut: 'Ctrl+E',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('export'),
    },
    sep('f2'),
    { id: 'close', label: 'menu.file.close', disabled: noDoc, run: ({ store }) => store.closeDoc() },
  ],
};

const editMenu: MenuDef = {
  id: 'edit',
  label: 'menu.edit',
  items: [
    {
      id: 'undo',
      label: 'menu.edit.undo',
      shortcut: 'Ctrl+Z',
      disabled: (store) => !store.canUndo(),
      run: ({ store }) => store.undo(),
    },
    {
      id: 'redo',
      label: 'menu.edit.redo',
      shortcut: 'Ctrl+Y',
      disabled: (store) => !store.canRedo(),
      run: ({ store }) => store.redo(),
    },
    sep('e1'),
    {
      id: 'cut',
      label: 'menu.edit.cut',
      shortcut: 'Ctrl+X',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.cutSelection(),
    },
    {
      id: 'copy',
      label: 'menu.edit.copy',
      shortcut: 'Ctrl+C',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.copySelection(),
    },
    {
      id: 'paste',
      label: 'menu.edit.paste',
      shortcut: 'Ctrl+V',
      disabled: noDoc,
      run: ({ store }) => store.pasteClipboard(),
    },
    {
      id: 'clear',
      label: 'menu.edit.clear',
      shortcut: 'Delete',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.deleteSelectionPixels(),
    },
    sep('e2'),
    {
      id: 'free-transform',
      label: 'menu.edit.freeTransform',
      shortcut: 'Ctrl+T',
      disabled: noDoc,
      run: ({ store }) => {
        store.setTool('transform');
        store.beginTransform();
      },
    },
  ],
};

const imageMenu: MenuDef = {
  id: 'image',
  label: 'menu.image',
  items: [
    {
      id: 'image-size',
      label: 'menu.image.size',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('image-size'),
    },
    {
      id: 'canvas-size',
      label: 'menu.image.canvasSize',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('canvas-size'),
    },
    {
      // PS 里紧跟在画布大小之后。图层被拖出画布后靠它把画布扩回来
      id: 'reveal-all',
      label: 'menu.image.revealAll',
      disabled: noDoc,
      run: ({ store }) => store.revealAll(),
    },
    sep('i1'),
    {
      id: 'rotate-cw',
      label: 'menu.image.rotateCW',
      disabled: noDoc,
      run: ({ store }) => store.rotateDoc(90),
    },
    {
      id: 'rotate-ccw',
      label: 'menu.image.rotateCCW',
      disabled: noDoc,
      run: ({ store }) => store.rotateDoc(270),
    },
    { id: 'rotate-180', label: 'menu.image.rotate180', disabled: noDoc, run: ({ store }) => store.rotateDoc(180) },
    sep('i2'),
    {
      id: 'flip-h',
      label: 'menu.image.flipH',
      disabled: noDoc,
      run: ({ store }) => store.flipDoc('horizontal'),
    },
    {
      id: 'flip-v',
      label: 'menu.image.flipV',
      disabled: noDoc,
      run: ({ store }) => store.flipDoc('vertical'),
    },
    sep('i3'),
    {
      id: 'curves',
      label: 'menu.image.curves',
      shortcut: 'Ctrl+M',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('curves'),
    },
    {
      id: 'levels',
      label: 'menu.image.levels',
      shortcut: 'Ctrl+L',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('levels'),
    },
    {
      id: 'invert-image',
      label: 'menu.image.invert',
      shortcut: 'Ctrl+I',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.invertActiveLayer(),
    },
    sep('i4'),
    {
      id: 'adjust',
      label: 'menu.image.adjust',
      disabled: noDoc,
      run: ({ store }) => store.setRightPanelTab('adjust'),
    },
  ],
};

const layerMenu: MenuDef = {
  id: 'layer',
  label: 'menu.layer',
  items: [
    { id: 'new-layer', label: 'menu.layer.new', disabled: noDoc, run: ({ store }) => store.addLayer('raster') },
    { id: 'new-group', label: 'menu.layer.newGroup', disabled: noDoc, run: ({ store }) => store.addGroup() },
    {
      id: 'new-adjustment-brightness-contrast',
      label: 'menu.layer.newAdjustBrightness',
      disabled: noDoc,
      run: ({ store }) => {
        store.addAdjustmentLayer(
          'brightness-contrast',
          { brightness: 0, contrast: 0, saturation: 0, hue: 0, exposure: 0, temperature: 0, vibrance: 0 },
          'adjustLayer.brightnessContrast',
        );
        store.openDialog('adjustment-brightness-contrast');
      },
    },
    {
      // PS 里在「图层 > 新建」子菜单下。我们没做子菜单，平铺在这里
      id: 'layer-via-copy',
      label: 'menu.layer.viaCopy',
      shortcut: 'Ctrl+J',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.layerViaCopy(),
    },
    {
      id: 'layer-via-cut',
      label: 'menu.layer.viaCut',
      shortcut: 'Ctrl+Shift+J',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.layerViaCut(),
    },
    {
      id: 'dup-layer',
      label: 'menu.layer.duplicate',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.activeLayerId && store.duplicateLayer(store.activeLayerId),
    },
    {
      id: 'del-layer',
      label: 'menu.layer.delete',
      disabled: (store) => store.layers.length <= 1,
      run: ({ store }) => store.deleteSelectedLayers(),
    },
    sep('l-style'),
    {
      id: 'layer-style',
      label: 'menu.layer.style',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.openDialog('layer-style'),
    },
    {
      id: 'clear-style',
      label: 'menu.layer.clearStyle',
      disabled: (store) => !store.activeLayer()?.effects,
      run: ({ store }) => {
        if (!store.activeLayerId) return;
        store.setLayerEffects(store.activeLayerId, undefined);
        // 效果是非像素属性，meta 里整存，不必扫像素
        store.pushHistory('action.clearLayerStyle', { layerIds: [] });
      },
    },
    sep('l-mask'),
    {
      id: 'add-mask',
      label: 'menu.layer.addMask',
      disabled: (store) => !store.activeLayerId || Boolean(store.activeLayer()?.mask),
      run: ({ store }) =>
        store.activeLayerId &&
        store.addMask(store.activeLayerId, store.selection ? 'selection' : 'reveal'),
    },
    {
      id: 'add-mask-hide',
      label: 'menu.layer.addMaskHide',
      disabled: (store) => !store.activeLayerId || Boolean(store.activeLayer()?.mask),
      run: ({ store }) => store.activeLayerId && store.addMask(store.activeLayerId, 'hide'),
    },
    {
      id: 'invert-mask',
      label: 'menu.layer.invertMask',
      disabled: (store) => !store.activeLayer()?.mask,
      run: ({ store }) => store.activeLayerId && store.invertMaskOf(store.activeLayerId),
    },
    {
      id: 'toggle-mask',
      label: 'menu.layer.toggleMask',
      disabled: (store) => !store.activeLayer()?.mask,
      run: ({ store }) => store.activeLayerId && store.toggleMaskEnabled(store.activeLayerId),
    },
    {
      id: 'apply-mask',
      label: 'menu.layer.applyMask',
      disabled: (store) => !store.activeLayer()?.mask,
      run: ({ store }) => store.activeLayerId && store.applyMaskToLayer(store.activeLayerId),
    },
    {
      id: 'delete-mask',
      label: 'menu.layer.deleteMask',
      disabled: (store) => !store.activeLayer()?.mask,
      run: ({ store }) => store.activeLayerId && store.deleteMask(store.activeLayerId),
    },
    sep('l1'),
    {
      id: 'up',
      label: 'menu.layer.raise',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.activeLayerId && store.reorderLayer(store.activeLayerId, 'up'),
    },
    {
      id: 'down',
      label: 'menu.layer.lower',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.activeLayerId && store.reorderLayer(store.activeLayerId, 'down'),
    },
    sep('l-group'),
    {
      id: 'group-layers',
      label: 'menu.layer.group',
      shortcut: 'Ctrl+G',
      disabled: (store) => !store.activeLayerId,
      run: ({ store }) => store.groupSelectedLayers(),
    },
    {
      id: 'ungroup',
      label: 'menu.layer.ungroup',
      shortcut: 'Ctrl+Shift+G',
      // 选中组内图层时解散它所在的组，不必先点到组那一行，与 PS 一致
      disabled: (store) => !ungroupTarget(store.layers, store.activeLayerId),
      run: ({ store }) => {
        const target = ungroupTarget(store.layers, store.activeLayerId);
        if (target) store.ungroup(target);
      },
    },
    {
      id: 'merge-group',
      label: 'menu.layer.mergeGroup',
      disabled: (store) => store.activeLayer()?.type !== 'group',
      run: ({ store }) => store.activeLayerId && store.mergeGroup(store.activeLayerId),
    },
    {
      id: 'clip-mask',
      // PS 的「图层」菜单里也是同一项在两个标签之间切换
      label: (store) => (store.activeLayer()?.clipped ? 'menu.layer.releaseClippingMask' : 'menu.layer.createClippingMask'),
      shortcut: 'Ctrl+Alt+G',
      disabled: (store) => {
        const active = store.activeLayer();
        if (!active) return true;
        return !active.clipped && !canClip(store.layers, active.id);
      },
      run: ({ store }) => store.toggleClipped(),
    },
    sep('l2'),
    {
      id: 'merge',
      label: 'menu.layer.mergeDown',
      disabled: (store) =>
        !store.activeLayerId || store.layers.findIndex((l) => l.id === store.activeLayerId) <= 0,
      run: ({ store }) => store.activeLayerId && store.mergeDown(store.activeLayerId),
    },
    {
      id: 'flatten',
      label: 'menu.layer.flatten',
      disabled: (store) => store.layers.length <= 1,
      run: ({ store }) => store.flattenAll(),
    },
    {
      id: 'rasterize',
      label: 'menu.layer.rasterize',
      disabled: (store) => {
        const layer = store.layers.find((l) => l.id === store.activeLayerId);
        return !layer || layer.type === 'raster';
      },
      run: ({ store }) => store.activeLayerId && store.rasterizeLayer(store.activeLayerId),
    },
  ],
};

const selectMenu: MenuDef = {
  id: 'select',
  label: 'menu.select',
  items: [
    { id: 'all', label: 'menu.select.all', shortcut: 'Ctrl+A', disabled: noDoc, run: ({ store }) => store.selectAllPixels() },
    {
      id: 'deselect',
      label: 'menu.select.deselect',
      shortcut: 'Ctrl+D',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.deselect(),
    },
    {
      id: 'invert',
      label: 'menu.select.inverse',
      shortcut: 'Ctrl+Shift+I',
      disabled: (store) => !store.selection,
      run: ({ store }) => store.invertSelectionState(),
    },
  ],
};

const filterMenu: MenuDef = {
  id: 'filter',
  label: 'menu.filter',
  items: [
    {
      id: 'filter-dialog',
      label: 'menu.filter.gallery',
      disabled: noDoc,
      run: ({ store }) => store.openDialog('filter'),
    },
  ],
};

const viewMenu: MenuDef = {
  id: 'view',
  label: 'menu.view',
  items: [
    { id: 'zoom-in', label: 'menu.view.zoomIn', shortcut: 'Ctrl++', disabled: noDoc, run: ({ store }) => store.zoomIn() },
    { id: 'zoom-out', label: 'menu.view.zoomOut', shortcut: 'Ctrl+-', disabled: noDoc, run: ({ store }) => store.zoomOut() },
    {
      id: 'actual',
      label: 'menu.view.actualPixels',
      shortcut: 'Ctrl+1',
      disabled: noDoc,
      run: ({ store }) => store.actualPixels(),
    },
    sep('v1'),
    {
      id: 'rulers',
      label: 'menu.view.rulers',
      checked: (store) => store.showRulers,
      run: ({ store }) => store.toggleRulers(),
    },
    {
      id: 'grid',
      label: 'menu.view.grid',
      checked: (store) => store.showGrid,
      run: ({ store }) => store.toggleGrid(),
    },
    {
      id: 'guides',
      label: 'menu.view.guides',
      shortcut: 'Ctrl+;',
      checked: (store) => store.showGuides,
      run: ({ store }) => store.toggleGuides(),
    },
    {
      id: 'clear-guides',
      label: 'menu.view.clearGuides',
      disabled: (store) => store.guides.length === 0,
      run: ({ store }) => store.clearGuides(),
    },
    {
      id: 'transparency',
      label: 'menu.view.transparencyGrid',
      checked: (store) => store.showTransparencyGrid,
      run: ({ store }) => store.toggleTransparencyGrid(),
    },
    {
      id: 'layer-edges',
      label: 'menu.view.layerEdges',
      checked: (store) => store.showLayerEdges,
      run: ({ store }) => store.toggleLayerEdges(),
    },
  ],
};

const helpMenu: MenuDef = {
  id: 'help',
  label: 'menu.help',
  items: [
    { id: 'shortcuts', label: 'menu.help.shortcuts', run: ({ store }) => store.openDialog('shortcuts') },
    { id: 'about', label: 'menu.help.about', run: ({ store }) => store.openDialog('about') },
  ],
};

const languageMenu: MenuDef = {
  id: 'language',
  label: 'menu.language',
  items: [
    {
      id: 'lang-zh-cn',
      label: 'locale.zhCN',
      checked: (store) => store.locale === 'zh-CN',
      run: ({ store }) => store.setLocale('zh-CN'),
    },
    {
      id: 'lang-en',
      label: 'English',
      checked: (store) => store.locale === 'en',
      run: ({ store }) => store.setLocale('en'),
    },
  ],
};

export const MENUS: MenuDef[] = [
  fileMenu,
  editMenu,
  imageMenu,
  layerMenu,
  selectMenu,
  filterMenu,
  viewMenu,
  languageMenu,
  helpMenu,
];
