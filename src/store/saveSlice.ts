/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, SaveSlice } from './types';
import { stripKnownExt } from '../engine/formats/saveNaming';

/**
 * 保存目标。
 *
 * 只存「存到哪」这件事，真正的写盘在 hooks/useSaveFile.ts ——
 * 那边要动态 import ag-psd，属于副作用，不该进 store。
 */
export const createSaveSlice: StateCreator<EditorStore, [], [], SaveSlice> = (set, get) => ({
  saveTarget: null,

  setSaveTarget: (target) => set({ saveTarget: target }),

  clearSaveTarget: () => set({ saveTarget: null }),

  /**
   * 存盘成功后调。顺手把文档名同步成文件名的主干部分，
   * 与 PS 一致：存储为「封面终稿.psd」之后，标题栏和状态栏显示的就是「封面终稿」。
   */
  markSaved: (target) => {
    const doc = get().doc;
    const base = stripKnownExt(target.fileName);
    set({
      saveTarget: target,
      dirty: false,
      doc: doc && base ? { ...doc, name: base } : doc,
    });
  },
});
