/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 快捷键一览的数据定义。
 *
 * 从 ShortcutsDialog 里抽出来，照的是本项目「数据定义 + 通用渲染器」的
 * 惯例（CLAUDE.md §1.3）：加一条快捷键只改这个文件与词条表，不动组件。
 *
 * 右列分两种，这是刻意区分的：
 * - `keys`：语言中立的键位组合，如 'Ctrl + N'。各语言写法相同，不进词条表。
 * - `keysKey`：需要翻译的操作描述，如「双击图层行」。必须进词条表。
 *
 * 两者二选一。混着写成一个字段会让「这条要不要翻译」变成猜谜，
 * 而漏翻译在中文界面下完全看不出来（I18N.md §6.3）。
 */
export interface ShortcutRow {
  labelKey: string;
  keys?: string;
  keysKey?: string;
}

export interface ShortcutGroup {
  titleKey: string;
  rows: ShortcutRow[];
}

/** 与 ShortcutsDialog 里的显示顺序一致，分组顺序对齐 PS 的菜单顺序 */
export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    titleKey: 'shortcuts.group.file',
    rows: [
      { labelKey: 'shortcuts.file.new', keys: 'Ctrl + N' },
      { labelKey: 'shortcuts.file.open', keys: 'Ctrl + O' },
      { labelKey: 'shortcuts.file.save', keys: 'Ctrl + S' },
      { labelKey: 'shortcuts.file.saveAs', keys: 'Ctrl + Shift + S' },
      { labelKey: 'shortcuts.file.export', keys: 'Ctrl + E' },
    ],
  },
  {
    titleKey: 'shortcuts.group.edit',
    rows: [
      { labelKey: 'shortcuts.edit.undo', keys: 'Ctrl + Z' },
      { labelKey: 'shortcuts.edit.redo', keys: 'Ctrl + Y' },
      { labelKey: 'shortcuts.edit.cut', keys: 'Ctrl + X' },
      { labelKey: 'shortcuts.edit.copy', keys: 'Ctrl + C' },
      { labelKey: 'shortcuts.edit.paste', keys: 'Ctrl + V' },
      { labelKey: 'shortcuts.edit.clearSelection', keys: 'Delete' },
      { labelKey: 'shortcuts.edit.freeTransform', keys: 'Ctrl + T' },
      { labelKey: 'shortcuts.edit.layerViaCopy', keys: 'Ctrl + J' },
      { labelKey: 'shortcuts.edit.layerViaCut', keys: 'Ctrl + Shift + J' },
    ],
  },
  {
    titleKey: 'shortcuts.group.adjust',
    rows: [
      { labelKey: 'menu.image.curves', keys: 'Ctrl + M' },
      { labelKey: 'menu.image.levels', keys: 'Ctrl + L' },
      { labelKey: 'menu.image.invert', keys: 'Ctrl + I' },
    ],
  },
  {
    titleKey: 'shortcuts.group.layer',
    rows: [
      { labelKey: 'shortcuts.layer.group', keys: 'Ctrl + G' },
      { labelKey: 'shortcuts.layer.ungroup', keys: 'Ctrl + Shift + G' },
      { labelKey: 'shortcuts.layer.clippingMask', keys: 'Ctrl + Alt + G' },
      { labelKey: 'shortcuts.layer.clippingMask', keysKey: 'shortcuts.gesture.altClickBetweenRows' },
      { labelKey: 'shortcuts.layer.addToSelection', keysKey: 'shortcuts.gesture.ctrlClick' },
      { labelKey: 'shortcuts.layer.rangeSelect', keysKey: 'shortcuts.gesture.shiftClick' },
      { labelKey: 'shortcuts.layer.openStyle', keysKey: 'shortcuts.gesture.doubleClickRow' },
      { labelKey: 'shortcuts.layer.rename', keysKey: 'shortcuts.gesture.doubleClickName' },
      { labelKey: 'shortcuts.layer.solo', keysKey: 'shortcuts.gesture.altClickEye' },
      { labelKey: 'shortcuts.layer.colorTag', keysKey: 'shortcuts.gesture.rightClickPickColor' },
      { labelKey: 'shortcuts.layer.locks', keysKey: 'shortcuts.gesture.panelLockBar' },
      { labelKey: 'shortcuts.layer.toggleMask', keysKey: 'shortcuts.gesture.shiftClickMaskThumb' },
      { labelKey: 'shortcuts.layer.filter', keysKey: 'shortcuts.gesture.panelFilterBar' },
      { labelKey: 'shortcuts.layer.thumbSize', keysKey: 'shortcuts.gesture.panelMenu' },
      { labelKey: 'shortcuts.layer.collapseGroup', keysKey: 'shortcuts.gesture.clickGroupArrow' },
      { labelKey: 'shortcuts.layer.dragIntoGroup', keysKey: 'shortcuts.gesture.dropOnGroupRow' },
    ],
  },
  {
    titleKey: 'shortcuts.group.cropTransform',
    rows: [
      { labelKey: 'shortcuts.transform.confirm', keysKey: 'shortcuts.gesture.enterOrDoubleClick' },
      { labelKey: 'shortcuts.transform.cancel', keys: 'Esc' },
      { labelKey: 'shortcuts.transform.keepRatio', keysKey: 'shortcuts.gesture.shiftWhileHandle' },
      { labelKey: 'shortcuts.transform.fromCenter', keysKey: 'shortcuts.gesture.altWhileHandle' },
      { labelKey: 'shortcuts.transform.rotate', keysKey: 'shortcuts.gesture.dragOutsideBox' },
      { labelKey: 'shortcuts.transform.snapRotate', keysKey: 'shortcuts.gesture.shiftWhileRotate' },
      { labelKey: 'shortcuts.transform.skew', keysKey: 'shortcuts.gesture.ctrlDragEdgeMid' },
    ],
  },
  {
    titleKey: 'shortcuts.group.select',
    rows: [
      { labelKey: 'menu.select.all', keys: 'Ctrl + A' },
      { labelKey: 'menu.select.deselect', keys: 'Ctrl + D' },
      { labelKey: 'menu.select.inverse', keys: 'Ctrl + Shift + I' },
    ],
  },
  {
    titleKey: 'shortcuts.group.view',
    rows: [
      { labelKey: 'menu.view.zoomIn', keys: 'Ctrl + +' },
      { labelKey: 'menu.view.zoomOut', keys: 'Ctrl + -' },
      { labelKey: 'shortcuts.view.fitScreen', keys: 'Ctrl + 0' },
      { labelKey: 'menu.view.actualPixels', keys: 'Ctrl + 1' },
      { labelKey: 'shortcuts.view.toggleGuides', keys: 'Ctrl + ;' },
      { labelKey: 'shortcuts.view.newGuide', keysKey: 'shortcuts.gesture.dragFromRuler' },
      { labelKey: 'shortcuts.view.moveGuide', keysKey: 'shortcuts.gesture.moveToolDragGuide' },
      { labelKey: 'shortcuts.view.deleteGuide', keysKey: 'shortcuts.gesture.dragGuideAway' },
      { labelKey: 'shortcuts.view.tempHand', keysKey: 'shortcuts.gesture.holdSpace' },
      { labelKey: 'shortcuts.view.zoomToolOut', keysKey: 'shortcuts.gesture.altClick' },
      { labelKey: 'shortcuts.view.zoomAtCursor', keysKey: 'shortcuts.gesture.altOrCtrlWheel' },
      { labelKey: 'shortcuts.view.panVertical', keysKey: 'shortcuts.gesture.wheel' },
      { labelKey: 'shortcuts.view.panHorizontal', keysKey: 'shortcuts.gesture.shiftWheel' },
    ],
  },
  {
    /* 工具名直接复用 tool.* 词条，不另起一套 —— 同一个工具在两处叫法必须一致 */
    titleKey: 'shortcuts.group.tools',
    rows: [
      { labelKey: 'tool.move', keys: 'V' },
      { labelKey: 'shortcuts.tool.marquee', keys: 'M' },
      { labelKey: 'tool.lasso', keys: 'L' },
      { labelKey: 'tool.wand', keys: 'W' },
      { labelKey: 'tool.crop', keys: 'C' },
      { labelKey: 'tool.brush', keys: 'B' },
      { labelKey: 'tool.pencil', keys: 'N' },
      { labelKey: 'tool.eraser', keys: 'E' },
      { labelKey: 'tool.clone', keys: 'S' },
      { labelKey: 'shortcuts.tool.blurGroup', keys: 'R' },
      { labelKey: 'shortcuts.tool.dodgeGroup', keys: 'O' },
      { labelKey: 'shortcuts.tool.fillGroup', keys: 'G' },
      { labelKey: 'tool.text', keys: 'T' },
      { labelKey: 'tool.shape', keys: 'U' },
      { labelKey: 'tool.eyedropper', keys: 'I' },
      { labelKey: 'tool.zoom', keys: 'Z' },
      { labelKey: 'tool.hand', keys: 'H' },
      { labelKey: 'shortcuts.tool.swapColors', keys: 'X' },
      { labelKey: 'shortcuts.tool.resetColors', keys: 'D' },
    ],
  },
  {
    titleKey: 'shortcuts.group.mask',
    rows: [
      { labelKey: 'shortcuts.mask.editMask', keysKey: 'shortcuts.gesture.clickMaskThumb' },
      { labelKey: 'shortcuts.mask.editPixels', keysKey: 'shortcuts.gesture.clickLayerThumb' },
      { labelKey: 'shortcuts.layer.toggleMask', keysKey: 'shortcuts.gesture.shiftClickMaskThumb' },
      { labelKey: 'shortcuts.mask.hide', keysKey: 'shortcuts.gesture.paintBlack' },
      { labelKey: 'shortcuts.mask.reveal', keysKey: 'shortcuts.gesture.paintWhite' },
    ],
  },
];
