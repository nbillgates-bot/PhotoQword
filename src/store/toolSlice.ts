/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, ToolSlice } from './types';
import type { ToolOptions } from '../types/tools';
import { applyRunColor } from '../engine/textRuns';

export const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brushSize: 30,
  brushHardness: 80,
  brushOpacity: 100,
  brushShape: 'round',

  eraserSize: 40,
  eraserHardness: 60,
  eraserOpacity: 100,

  selectionMode: 'new',
  featherRadius: 0,
  wandTolerance: 30,
  wandSampleSize: 1,
  wandContiguous: true,
  wandSampleAllLayers: false,
  marqueeStyle: 'normal',
  marqueeRatioW: 1,
  marqueeRatioH: 1,
  marqueeSizeW: 100,
  marqueeSizeH: 100,
  selectionAntiAlias: true,

  bucketTolerance: 30,
  bucketContiguous: true,

  gradientKind: 'linear',
  gradientReverse: false,
  gradientOpacity: 100,
  gradientMode: 'source-over',

  effectSize: 40,
  effectStrength: 50,

  shapeKind: 'rect',
  shapeFilled: true,
  shapeStrokeWidth: 0,
  shapeRadius: 0,
  shapePoints: 5,

  textFontFamily: 'Arial',
  textFontSize: 48,
  textFontWeight: 400,
  textBold: false,
  textItalic: false,
  textUnderline: false,
  textAlign: 'left',
};

export const createToolSlice: StateCreator<EditorStore, [], [], ToolSlice> = (set, get) => ({
  activeTool: 'move',
  previousTool: 'brush',
  toolOptions: DEFAULT_TOOL_OPTIONS,
  foreground: '#4a9eff',
  background: '#ffffff',
  editingTextLayer: null,
  textDragRect: null,
  textSelection: null,
  pendingTextColor: null,
  textFocusRequest: 0,

  setTool: (tool) => {
    const current = get().activeTool;
    const state = get();

    // 退出文字编辑模式
    if (state.editingTextLayer) {
      state.exitTextEdit();
    }

    /*
     * 与 PS 一致：自由变换没确认时切工具，检查是否真的有改动。
     * 如果图层没有任何变换（位置、尺寸、角度、斜切都没变），直接取消并切换，
     * 不弹对话框。只有真正改动过才问用户要不要应用。
     */
    if (state.transformSession && tool !== 'transform' && current === 'transform') {
      const session = state.transformSession;
      const hasChanges =
        session.state.rect.x !== session.originalRect.x ||
        session.state.rect.y !== session.originalRect.y ||
        session.state.rect.width !== session.originalRect.width ||
        session.state.rect.height !== session.originalRect.height ||
        session.state.angle !== 0 ||
        session.state.skewX !== 0 ||
        session.state.skewY !== 0;

      if (hasChanges) {
        // 有改动，弹框让用户选
        state.openDialog('confirm-transform', tool);
        return;
      } else {
        // 没有改动，直接取消并切换
        state.cancelTransform();
        // cancelTransform 内部会调 setTool(previousTool)，这里不用再调
        return;
      }
    }

    /*
     * 与 PS 一致：裁剪框没确认时切工具，弹框问「要裁剪图像吗？」，
     * 由用户选裁剪 / 不裁剪 / 取消。
     * 同样必须提前返回，避免 cropTool.onDeactivate 先跑掉裁剪框。
     */
    if (state.cropRect && tool !== 'crop' && current === 'crop') {
      state.openDialog('confirm-crop', tool);
      return;
    }

    // 切到 transform 之前记录当前工具，变换结束时要切回去
    if (tool === 'transform' && current !== 'transform') {
      set({ activeTool: tool, previousTool: current });
    } else {
      set({ activeTool: tool });
    }
  },

  setToolOption: (key, value) =>
    set((state) => ({ toolOptions: { ...state.toolOptions, [key]: value } })),

  setForeground: (color) => set({ foreground: color }),
  setBackground: (color) => set({ background: color }),
  swapColors: () => set({ foreground: get().background, background: get().foreground }),
  resetColors: () => set({ foreground: '#000000', background: '#ffffff' }),

  enterTextEdit: (layerId) => {
    // 进编辑时清掉上一轮遗留的选区与待用色，免得新图层套用上一次的颜色
    set({ editingTextLayer: layerId, textSelection: null, pendingTextColor: null });
  },

  setTextSelection: (selection) => {
    const previous = get().textSelection;
    // 光标一动就作废待用色，对齐 PS：颜色只对「点颜色时那个插入点」生效
    const moved =
      previous && selection
        ? previous.start !== selection.start || previous.end !== selection.end
        : previous !== selection;
    set(moved ? { textSelection: selection, pendingTextColor: null } : { textSelection: selection });
  },

  requestTextFocus: () => set((state) => ({ textFocusRequest: state.textFocusRequest + 1 })),

  applyTextColor: (color) => {
    const { editingTextLayer, textSelection, activeLayer } = get();
    const layer = editingTextLayer
      ? get().layers.find((item) => item.id === editingTextLayer)
      : activeLayer();
    if (layer?.type !== 'text' || !layer.textData) return;

    // 没在编辑：PS 里此时改的是整层文字颜色，字符级样式一并清掉
    if (!editingTextLayer) {
      get().updateTextLayer(layer.id, { color, colorRuns: [] });
      get().pushHistory('action.textColor', { layerIds: [layer.id] });
      return;
    }

    // 编辑中但只有光标：记成待用色，等下次输入
    if (!textSelection || textSelection.end <= textSelection.start) {
      set({ pendingTextColor: color });
      get().requestTextFocus();
      return;
    }

    /*
     * 编辑中且选了字：只染选中那几个字。
     *
     * 走 updateTextDraft 而不是 updateTextLayer —— 编辑期间图层被 CanvasArea
     * 过滤掉不参与合成，画面上显示的是 textarea，此时渲染 canvas 是白费功夫，
     * 真正落像素由 exitTextEdit 统一做（见 store/types.ts 对 updateTextDraft 的说明）。
     */
    const runs = applyRunColor(
      layer.textData.colorRuns,
      textSelection.start,
      textSelection.end,
      color,
    );
    get().updateTextDraft(layer.id, { colorRuns: runs });
    /*
     * 全选着改颜色时顺手把基色也改掉。
     *
     * 不改的话：整段被 runs 盖住，看着是新颜色，但之后在末尾接着打字，
     * 新字符落在 runs 之外露出旧基色 —— 用户会觉得「刚设的颜色没生效」。
     */
    if (textSelection.start === 0 && textSelection.end >= layer.textData.content.length) {
      get().updateTextDraft(layer.id, { color });
    }
    get().requestTextFocus();
  },

  exitTextEdit: () => {
    const layerId = get().editingTextLayer;
    if (!layerId) return;

    /*
     * 先清编辑标记再落像素：CanvasArea 在编辑期间把这个图层从合成里过滤掉
     * （画面上显示的是 textarea），标记还在的话渲染完也看不见。
     */
    set({ editingTextLayer: null, textSelection: null, pendingTextColor: null });

    const layer = get().layers.find((item) => item.id === layerId);
    if (layer?.type === 'text' && layer.textData) {
      // 空 patch 走 updateTextLayer，是为了复用它的 expandLayerForEdit + renderText + bumpRevision
      get().updateTextLayer(layerId, {});
    }
    // 只有这一个图层的像素变了，带上 hint 免得历史去扫全部图层
    // （90 层的 PSD 里不带 hint 一次扫描要 190ms，用户能感觉到卡）
    get().pushHistory('action.editText', { layerIds: [layerId] });
  },

  setTextDragRect: (rect) => {
    set({ textDragRect: rect });
  },
});
