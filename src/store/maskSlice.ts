/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, MaskSlice } from './types';
import type { Layer } from '../types';
import { cloneCanvas } from '../engine/canvasUtils';
import { applyMask, createMask, invertMask, maskFromSelection, maskGeometry } from '../engine/mask';

/** 找图层，顺手把"没有蒙版"的情况挡掉 */
function withMask(store: EditorStore, id: string): Layer | null {
  const layer = store.layers.find((item) => item.id === id);
  return layer?.mask ? layer : null;
}

export const createMaskSlice: StateCreator<EditorStore, [], [], MaskSlice> = (_set, get) => ({
  addMask: (id, from = 'reveal') => {
    const { doc, layers, selection } = get();
    if (!doc) return;
    const layer = layers.find((item) => item.id === id);
    if (!layer) return;
    if (layer.mask) {
      get().showToast('layerBar.maskExists', 'error');
      return;
    }

    /*
     * 蒙版的尺寸与对齐点一律问 maskGeometry，不要在这里自己按文档尺寸建：
     * 图层画布可以比文档小（PSD 导入的图层就是），按文档尺寸建出来的蒙版
     * 在合成时会摆错位置。组按文档尺寸建，也由 maskGeometry 决定。
     */
    const geom = maskGeometry(layer, doc);
    // 有选区时按 PS 的习惯：选区内显示，选区外隐藏
    const mask =
      from === 'selection' && selection
        ? maskFromSelection(selection.mask, geom)
        : createMask(geom.width, geom.height, from !== 'hide');

    get().updateLayer(id, { mask, maskEnabled: true, maskSelected: true });
    get().pushHistory('action.addMask', { layerIds: [id] });
  },

  deleteMask: (id) => {
    if (!withMask(get(), id)) return;
    get().updateLayer(id, { mask: undefined, maskSelected: false });
    get().pushHistory('action.deleteMask', { layerIds: [id] });
  },

  /** 把蒙版效果永久烙进像素，然后丢掉蒙版 */
  applyMaskToLayer: (id) => {
    const layer = withMask(get(), id);
    if (!layer?.mask) return;
    // 组没有自己的像素，烙进 1x1 占位画布等于把蒙版效果丢掉，
    // 要先合并组才有可烙的目标
    if (layer.type === 'group') {
      get().showToast('error.layer.groupMergeBeforeMask', 'error');
      return;
    }
    const merged = applyMask(layer.canvas, layer.mask);
    get().updateLayer(id, { canvas: merged, mask: undefined, maskSelected: false });
    get().pushHistory('action.applyMask', { layerIds: [id] });
  },

  toggleMaskEnabled: (id) => {
    const layer = withMask(get(), id);
    if (!layer) return;
    get().updateLayer(id, { maskEnabled: layer.maskEnabled === false });
    get().pushHistory('action.toggleMask', { layerIds: [id] });
  },

  invertMaskOf: (id) => {
    const layer = withMask(get(), id);
    if (!layer?.mask) return;
    // 就地改会让历史的影子比对拿不到"前"的状态，所以换一张新画布
    const next = cloneCanvas(layer.mask);
    invertMask(next);
    get().updateLayer(id, { mask: next });
    get().pushHistory('action.invertMask', { layerIds: [id] });
  },

  /** 选中蒙版或图层像素作为绘制目标 */
  setMaskSelected: (id, selected) => {
    const layer = get().layers.find((item) => item.id === id);
    if (!layer) return;
    if (selected && !layer.mask) return;
    get().updateLayer(id, { maskSelected: selected });
  },

  /** 当前该往哪张画布上画。没选蒙版或没有蒙版时就是图层本身 */
  paintTarget: () => {
    const layer = get().activeLayer();
    if (!layer) return null;
    /*
     * 组没有自己的像素，画布只是 1x1 占位。
     * 所有绘制工具都从这里取目标，在这一处挡住就等于全部挡住了——
     * 漏掉的话笔刷会往 1x1 画布上画，看不到任何反应也不报错。
     * 组蒙版是真实存在的画布，可以画。
     */
    if (layer.type === 'group') {
      return layer.maskSelected && layer.mask ? layer.mask : null;
    }
    if (layer.maskSelected && layer.mask) return layer.mask;
    return layer.canvas;
  },

  /*
   * 绘制工具的正式入口：先把图层撑到覆盖整个文档，再连带偏移一起给出去。
   *
   * 工具都在文档坐标系里算（笔刷缓冲、渐变、填充补丁都是文档尺寸），
   * 而图层被移动过之后画布原点不在文档原点上，差的就是这个 offset：
   * 画布坐标 = 文档坐标 + offset。蒙版始终是文档坐标系，offset 恒为 0。
   */
  paintSurface: () => {
    const layer = get().activeLayer();
    if (!layer) return null;
    if (layer.type === 'group') {
      const mask = layer.maskSelected && layer.mask ? layer.mask : null;
      return mask ? { canvas: mask, offset: { x: 0, y: 0 }, onMask: true } : null;
    }
    if (layer.maskSelected && layer.mask) {
      return { canvas: layer.mask, offset: { x: 0, y: 0 }, onMask: true };
    }
    const grown = get().expandLayerForEdit(layer.id);
    if (!grown) return null;
    return {
      canvas: grown.canvas,
      offset: { x: -grown.bounds.x, y: -grown.bounds.y },
      onMask: false,
    };
  },

  isPaintingMask: () => {
    const layer = get().activeLayer();
    return Boolean(layer?.maskSelected && layer.mask);
  },
});
