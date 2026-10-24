/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, GuideSlice } from './types';
import type { Guide } from '../types';

let guideSeed = 1;
function nextGuideId() {
  return `guide-${guideSeed++}`;
}

export const createGuideSlice: StateCreator<EditorStore, [], [], GuideSlice> = (set) => ({
  guides: [],
  showGuides: true,

  addGuide: (orientation, position) => {
    const guide: Guide = {
      id: nextGuideId(),
      orientation,
      position,
    };
    set((state) => ({ guides: [...state.guides, guide] }));
    // 返回 id 让调用方能接着拖这条新参考线
    return guide.id;
  },

  moveGuide: (id, position) => {
    set((state) => ({
      guides: state.guides.map((g) => (g.id === id ? { ...g, position } : g)),
    }));
  },

  deleteGuide: (id) => {
    set((state) => ({
      guides: state.guides.filter((g) => g.id !== id),
    }));
  },

  clearGuides: () => {
    set({ guides: [] });
  },

  toggleGuides: () => {
    set((state) => ({ showGuides: !state.showGuides }));
  },
});
