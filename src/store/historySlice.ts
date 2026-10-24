/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, HistorySlice } from './types';
import type { HistoryEntry, Layer, LayerDelta } from '../types';
import { createReadbackCanvas, uid } from '../engine/canvasUtils';
import type { LayerShadow, LayerScan } from '../engine/historyDelta';
import {
  applyDelta,
  metaMap,
  readShadow,
  removalDeltas,
  scanLayer,
} from '../engine/historyDelta';
import { boundsFor, withCanvas } from '../engine/layerBounds';

/**
 * 历史记录：增量模型。
 *
 * 每条记录存"这一步之后的图层顺序与属性"（绝对，几十字节）加上
 * "这一步造成的像素变化"（相对，只存变了的矩形）。
 * 整存的老做法在 4000x3000 五图层下单快照 229MB、30 步 6.7GB，会被浏览器杀掉。
 *
 * 影子副本（shadows）是上次提交时各图层的完整画面，用于算下一次的差分。
 * 它固定占约一份全量快照，是这套方案的常数开销，换掉了原来的 30 倍。
 * 像素是懒解的（见 engine/shadowImage）：打开几百图层的 PSD 时只冻结画布，
 * 谁被编辑了才为它付一次整幅回读。
 */
const HISTORY_LIMIT = 30;

/**
 * 各图层上次提交时的像素与蒙版。
 * 不放进 store，因为它不参与渲染也不该触发订阅。
 */
let shadows = new Map<string, LayerShadow>();

/** 供文档切换/关闭时清空 */
export function resetHistoryShadows(): void {
  shadows = new Map();
}

/** 用当前图层刷新影子副本 */
function refreshShadows(layers: Layer[]): void {
  const next = new Map<string, LayerShadow>();
  for (const layer of layers) next.set(layer.id, readShadow(layer));
  shadows = next;
}

/** 按增量把影子副本同步到某一步之后的状态，避免整幅重读 */
function patchShadows(deltas: LayerDelta[], layers: Layer[]): void {
  for (const layer of layers) {
    if (!shadows.has(layer.id)) shadows.set(layer.id, readShadow(layer));
  }
  for (const delta of deltas) {
    const layer = layers.find((item) => item.id === delta.layerId);
    if (!layer) {
      shadows.delete(delta.layerId);
      continue;
    }
    shadows.set(delta.layerId, readShadow(layer));
  }
  // 已不存在的图层的影子要清掉，否则内存会随撤销重做累积
  const alive = new Set(layers.map((layer) => layer.id));
  for (const id of [...shadows.keys()]) {
    if (!alive.has(id)) shadows.delete(id);
  }
}

/** 算出这一步的全部像素增量和新影子副本。hint 命中时只扫描被点名的图层 */
function collectScans(layers: Layer[], hintIds?: string[]): LayerScan[] {
  const scans: LayerScan[] = [];
  // hintIds 为空数组表示明确没有图层变化，跳过扫描
  // hintIds 为 undefined 表示没传 hint，扫描所有（向后兼容）
  const scan =
    hintIds !== undefined && hintIds.length === 0
      ? []
      : hintIds
        ? layers.filter((layer) => hintIds.includes(layer.id) || !shadows.has(layer.id))
        : layers;

  for (const layer of scan) {
    scans.push(scanLayer(layer, shadows.get(layer.id) ?? null));
  }
  // 图层被删掉时，影子里还留着它的像素，正好用来生成"消失"增量
  const alive = new Set(layers.map((layer) => layer.id));
  for (const [id, shadow] of shadows) {
    if (!alive.has(id)) {
      scans.push({ deltas: removalDeltas(id, shadow), shadow });
    }
  }
  return scans;
}

/** 用扫描结果更新影子副本，避免再来一次 getImageData */
function applyShadowScans(scans: LayerScan[], layers: Layer[]): void {
  const alive = new Set(layers.map((layer) => layer.id));
  for (const scan of scans) {
    // 只取有 deltas 的那些层的 id（removalDeltas 的返回不含 layer 本身）
    const layerId = scan.deltas[0]?.layerId;
    if (!layerId) continue;
    if (alive.has(layerId)) {
      shadows.set(layerId, scan.shadow);
    } else {
      shadows.delete(layerId);
    }
  }
  // 新增的图层（hint 里没点名、也不在上次的影子集合里）要补上影子
  for (const layer of layers) {
    if (!shadows.has(layer.id)) {
      shadows.set(layer.id, readShadow(layer));
    }
  }
}

/**
 * 按目标记录里的顺序与属性重建图层数组。
 * 像素由 applyDelta 负责，这里只管"有哪些图层、什么属性、什么次序"。
 */
function rebuildLayers(entry: HistoryEntry, current: Layer[]): Layer[] {
  const byId = new Map(current.map((layer) => [layer.id, layer]));
  return entry.order.map((id) => {
    const { hasMask, ...meta } = entry.meta[id];
    const existing = byId.get(id);
    if (existing) {
      // hasMask 说的是"目标状态该不该有蒙版"，蒙版像素由增量负责贴回。
      // 这里只保证画布存在与否对得上，否则区域增量会因为没有目标画布而丢弃。
      const mask = hasMask
        ? (existing.mask ?? createReadbackCanvas(entry.docWidth, entry.docHeight))
        : undefined;
      /*
       * 以 meta 为准，只从 existing 取像素引用，不能写成 { ...existing, ...meta }。
       *
       * meta 是「非像素属性」的完整快照（LayerMeta = Omit<Layer,'canvas'|'mask'>），
       * 而可选字段在没设过的时候压根没有这个键，缺席的键盖不掉 existing 上的旧值。
       * 那样撤销「设置图层颜色」颜色会留着，撤销任何新增的可选属性都会漏。
       */
      /*
       * bounds 的位置取自 meta（这是移动图层能被撤销的依据），
       * 尺寸只能取自这里实际拿到的画布：图层可能在之后被撑大过，
       * 而像素要等 applyDelta 才换回去。中间这一步尺寸对不上就会破坏
       * bounds.width === canvas.width 这条不变量。
       */
      return {
        ...meta,
        canvas: existing.canvas,
        bounds: boundsFor(existing.canvas, meta.bounds.x, meta.bounds.y),
        mask,
      } as Layer;
    }
    // 图层在当前状态里不存在（正在撤销一次删除），先占位，像素随后由增量贴回
    const revived = shadows.get(id);

    // 组的画布是 1x1 占位，不能按文档尺寸建，否则撤销删组之后
    // 组会凭空多出一张全尺寸空画布，白占内存还会被后续历史一份份存下来
    const blank = () =>
      meta.type === 'group'
        ? createReadbackCanvas(1, 1)
        : createReadbackCanvas(entry.docWidth, entry.docHeight);
    // 走 toCanvas 而不是 canvasFromPixels：影子还没解像素时这就是一次画布拷贝
    const canvas = revived ? revived.canvas.toCanvas() : blank();
    return {
      ...meta,
      canvas,
      // meta 记的是快照当时的位置，尺寸跟着实际造出来的画布走
      bounds: boundsFor(canvas, meta.bounds.x, meta.bounds.y),
      mask: hasMask
        ? (revived?.mask
            ? revived.mask.toCanvas()
            : createReadbackCanvas(entry.docWidth, entry.docHeight))
        : undefined,
    } as Layer;
  });
}

/**
 * 从 from 走到 to（不含 from 自身的方向差异），逐步应用增量。
 * 后退时倒序应用 before，前进时正序应用 after。
 */
function walk(history: HistoryEntry[], from: number, to: number, layers: Layer[]): void {
  if (to < from) {
    for (let i = from; i > to; i -= 1) {
      for (const delta of history[i].deltas) applyDelta(delta, layers, 'undo');
    }
    return;
  }
  for (let i = from + 1; i <= to; i += 1) {
    for (const delta of history[i].deltas) applyDelta(delta, layers, 'redo');
  }
}

/** 跳到指定记录：先按顺序/属性重建图层列表，再把像素走到位 */
function gotoEntry(get: () => EditorStore, set: (partial: Partial<EditorStore>) => void, index: number): void {
  const { history, historyIndex, layers } = get();
  if (index < 0 || index >= history.length) return;
  const entry = history[index];

  // 跳到当前所在的这一步：语义是"丢弃尚未提交的改动"，
  // 从影子副本重画即可（影子存的正是上次提交时的像素）。
  // PS 里点击历史面板当前那一行也是这个效果。
  if (index === historyIndex) {
    const reverted = rebuildLayers(entry, layers).map((layer) => {
      const shadow = shadows.get(layer.id);
      if (!shadow) return layer;
      return {
        ...withCanvas(layer, shadow.canvas.toCanvas()),
        mask: shadow.mask ? shadow.mask.toCanvas() : undefined,
      };
    });
    set({ layers: reverted, activeLayerId: entry.activeLayerId, selection: null });
    get().bumpRevision();
    return;
  }

  // 先建好目标状态下应有的图层（含撤销删除时的占位），再贴像素
  const rebuilt = rebuildLayers(entry, layers);
  walk(history, historyIndex, index, rebuilt);
  patchShadows(collectAffected(history, historyIndex, index), rebuilt);

  // 文档尺寸也要同步到目标步的状态，否则裁剪/旋转等改尺寸的操作无法撤销
  const { doc } = get();
  set({
    doc: doc ? { ...doc, width: entry.docWidth, height: entry.docHeight } : null,
    layers: rebuilt,
    activeLayerId: entry.activeLayerId,
    historyIndex: index,
    selection: null,
  });
  get().bumpRevision();
}

/** 收集两步之间涉及到的全部增量，用于同步影子副本 */
function collectAffected(history: HistoryEntry[], from: number, to: number): LayerDelta[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const all: LayerDelta[] = [];
  for (let i = lo; i <= hi; i += 1) all.push(...history[i].deltas);
  return all;
}

export const createHistorySlice: StateCreator<EditorStore, [], [], HistorySlice> = (set, get) => ({
  history: [],
  historyIndex: -1,

  pushHistory: (label, hint) => {
    const t0 = performance.now();
    const { layers, activeLayerId, doc, history, historyIndex } = get();
    if (!doc) return;

    const isFirst = history.length === 0;
    /*
     * 初始快照不扫描，deltas 恒为空。
     *
     * 依据是 walk()：后退时循环到 i > to 就停，前进时从 from + 1 起步，
     * 两个方向都碰不到目标那一步自己的 deltas。history[0] 是回退的下界，
     * 永远只会被当作「目标」，它的 deltas 一次也不会被应用。
     * 历史溢出裁剪把原来的 history[1] 顶成新的 history[0] 时同理——
     * 那条记录的 deltas 留着也照样用不到。
     *
     * 省下来的正是打开 287 图层的 PSD 时那几百次整幅 getImageData。
     * 影子副本仍然会由下面的 applyShadowScans 补齐（懒解，见 readShadow），
     * 所以「跳回当前步 = 从影子重画」这条路照旧成立。
     */
    if (isFirst) refreshShadows([]);

    const t1 = performance.now();
    const scans = isFirst ? [] : collectScans(layers, hint?.layerIds);
    const t2 = performance.now();
    const deltas = scans.flatMap((scan) => scan.deltas);
    const entry: HistoryEntry = {
      id: uid('hist'),
      label,
      labelParams: hint?.labelParams,
      labelParamKeys: hint?.labelParamKeys,
      order: layers.map((layer) => layer.id),
      meta: metaMap(layers),
      deltas,
      activeLayerId,
      docWidth: doc.width,
      docHeight: doc.height,
    };

    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(entry);
    const overflow = Math.max(0, trimmed.length - HISTORY_LIMIT);
    const next = overflow > 0 ? trimmed.slice(overflow) : trimmed;

    applyShadowScans(scans, layers);
    const t3 = performance.now();
    set({ history: next, historyIndex: next.length - 1, dirty: true });

    /*
     * 只在真的慢的时候才打点。压历史是每一步操作都要走的路径，
     * 无条件打日志的话画一笔就刷一行，真出问题时反而淹在噪音里。
     * 阈值取一帧（16ms）：超过这个数用户就能感觉到卡。
     */
    const totalMs = t3 - t0;
    if (totalMs > 16) {
      console.log(
        `[pushHistory] ${label}: scan=${(t2 - t1).toFixed(1)}ms, apply=${(t3 - t2).toFixed(1)}ms, ` +
          `total=${totalMs.toFixed(1)}ms, layers=${layers.length}, hint=${hint?.layerIds?.length ?? 'none'}`,
      );
    }
  },

  undo: () => {
    const { historyIndex } = get();
    if (historyIndex <= 0) return;
    gotoEntry(get, set, historyIndex - 1);
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;
    gotoEntry(get, set, historyIndex + 1);
  },

  jumpHistory: (index) => {
    gotoEntry(get, set, index);
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,
});
