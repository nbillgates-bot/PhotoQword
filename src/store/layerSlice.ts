/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, LayerSlice } from './types';
import type { Layer, LayerType } from '../types';
import { createReadbackCanvas, ctx2d, uid } from '../engine/canvasUtils';
import { boundsFor, docRect, expandToCover, withCanvas } from '../engine/layerBounds';
import { touchesPixels } from '../engine/layerPatch';
import { duplicateSubtree } from '../engine/layerDuplicate';
import { flatten } from '../engine/compositor';
import { descendantIds } from '../engine/layerTree';
import { renderText } from '../engine/textRender';
import { shiftRunsForEdit } from '../engine/textRuns';
import { textLayerBounds } from '../engine/textBox';
import { renderShape } from '../engine/shapeRender';
import {
  adjustmentLayerName,
  backgroundLayerName,
  copyOfName,
  newLayerName,
  textLayerName,
} from '../i18n/defaultNames';

/** 生成一个与文档同尺寸的空白图层 */
export function makeLayer(
  width: number,
  height: number,
  name: string,
  type: LayerType = 'raster',
): Layer {
  // 图层像素每压一步历史都要被读一遍差分，建的时候就把 willReadFrequently 定下来
  const canvas = createReadbackCanvas(width, height);
  return {
    id: uid('layer'),
    name,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    // 新图层默认铺满文档，与 PS 新建图层一致
    bounds: boundsFor(canvas),
    parentId: null,
  };
}

/** 按 id 取图层 */
function byId(layers: Layer[], id: string): Layer | undefined {
  return layers.find((layer) => layer.id === id);
}

export const createLayerSlice: StateCreator<EditorStore, [], [], LayerSlice> = (set, get) => ({
  layers: [],
  activeLayerId: null,

  activeLayer: () => {
    const { layers, activeLayerId } = get();
    return layers.find((layer) => layer.id === activeLayerId) ?? null;
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  insertLayer: (type = 'raster', name) => {
    const { doc, layers, locale } = get();
    if (!doc) return null;
    const layer = makeLayer(
      doc.width,
      doc.height,
      name ?? newLayerName(locale, layers.length + 1),
      type,
    );
    set({ layers: [...layers, layer], activeLayerId: layer.id });
    return layer;
  },

  addLayer: (type = 'raster', name) => {
    const layer = get().insertLayer(type, name);
    if (!layer) return null;
    // 只多了一个空图层，别的图层像素没动
    get().pushHistory('action.newLayer', { layerIds: [layer.id] });
    get().bumpRevision();
    return layer;
  },

  addAdjustmentLayer: (kind, params, name) => {
    const { doc, layers } = get();
    if (!doc) return null;
    const layer = makeLayer(doc.width, doc.height, name ?? adjustmentLayerName(get().locale, kind), 'adjustment');
    layer.adjustmentData = { kind, params };
    set({ layers: [...layers, layer], activeLayerId: layer.id });
    get().pushHistory('action.newAdjustLayer', {
      layerIds: [layer.id],
      labelParams: { name: layer.name },
    });
    get().bumpRevision();
    return layer;
  },

  setAdjustmentParams: (id, params) => {
    const { layers } = get();
    const layer = layers.find((l) => l.id === id);
    if (!layer || layer.type !== 'adjustment' || !layer.adjustmentData) return;
    const updated = { ...layer, adjustmentData: { ...layer.adjustmentData, params } };
    set({ layers: layers.map((l) => (l.id === id ? updated : l)) });
    get().bumpRevision();
  },

  addLayerFromCanvas: (canvas, name) => {
    const { doc, layers } = get();
    if (!doc) return null;
    const layer = makeLayer(doc.width, doc.height, name);
    ctx2d(layer.canvas).drawImage(canvas, 0, 0);
    set({ layers: [...layers, layer], activeLayerId: layer.id });
    get().pushHistory('action.addLayer', { layerIds: [layer.id], labelParams: { name } });
    get().bumpRevision();
    return layer;
  },

  deleteLayer: (id) => {
    const { layers } = get();
    const index = layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;

    // 删组要连里面的图层一起删，与 PS 一致
    const doomed = new Set([id, ...descendantIds(layers, id)]);
    const next = layers.filter((layer) => !doomed.has(layer.id));
    // 判断的是「删完还剩不剩像素图层」，不是删之前有几个：
    // 只剩一个组的时候文档等于空的，同样不允许
    if (next.every((layer) => layer.type === 'group')) {
      get().showToast('error.layer.keepOne', 'error');
      return;
    }

    const fallback = next[Math.min(index, next.length - 1)];
    set({ layers: next, activeLayerId: fallback?.id ?? null });
    get().pushHistory(doomed.size > 1 ? 'action.deleteGroup' : 'action.deleteLayer');
    get().bumpRevision();
  },

  duplicateLayer: (id) => {
    const source = byId(get().layers, id);
    if (!source) return null;
    const { layers, newId } = duplicateSubtree(get().layers, id, uid, (n) => copyOfName(get().locale, n));
    if (!newId) return null;

    set({ layers, activeLayerId: newId, selectedLayerIds: [newId] });
    get().pushHistory(source.type === 'group' ? 'action.duplicateGroup' : 'action.duplicateLayer');
    get().bumpRevision();
    return newId;
  },

  reorderLayer: (id, direction) => {
    const { layers } = get();
    const index = layers.findIndex((layer) => layer.id === id);
    if (index < 0) return;
    let target = index;
    if (direction === 'up') target = Math.min(layers.length - 1, index + 1);
    else if (direction === 'down') target = Math.max(0, index - 1);
    else if (direction === 'top') target = layers.length - 1;
    else target = 0;
    if (target === index) return;
    const next = [...layers];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    set({ layers: next });
    // 移动图层只改顺序不改像素，传空数组跳过扫描，不 bump revision
    get().pushHistory('action.reorderLayer', { layerIds: [] });
    // 注意：不调 bumpRevision，因为像素没变，缩略图不需要更新
  },

  updateLayer: (id, patch) => {
    set({
      layers: get().layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)),
    });
    /*
     * 换了画布或蒙版才需要重画缩略图。改可见性、不透明度、名字这类
     * 只影响画面不影响缩略图，走 bumpVisualRevision 省掉全部图层的
     * draw + toDataURL——图层多的时候点一下眼睛的卡顿就在这里。
     *
     * 注意：就地改 layer.canvas 的像素而 patch 里没有 canvas 键时，
     * 这里判不出来。那些调用点本来就要自己再调一次 bumpRevision（见
     * textTool / shapeTool），保持原样即可。
     */
    if (touchesPixels(patch)) get().bumpRevision();
    else get().bumpVisualRevision();
  },

  /*
   * 绘制类操作都在文档坐标系里写像素（画笔缓冲、填充、滤镜都是文档尺寸），
   * 而图层被移出画布后 bounds 可能只剩一角落在文档里。写之前先让画布长到
   * 「原有范围 ∪ 整个文档」，之后文档坐标减去 bounds.x/y 就是画布坐标，
   * 各工具不必各自处理偏移。
   *
   * 不写历史：调用方紧接着自己的操作会 pushHistory，画布尺寸变了
   * buildDelta 会自动退化成整存，撤销照样回得去。
   */
  expandLayerForEdit: (id) => {
    const { doc, layers } = get();
    if (!doc) return null;
    const layer = layers.find((item) => item.id === id);
    if (!layer) return null;
    // 组没有自己的像素，1x1 占位画布不该被撑成全尺寸
    if (layer.type === 'group') return layer;
    const grown = expandToCover(layer, docRect(doc.width, doc.height));
    if (grown === layer) return layer;
    set({ layers: layers.map((item) => (item.id === id ? grown : item)) });
    return grown;
  },

  setLayerOpacity: (id, opacity) => {
    get().updateLayer(id, { opacity });
  },

  setLayerBlend: (id, blendMode) => {
    get().updateLayer(id, { blendMode });
    // 混合模式是非像素属性，meta 里整存，不必扫像素
    get().pushHistory('action.blendMode', { layerIds: [] });
  },

  mergeDown: (id) => {
    const { layers, doc } = get();
    if (!doc) return;
    const index = layers.findIndex((layer) => layer.id === id);
    if (index <= 0) {
      get().showToast('error.layer.nothingBelow', 'error');
      return;
    }
    const lower = layers[index - 1];
    const upper = layers[index];

    // 组要走 mergeGroup（把整组合成一张图），向下合并处理不了它
    if (upper.type === 'group' || lower.type === 'group') {
      get().showToast('error.layer.useMergeGroup', 'error');
      return;
    }
    // 同级才能合并：跨组的上下相邻在视觉上不相邻，合了会让人莫名其妙
    if ((upper.parentId ?? null) !== (lower.parentId ?? null)) {
      get().showToast('error.layer.sameGroupOnly', 'error');
      return;
    }
    // 用 flatten 复用合成逻辑，保证混合模式/不透明度效果一致
    const merged = flatten([lower, upper], doc.width, doc.height);
    const result: Layer = {
      // flatten 产出的是文档尺寸、原点对齐的画布，所以 bounds 回到 0,0
      ...withCanvas(lower, merged, 0, 0),
      type: 'raster',
      opacity: 100,
      blendMode: 'normal',
      textData: undefined,
      shapeData: undefined,
    };
    const next = [...layers];
    next.splice(index - 1, 2, result);
    set({ layers: next, activeLayerId: result.id });
    get().pushHistory('action.mergeDown');
    get().bumpRevision();
  },

  flattenAll: () => {
    const { layers, doc } = get();
    if (!doc || layers.length === 0) return;
    // flatten 走的是 composite，组的层级与属性都会算进去
    const merged = flatten(layers, doc.width, doc.height);
    const result = makeLayer(doc.width, doc.height, backgroundLayerName(get().locale));
    ctx2d(result.canvas).drawImage(merged, 0, 0);
    set({ layers: [result], activeLayerId: result.id });
    get().pushHistory('action.flattenImage');
    get().bumpRevision();
  },

  updateTextLayer: (id, patch) => {
    const layer = get().expandLayerForEdit(id);
    if (!layer?.textData) return;
    const textData = { ...layer.textData, ...patch };
    renderText(layer.canvas, textData);
    // 段落文本的 canvas 尺寸会跟着边界框变；两种文本的 bounds 原点约定见 textBox.ts
    const bounds = textLayerBounds(layer.canvas, textData);
    set({
      layers: get().layers.map((item) => (item.id === id ? { ...item, textData, bounds } : item)),
    });
    get().bumpRevision();
  },

  updateTextDraft: (id, patch) => {
    /*
     * 和 updateTextLayer 一样要先 expandLayerForEdit：renderText 对点文本是
     * 按**文档坐标**落笔的（见 textBox.ts 的约定），画布必须先长到覆盖整个文档。
     *
     * 自己新建的文字层画布本来就是文档尺寸，这里是空操作，所以一直没暴露；
     * 但 PSD 导入的文字层画布只有自己那一小块紧边界，原点还在 (left, top)。
     * 少了这一步，一敲键盘就是：文字按文档坐标画到小画布上（多偏移一次，
     * 甚至整个画到画布外看不见），紧接着 textLayerBounds 又把点文本的 bounds
     * 归零到 (0,0) —— 于是文字当场跳位。
     */
    const layer = get().expandLayerForEdit(id);
    if (!layer?.textData) return;
    const textData = { ...layer.textData, ...patch };

    /*
     * 内容变了就把字符级颜色跟着挪，并给新输入的字定色。
     *
     * 少了这一步：在一段彩色文字前面插一个字，后面所有颜色都会错位一格 ——
     * 颜色区间是按字符下标存的，下标全体右移了而区间没动。
     * patch 自带 colorRuns 时（上色动作本身）不再挪，那是调用方算好的结果。
     */
    if (patch.content !== undefined && patch.colorRuns === undefined) {
      textData.colorRuns = shiftRunsForEdit(
        layer.textData.colorRuns,
        layer.textData.content,
        patch.content,
        get().pendingTextColor,
      );
    }

    // 图层名跟着内容走，与 PS 一致；内容清空时退回默认名
    const name = textData.content.trim().slice(0, 12) || textLayerName(get().locale);
    renderText(layer.canvas, textData);
    // 同上，bounds 原点按 textBox.ts 的约定算
    const bounds = textLayerBounds(layer.canvas, textData);
    set({
      layers: get().layers.map((item) =>
        item.id === id ? { ...item, textData, bounds, name } : item,
      ),
    });
  },

  updateShapeLayer: (id, patch) => {
    const layer = get().expandLayerForEdit(id);
    if (!layer?.shapeData) return;
    const shapeData = { ...layer.shapeData, ...patch };
    renderShape(layer.canvas, shapeData);
    set({
      layers: get().layers.map((item) => (item.id === id ? { ...item, shapeData } : item)),
    });
    get().bumpRevision();
  },

  rasterizeLayer: (id) => {
    const layer = get().layers.find((item) => item.id === id);
    if (!layer || layer.type === 'raster') return;
    // 组没有自己的像素，栅格化它等于合并组，交给 mergeGroup
    if (layer.type === 'group') {
      get().mergeGroup(id);
      return;
    }
    get().updateLayer(id, { type: 'raster', textData: undefined, shapeData: undefined });
    get().pushHistory('action.rasterizeLayer');
  },
});
