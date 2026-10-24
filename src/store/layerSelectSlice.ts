/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, LayerSelectSlice } from './types';
import { normalizeSelection, resolveSelection } from '../engine/layerSelection';
import { isAncestor, revealAncestors } from '../engine/layerTree';
import { canClip } from '../engine/clipping';
import { isLocked, LOCK_FIELD, LOCK_LABEL, UNLOCK_LABEL } from '../engine/layerLock';

export const createLayerSelectSlice: StateCreator<EditorStore, [], [], LayerSelectSlice> = (
  set,
  get,
) => ({
  selectedLayerIds: [],
  soloLayerId: null,

  selectLayer: (id, mode = 'set') => {
    const { layers, selectedLayerIds, activeLayerId } = get();
    const next = resolveSelection(layers, selectedLayerIds, activeLayerId, id, mode);
    /*
     * 命中的图层可能藏在折叠的组里，滚动到它要先把路开出来。
     * 面板渲染只有 panelRows 给的那些行，折叠的子图层连 DOM 元素都没有，
     * querySelector 找不到也就滚不过去。这和 PS 的表现一致：
     * 画布右键选一个藏着的图层，面板会一路展开到能见到它为止。
     *
     * 只对最终的活动层做，不对整个多选集合做：多选几十个，每一层都开一遍
     * 就成了「把所有组全部展开」，看起来很怪也不好收回去。
     * PS 对批量选中也只是展开活动层那条路径，我们照做。
     */
    const revealed = next.activeId ? revealAncestors(layers, next.activeId) : layers;
    set({ layers: revealed, selectedLayerIds: next.ids, activeLayerId: next.activeId });
  },

  selectedLayers: () => {
    const { layers, selectedLayerIds, activeLayerId } = get();
    const ids = new Set(normalizeSelection(layers, selectedLayerIds, activeLayerId));
    // 按图层数组序返回，批量操作依赖稳定顺序
    return layers.filter((layer) => ids.has(layer.id));
  },

  setSelectedOpacity: (opacity) => {
    const ids = new Set(get().selectedLayers().map((layer) => layer.id));
    if (ids.size === 0) return;
    set({
      layers: get().layers.map((layer) => (ids.has(layer.id) ? { ...layer, opacity } : layer)),
    });
    get().bumpRevision();
  },

  setSelectedBlend: (blendMode) => {
    const ids = new Set(get().selectedLayers().map((layer) => layer.id));
    if (ids.size === 0) return;
    set({
      layers: get().layers.map((layer) => (ids.has(layer.id) ? { ...layer, blendMode } : layer)),
    });
    // 混合模式是非像素属性，meta 里整存，不必扫像素
    get().pushHistory('action.blendMode', { layerIds: [] });
    get().bumpRevision();
  },

  setSelectedColor: (color) => {
    const ids = new Set(get().selectedLayers().map((layer) => layer.id));
    if (ids.size === 0) return;
    set({
      layers: get().layers.map((layer) => (ids.has(layer.id) ? { ...layer, color } : layer)),
    });
    // 图层颜色标记只是面板上的着色，不参与渲染，更不动像素
    get().pushHistory(color ? 'action.layerColor' : 'action.clearLayerColor', { layerIds: [] });
  },

  deleteSelectedLayers: () => {
    const { layers } = get();
    const targets = get().selectedLayers();
    if (targets.length === 0) return;

    // 删组要连子图层一起删；选中集合里父子都在时并集自动去重
    const doomed = new Set<string>();
    for (const layer of targets) {
      doomed.add(layer.id);
      for (const kid of layers) {
        if (isAncestor(layers, layer.id, kid.id)) doomed.add(kid.id);
      }
    }
    const next = layers.filter((layer) => !doomed.has(layer.id));
    // 与 deleteLayer 同一条判断：删完必须还剩至少一个像素图层
    if (next.every((layer) => layer.type === 'group')) {
      get().showToast('error.layer.keepOne', 'error');
      return;
    }

    // 活动层顺移到被删位置附近，与单层删除的手感一致
    const index = layers.findIndex((layer) => doomed.has(layer.id));
    const fallback = next[Math.min(Math.max(index, 0), next.length - 1)];
    set({
      layers: next,
      activeLayerId: fallback?.id ?? null,
      selectedLayerIds: fallback ? [fallback.id] : [],
      soloLayerId: doomed.has(get().soloLayerId ?? '') ? null : get().soloLayerId,
    });
    get().pushHistory(doomed.size > targets.length ? 'action.deleteGroup' : 'action.deleteLayer');
    get().bumpRevision();
  },

  draggingLayerId: null,

  beginLayerDrag: (id) => set({ draggingLayerId: id }),

  endLayerDrag: () => set({ draggingLayerId: null }),

  /*
   * 落到底部按钮上的拖拽，生效范围按 PS 的规矩：
   * 拖的那层本来就在多选集合里就整批生效，否则只对被拖的这一个生效。
   * 拖拽不改变选中状态，所以不能先 selectLayer 再走批量动作。
   *
   * batch / single 分别是「对整个选中集合」和「对单个图层」的动作。
   */
  dropDraggedLayer: (batch, single) => {
    const id = get().draggingLayerId;
    if (!id) return;
    set({ draggingLayerId: null });

    const inSelection = get()
      .selectedLayers()
      .some((layer) => layer.id === id);
    if (inSelection) batch();
    else single(id);
  },

  dropLayerToTrash: () => {
    get().dropDraggedLayer(
      () => get().deleteSelectedLayers(),
      (id) => get().deleteLayer(id),
    );
  },

  dropLayerToCopy: () => {
    get().dropDraggedLayer(
      () => get().duplicateSelectedLayers(),
      (id) => get().duplicateLayer(id),
    );
  },

  duplicateSelectedLayers: () => {
    const targets = get().selectedLayers();
    if (targets.length === 0) return;
    /*
     * 逐个复制。多选时会产生 N 条历史（PS 是一条），
     * 合成一条要把 duplicateLayer 拆成「不记历史的复制」+ 外层统一提交，
     * 等有第二个调用方需要时再拆，现在不值得为它动 layerSlice。
     */
    for (const layer of targets) get().duplicateLayer(layer.id);
  },

  groupSelectedLayers: () => {
    const targets = get().selectedLayers();
    if (targets.length === 0) return;
    // groupLayers 自己会滤掉祖先也在集合里的那些，这里直接全传
    const group = get().groupLayers(targets.map((layer) => layer.id));
    if (group) set({ selectedLayerIds: [group.id] });
  },

  toggleLayerClipped: (id) => {
    const { layers } = get();
    const layer = layers.find((item) => item.id === id);
    if (!layer) return;
    const clipped = !layer.clipped;
    if (clipped && !canClip(layers, id)) {
      get().showToast('error.layer.noClipBase', 'error');
      return;
    }
    set({ layers: layers.map((item) => (item.id === id ? { ...item, clipped } : item)) });
    // clipped 是非像素属性，剪贴关系在合成时才生效，图层像素本身没动
    get().pushHistory(clipped ? 'action.createClippingMask' : 'action.releaseClippingMask', {
      layerIds: [],
    });
    get().bumpRevision();
  },

  toggleClipped: () => {
    const targets = get().selectedLayers();
    if (targets.length === 0) return;
    const { layers } = get();

    /*
     * 按活动层的当前状态决定整批是「创建」还是「释放」，与 PS 的
     * Ctrl+Alt+G 一致：它是一个开关，不是逐层各自取反。
     */
    const active = layers.find((layer) => layer.id === get().activeLayerId);
    const clipped = !(active?.clipped ?? false);

    // 创建时滤掉同级最底那些（没有基底可剪）；释放不受限制
    const ids = new Set(
      targets.filter((layer) => !clipped || canClip(layers, layer.id)).map((layer) => layer.id),
    );
    if (ids.size === 0) {
      get().showToast('error.layer.noClipBase', 'error');
      return;
    }

    set({ layers: layers.map((layer) => (ids.has(layer.id) ? { ...layer, clipped } : layer)) });
    // 同上：clipped 只影响合成方式，不动像素
    get().pushHistory(clipped ? 'action.createClippingMask' : 'action.releaseClippingMask', {
      layerIds: [],
    });
    get().bumpRevision();
  },

  toggleSelectedLock: (kind) => {
    const targets = get().selectedLayers();
    if (targets.length === 0) return;
    const { layers } = get();

    /*
     * 与不透明度、混合模式一样：按活动层的状态定整批的目标值，
     * 而不是逐层取反。PS 点锁定栏也是这个语义。
     */
    const active = layers.find((layer) => layer.id === get().activeLayerId) ?? targets[0];
    const next = !isLocked(active, kind);
    const field = LOCK_FIELD[kind];
    const ids = new Set(targets.map((layer) => layer.id));
    set({
      layers: layers.map((layer) =>
        ids.has(layer.id) ? { ...layer, [field]: next } : layer,
      ),
    });
    // 锁定标记是非像素属性，meta 里整存
    get().pushHistory(next ? LOCK_LABEL[kind] : UNLOCK_LABEL[kind], { layerIds: [] });
  },

  toggleSolo: (id) => {
    if (!get().layers.some((layer) => layer.id === id)) return;
    // 已经 solo 在这一层就退出，solo 在别层就换过来
    set({ soloLayerId: get().soloLayerId === id ? null : id });
    get().bumpRevision();
  },

  exitSolo: () => {
    if (get().soloLayerId === null) return;
    set({ soloLayerId: null });
    get().bumpRevision();
  },
});
