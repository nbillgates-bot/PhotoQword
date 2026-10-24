/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, SelectionSlice } from './types';
import type { Layer } from '../types';
import { createCanvas, ctx2d } from '../engine/canvasUtils';
import { invertSelection, selectAll } from '../engine/selection';
import { pixelBlockReason } from '../engine/layerLock';
import { makeLayer } from './layerSlice';
import { newLayerName, pastedLayerName } from '../i18n/defaultNames';

/**
 * 按选区从图层中抠出内容（结果尺寸 = 选区外接矩形）。
 *
 * 选区蒙版与选区外接矩形都是文档坐标系的，图层却可能偏出去，
 * 所以先按 layer.bounds 把图层像素摆进一张文档尺寸的画布，再套蒙版、再裁切。
 */
function extract(
  layer: Layer,
  doc: { width: number; height: number },
  selection: { mask: HTMLCanvasElement; bounds: { x: number; y: number; width: number; height: number } },
): HTMLCanvasElement {
  const { bounds } = selection;
  const full = createCanvas(doc.width, doc.height);
  const context = ctx2d(full);
  context.drawImage(layer.canvas, layer.bounds.x, layer.bounds.y);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(selection.mask, 0, 0);

  const output = createCanvas(bounds.width, bounds.height);
  ctx2d(output).drawImage(
    full,
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height,
    0,
    0,
    bounds.width,
    bounds.height,
  );
  return output;
}

export const createSelectionSlice: StateCreator<EditorStore, [], [], SelectionSlice> = (
  set,
  get,
) => ({
  selection: null,
  clipboard: null,

  setSelection: (selection) => set({ selection }),

  selectAllPixels: () => {
    const { doc } = get();
    if (!doc) return;
    set({ selection: selectAll(doc.width, doc.height) });
  },

  deselect: () => set({ selection: null }),

  invertSelectionState: () => {
    const { selection, doc } = get();
    if (!doc) return;
    // 无选区时反选等价于全选
    if (!selection) {
      set({ selection: selectAll(doc.width, doc.height) });
      return;
    }
    set({ selection: invertSelection(selection) });
  },

  copySelection: () => {
    const { selection, doc } = get();
    const layer = get().activeLayer();
    if (!layer || !doc) return;
    if (!selection) {
      get().showToast('error.selection.required', 'error');
      return;
    }
    set({ clipboard: extract(layer, doc, selection) });
    get().showToast('toast.copied');
  },

  deleteSelectionPixels: () => {
    const { selection } = get();
    const layer = get().activeLayer();
    if (!layer) return;
    const blocked = pixelBlockReason(layer);
    if (blocked) {
      get().showToast(blocked, 'error');
      return;
    }
    const context = ctx2d(layer.canvas);
    if (!selection) {
      // 没有选区：整层清空。这里连移出画布的部分一起清掉，与 PS 的「删除图层内容」一致
      context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    } else {
      context.save();
      context.globalCompositeOperation = 'destination-out';
      // 选区蒙版是文档坐标系的，图层偏出去时要减掉偏移才对得上
      context.drawImage(selection.mask, -layer.bounds.x, -layer.bounds.y);
      context.restore();
    }
    get().pushHistory('action.delete');
    get().bumpRevision();
  },

  cutSelection: () => {
    get().copySelection();
    if (get().clipboard) get().deleteSelectionPixels();
  },

  layerViaCopy: () => {
    const { selection, doc, layers } = get();
    const layer = get().activeLayer();
    if (!layer || !doc) return;
    if (!selection) {
      // PS 里无选区时 Ctrl+J 等价于复制整个图层
      get().duplicateLayer(layer.id);
      return;
    }
    const piece = extract(layer, doc, selection);
    /*
     * PS 把新层插在源图层**正上方**，不是丢到最顶上。
     * insertLayer 只会追加到数组末尾（即最顶层），所以这里自己拼数组。
     */
    const created = makeLayer(doc.width, doc.height, newLayerName(get().locale, 1));
    ctx2d(created.canvas).drawImage(piece, selection.bounds.x, selection.bounds.y);
    const index = layers.findIndex((item) => item.id === layer.id);
    const next = [...layers];
    next.splice(index + 1, 0, { ...created, parentId: layer.parentId });
    set({ layers: next, activeLayerId: created.id, selectedLayerIds: [created.id] });
    get().pushHistory('action.layerViaCopy');
    get().bumpRevision();
  },

  layerViaCut: () => {
    const { selection } = get();
    if (!selection) {
      get().showToast('error.selection.required', 'error');
      return;
    }
    const source = get().activeLayer();
    if (!source) return;
    // 先挖洞再建层：反过来的话 layerViaCopy 会把已经挖空的像素抠进新层
    const blocked = pixelBlockReason(source);
    if (blocked) {
      get().showToast(blocked, 'error');
      return;
    }
    get().layerViaCopy();
    const created = get().activeLayerId;
    // 回到源图层挖洞，再把选中态还给新层。两步合成一条历史
    get().setActiveLayer(source.id);
    const context = ctx2d(source.canvas);
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.drawImage(selection.mask, -source.bounds.x, -source.bounds.y);
    context.restore();
    if (created) set({ activeLayerId: created, selectedLayerIds: [created] });
    get().pushHistory('action.layerViaCut');
    get().bumpRevision();
  },

  pasteClipboard: () => {
    const { clipboard, doc } = get();
    if (!clipboard || !doc) {
      // 如果应用内剪贴板为空，尝试从系统剪贴板读取
      get().pasteFromSystemClipboard();
      return;
    }
    // insertLayer 不记历史，粘贴的"建层 + 贴图"合成下面那一条
    const layer = get().insertLayer('raster', pastedLayerName(get().locale));
    if (!layer) return;
    const x = Math.round((doc.width - clipboard.width) / 2);
    const y = Math.round((doc.height - clipboard.height) / 2);
    ctx2d(layer.canvas).drawImage(clipboard, x, y);
    get().pushHistory('action.paste');
    get().bumpRevision();
  },

  /** 从系统剪贴板粘贴图片 */
  pasteFromSystemClipboard: async () => {
    const { doc } = get();
    if (!doc) return;

    try {
      // 检查 Clipboard API 可用性
      if (!navigator.clipboard || !navigator.clipboard.read) {
        get().showToast('error.clipboard.unsupported', 'error');
        return;
      }

      const items = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;

      // 查找图片类型的 ClipboardItem
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            imageBlob = await item.getType(type);
            break;
          }
        }
        if (imageBlob) break;
      }

      if (!imageBlob) {
        get().showToast('error.clipboard.noImage', 'error');
        return;
      }

      // 将 Blob 转换为 HTMLImageElement
      const url = URL.createObjectURL(imageBlob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);

        // 创建 canvas 并绘制图片
        const canvas = createCanvas(img.width, img.height);
        ctx2d(canvas).drawImage(img, 0, 0);

        // 创建新图层并粘贴
        const layer = get().insertLayer('raster', pastedLayerName(get().locale));
        if (!layer) return;

        const x = Math.round((doc.width - canvas.width) / 2);
        const y = Math.round((doc.height - canvas.height) / 2);
        ctx2d(layer.canvas).drawImage(canvas, x, y);

        get().pushHistory('action.paste');
        get().bumpRevision();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        get().showToast('error.image.decodeFailed', 'error');
      };
      img.src = url;
    } catch (error) {
      // 权限被拒绝或其他错误
      if (error instanceof Error && error.name === 'NotAllowedError') {
        get().showToast('error.clipboard.noPermission', 'error');
      } else {
        get().showToast('error.clipboard.pasteFailed', 'error');
      }
    }
  },
});
