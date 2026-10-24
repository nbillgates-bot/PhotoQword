/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, CropSlice } from './types';
import type { Rect } from '../types';
import { normalize } from '../engine/handleBox';

/** 裁剪框的最小尺寸，防止拖成 0 宽高后无法再操作 */
const MIN_SIZE = 4;

/**
 * 裁剪会话。
 *
 * 与 PS 一致：拖出裁剪框后**不立即裁剪**，框保留在画布上可继续拖边、拖角调整，
 * 双击框内或按 Enter 才真正裁剪，Esc 取消。
 * 之前的实现是抬手立刻裁，没法回头调整，这是本次修的主要问题。
 */
export const createCropSlice: StateCreator<EditorStore, [], [], CropSlice> = (set, get) => ({
  cropRect: null,

  setCropRect: (rect: Rect | null) => {
    if (!rect) {
      set({ cropRect: null });
      return;
    }
    const doc = get().doc;
    if (!doc) return;
    const norm = normalize(rect);
    // 夹在文档范围内，并保证不小于最小尺寸
    const x = Math.max(0, Math.min(norm.x, doc.width - MIN_SIZE));
    const y = Math.max(0, Math.min(norm.y, doc.height - MIN_SIZE));
    set({
      cropRect: {
        x,
        y,
        width: Math.max(MIN_SIZE, Math.min(norm.width, doc.width - x)),
        height: Math.max(MIN_SIZE, Math.min(norm.height, doc.height - y)),
      },
    });
  },

  commitCrop: () => {
    const rect = get().cropRect;
    if (!rect) return;
    set({ cropRect: null });
    get().cropTo(rect);
    get().showToast('toast.cropped', 'info', { width: Math.round(rect.width), height: Math.round(rect.height) });
  },

  cancelCrop: () => set({ cropRect: null }),
});
