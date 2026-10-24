/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, AdjustSlice } from './types';
import { applyWithinSelection } from '../engine/maskedEdit';
import { invert } from '../engine/adjustments';
import { pixelBlockReason } from '../engine/layerLock';

/**
 * 一键式颜色调整：无参数、按一下就定案的那些。
 *
 * 与 FilterDialog 的区别是不做实时预览，所以直接改像素并压历史；
 * 滤镜面板要预览，得自己管基线副本，确认时才提交。
 */
export const createAdjustSlice: StateCreator<EditorStore, [], [], AdjustSlice> = (_set, get) => ({
  /**
   * 反相（Ctrl+I）。PS 的行为照做三条：
   * 作用于当前编辑目标（选了蒙版就反相蒙版）、有选区时只反相选区内、
   * 组没有自己的像素所以要求先合并。
   */
  invertActiveLayer: () => {
    const { layers, activeLayerId, selection } = get();
    const layer = layers.find((item) => item.id === activeLayerId);
    if (!layer) return;

    // 正在编辑蒙版时反相蒙版，复用已有 action，不在这儿重写一遍
    if (layer.maskSelected && layer.mask) {
      get().invertMaskOf(layer.id);
      return;
    }

    if (layer.type === 'group') {
      get().showToast('error.layer.groupMergeBeforeInvert', 'error');
      return;
    }
    const blocked = pixelBlockReason(layer);
    if (blocked) {
      get().showToast(blocked, 'error');
      return;
    }

    // 传图层原点：选区是文档坐标的，图层被移动过时要按偏移对齐，不能直接套
    applyWithinSelection(layer.canvas, selection, invert, layer.bounds);
    get().bumpRevision();
    get().pushHistory('action.invert', { layerIds: [layer.id] });
  },
});
