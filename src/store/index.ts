/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { create } from 'zustand';
import type { EditorStore } from './types';
import { createOverlaySlice } from './overlaySlice';
import { createDocSlice } from './docSlice';
import { createLayerSlice } from './layerSlice';
import { createLayerSelectSlice } from './layerSelectSlice';
import { createGroupSlice } from './groupSlice';
import { createMaskSlice } from './maskSlice';
import { createSelectionSlice } from './selectionSlice';
import { createHistorySlice } from './historySlice';
import { createToolSlice } from './toolSlice';
import { createViewSlice } from './viewSlice';
import { createUiSlice } from './uiSlice';
import { createCropSlice } from './cropSlice';
import { createTransformSlice } from './transformSlice';
import { createEffectsSlice } from './effectsSlice';
import { createAdjustSlice } from './adjustSlice';
import { createLocaleSlice } from './localeSlice';
import { createGuideSlice } from './guideSlice';
import { createSaveSlice } from './saveSlice';
import { createTouchSlice } from './touchSlice';

/**
 * 编辑器全局 store。按职责拆成若干切片，
 * 切片之间通过 get() 互相调用（如 layer 操作后自动 pushHistory）。
 */
export const useEditorStore = create<EditorStore>()((...args) => ({
  ...createDocSlice(...args),
  ...createLayerSlice(...args),
  ...createLayerSelectSlice(...args),
  ...createGroupSlice(...args),
  ...createMaskSlice(...args),
  ...createSelectionSlice(...args),
  ...createHistorySlice(...args),
  ...createToolSlice(...args),
  ...createViewSlice(...args),
  ...createUiSlice(...args),
  ...createOverlaySlice(...args),
  ...createCropSlice(...args),
  ...createTransformSlice(...args),
  ...createEffectsSlice(...args),
  ...createAdjustSlice(...args),
  ...createLocaleSlice(...args),
  ...createGuideSlice(...args),
  ...createSaveSlice(...args),
  ...createTouchSlice(...args),
}));

export type { EditorStore } from './types';
