/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, UiSlice } from './types';
import { uid } from '../engine/canvasUtils';
import { DEFAULT_LAYER_FILTER } from '../engine/layerFilter';
import { readPanelWidth, storePanelWidth } from '../engine/panelPrefs';
import { clampPanelWidth } from '../engine/panelWidth';

/**
 * 初始面板宽度。读存过的值，读不到给默认。
 *
 * 视口宽度用 window.innerWidth：这一步在 store 创建时跑，那时还没有任何组件
 * 挂载，拿不到真正的布局宽度。差别只影响「上次存的值要不要收窄」这一次夹取，
 * 之后第一次拖动就会按真实宽度重新夹。SSR 或测试环境没有 window 时退回默认。
 */
const initialPanelWidth = readPanelWidth(
  typeof window === 'undefined' ? 1600 : window.innerWidth,
);

export const createUiSlice: StateCreator<EditorStore, [], [], UiSlice> = (set, get) => ({
  activeDialog: null,
  dialogPayload: null,
  toast: null,
  progress: null,

  // 面板布局状态
  historyGroupRatio: 0.3, // 历史组占 30%，图层组占 70%
  upperPanelTab: 'history',
  lowerPanelTab: 'layers',
  mobileIconMode: true, // 窄屏默认收起成图标轨，画布拿到最大宽度
  mobilePanelTab: 'layers', // 展开时先给图层：PS 里它是最主要的工作区

  rightPanelTab: 'layers', // 已废弃，兼容保留
  layerFilter: DEFAULT_LAYER_FILTER,
  // 与 PS 默认一致：小缩览图 + 图层边界
  layerThumbSize: 'small',
  layerThumbClip: 'bounds',

  openDialog: (id, payload = null) => set({ activeDialog: id, dialogPayload: payload }),
  closeDialog: () => set({ activeDialog: null, dialogPayload: null }),

  showToast: (message, kind = 'info', params, paramKeys) => {
    const toast = { id: uid('toast'), message, params, paramKeys, kind };
    set({ toast });
    // 自动消失；用 id 比对避免把后续的 toast 误清掉
    window.setTimeout(() => {
      set((state) => (state.toast?.id === toast.id ? { toast: null } : state));
    }, 2600);
  },

  beginProgress: (progress) => set({ progress }),

  /*
   * 任务已经结束（progress 为 null）时必须什么都不做。
   * 逐层解码是异步的，最后一次 onProgress 有可能排在 endProgress 之后到，
   * 那时候 set 一下会把已经关掉的进度窗又开回来，且再没人来关它。
   */
  updateProgress: (patch) =>
    set((state) => (state.progress ? { progress: { ...state.progress, ...patch } } : state)),

  endProgress: () => set({ progress: null }),

  setHistoryGroupRatio: (ratio) => {
    // 夹到合理范围：历史组至少 10%、至多 90%
    const clamped = Math.max(0.1, Math.min(0.9, ratio));
    set({ historyGroupRatio: clamped });
  },

  setUpperPanelTab: (tab) => set({ upperPanelTab: tab }),
  setLowerPanelTab: (tab) => set({ lowerPanelTab: tab }),

  toggleMobileIconMode: () => set((state) => ({ mobileIconMode: !state.mobileIconMode })),

  openMobilePanel: (tab) => set({ mobilePanelTab: tab, mobileIconMode: false }),

  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  /*
   * 改任一条件时自动打开总开关：用户去动过滤栏就是想筛，
   * 让他改完还得再点一次开关是多余的一步。PS 也是这样。
   * 唯一例外是显式传 enabled 的那次调用（点开关本身）。
   */
  setLayerFilter: (patch) =>
    set((state) => ({
      layerFilter: {
        ...state.layerFilter,
        enabled: patch.enabled ?? true,
        ...patch,
      },
    })),

  setLayerThumbSize: (layerThumbSize) => set({ layerThumbSize }),
  setLayerThumbClip: (layerThumbClip) => set({ layerThumbClip }),

  panelWidth: initialPanelWidth,

  setPanelWidth: (width, viewportWidth) => {
    const next = clampPanelWidth(width, viewportWidth);
    // 值没变就不写：拖动中每帧都会调，夹在边界上时白触发一轮重渲染
    if (get().panelWidth === next) return;
    set({ panelWidth: next });
    storePanelWidth(next);
  },
});
