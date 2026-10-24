/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, ViewSlice } from './types';
import { clamp } from '../engine/canvasUtils';
import { clampPan, panForFocusZoom } from '../engine/viewportRect';

export const MIN_ZOOM = 0.02;
export const MAX_ZOOM = 32;

/** 常用缩放档位，供放大/缩小按钮吸附 */
const ZOOM_STEPS = [
  0.02, 0.05, 0.08, 0.13, 0.17, 0.25, 0.33, 0.5, 0.67, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32,
];

function nextStep(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > current + 1e-6) ?? MAX_ZOOM;
  }
  const lower = [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6);
  return lower ?? MIN_ZOOM;
}

/**
 * 夹过边界的 pan 状态片段。
 *
 * 所有改 pan 的入口都走这里，边界规则才只有一份。没有文档时原样返回——
 * 这时没有文档尺寸可参照，夹了只会得到假值。
 */
function panState(
  state: EditorStore,
  x: number,
  y: number,
  /** 视口尺寸覆盖值：setViewportSize 时 state 里还是旧尺寸，必须显式传新的 */
  viewport = state.viewportSize,
): { panX: number; panY: number } {
  if (!state.doc) return { panX: x, panY: y };
  const pan = clampPan({
    viewport,
    docWidth: state.doc.width,
    docHeight: state.doc.height,
    zoom: state.zoom,
    panX: x,
    panY: y,
  });
  return { panX: pan.x, panY: pan.y };
}

export const createViewSlice: StateCreator<EditorStore, [], [], ViewSlice> = (set, get) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  showRulers: true,
  showGrid: false,
  showTransparencyGrid: true,
  // 与 PS 一致：图层边缘默认关着，要看时从「视图 > 显示 > 图层边缘」开
  showLayerEdges: false,
  cursorPos: null,
  altPressed: false,

  viewportSize: { width: 0, height: 0 },
  setViewportSize: (size) => {
    // 视口变了，pan 上限跟着变，原来合法的 pan 可能越界，重新夹一遍
    set({ viewportSize: size, ...panState(get(), get().panX, get().panY, size) });
  },

  setZoom: (zoom, focus) => {
    const state = get();
    const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    if (!state.doc) {
      set({ zoom: next });
      return;
    }
    const geometry = {
      viewport: state.viewportSize,
      docWidth: state.doc.width,
      docHeight: state.doc.height,
      panX: state.panX,
      panY: state.panY,
    };
    // 没给焦点就以视口中心为基点，这也是 PS 里 Ctrl +/- 的行为
    const anchor = focus ?? {
      x: state.viewportSize.width / 2,
      y: state.viewportSize.height / 2,
    };
    const pan = panForFocusZoom({ ...geometry, fromZoom: state.zoom, toZoom: next, focus: anchor });
    set({ zoom: next, panX: pan.x, panY: pan.y });
  },

  zoomIn: (focus) => get().setZoom(nextStep(get().zoom, 1), focus),
  zoomOut: (focus) => get().setZoom(nextStep(get().zoom, -1), focus),

  fitToScreen: (viewport) => {
    const { doc } = get();
    if (!doc) return;
    const padding = 48;
    const scale = Math.min(
      (viewport.width - padding) / doc.width,
      (viewport.height - padding) / doc.height,
    );
    // 顺手同步视口尺寸：这个 action 拿到的尺寸一定是最新的，
    // 而它可能早于 ResizeObserver 首次回调（打开文档时自动适应窗口）
    set({
      viewportSize: viewport,
      zoom: clamp(scale, MIN_ZOOM, MAX_ZOOM),
      panX: 0,
      panY: 0,
    });
  },

  actualPixels: () => set({ zoom: 1, panX: 0, panY: 0 }),
  setPan: (x, y) => set(panState(get(), x, y)),
  panBy: (dx, dy) => set(panState(get(), get().panX + dx, get().panY + dy)),

  viewInteracting: false,
  setViewInteracting: (interacting) => {
    // 值没变就不写：起手那一下会连着来好几个事件，每个都 set 等于白触发重渲染
    if (get().viewInteracting === interacting) return;
    set({ viewInteracting: interacting });
  },

  /*
   * 缩放与平移在同一次 set 里落地，保证「一帧一次重渲染」。
   *
   * 顺序是「先按焦点缩放、再叠平移增量」：反过来的话平移量会被当成缩放前的
   * 位移，缩放中心就跑了。两步之间不写 state，所以中间态不会上屏。
   */
  nudgeView: ({ zoomFactor, panX: dx, panY: dy, focus }) => {
    const state = get();
    if (!state.doc) return;

    let zoom = state.zoom;
    let panX = state.panX;
    let panY = state.panY;

    if (zoomFactor !== 1) {
      zoom = clamp(state.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM);
      const anchor = focus ?? {
        x: state.viewportSize.width / 2,
        y: state.viewportSize.height / 2,
      };
      const pan = panForFocusZoom({
        viewport: state.viewportSize,
        docWidth: state.doc.width,
        docHeight: state.doc.height,
        panX,
        panY,
        fromZoom: state.zoom,
        toZoom: zoom,
        focus: anchor,
      });
      panX = pan.x;
      panY = pan.y;
    }

    // pan 的边界依赖新的 zoom，所以夹的时候要用它，不能用 state 里的旧值
    const clamped = clampPan({
      viewport: state.viewportSize,
      docWidth: state.doc.width,
      docHeight: state.doc.height,
      zoom,
      panX: panX + dx,
      panY: panY + dy,
    });
    set({ zoom, panX: clamped.x, panY: clamped.y });
  },
  toggleRulers: () => set({ showRulers: !get().showRulers }),
  toggleGrid: () => set({ showGrid: !get().showGrid }),
  toggleTransparencyGrid: () => set({ showTransparencyGrid: !get().showTransparencyGrid }),
  toggleLayerEdges: () => set({ showLayerEdges: !get().showLayerEdges }),
  setCursorPos: (pos) => set({ cursorPos: pos }),

  setAltPressed: (pressed) => set({ altPressed: pressed }),
});
