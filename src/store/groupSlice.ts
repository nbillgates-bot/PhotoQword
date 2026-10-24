/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, GroupSlice } from './types';
import type { Layer } from '../types';
import { createReadbackCanvas, uid } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';
import { childrenOf, descendantIds, isAncestor, moveSubtree } from '../engine/layerTree';
import { boundsFor } from '../engine/layerBounds';
import { duplicateSubtree } from '../engine/layerDuplicate';
import { copyOfName, newGroupName } from '../i18n/defaultNames';

/**
 * 图层组的状态操作。
 *
 * 组不含像素，画布是 1x1 占位而不是与文档同尺寸：
 * 组的画布永远不参与绘制，占位只为让历史增量、影子副本这些
 * 「每个图层都有画布」的既有逻辑不必到处加特判。
 * 分配文档尺寸的空画布会白占内存，还会被历史记录一份份存下来。
 */
export function makeGroup(name: string, parentId: string | null = null): Layer {
  // 1x1 也照样声明：占位画布同样会被历史差分扫到，声明在创建时才有效
  const canvas = createReadbackCanvas(1, 1);
  return {
    id: uid('group'),
    name,
    type: 'group',
    visible: true,
    locked: false,
    opacity: 100,
    // PS 里新建组默认穿透
    blendMode: 'pass-through',
    canvas,
    // 组的画布是 1x1 占位，bounds 跟着它，保持"bounds 恒等于画布尺寸"的不变量
    bounds: boundsFor(canvas),
    parentId,
    collapsed: false,
  };
}

export const createGroupSlice: StateCreator<EditorStore, [], [], GroupSlice> = (set, get) => ({
  addGroup: (name) => {
    const { doc, layers, activeLayerId } = get();
    if (!doc) return null;

    const active = layers.find((layer) => layer.id === activeLayerId) ?? null;
    const group = makeGroup(name ?? newGroupName(get().locale, countGroups(layers) + 1), active?.parentId ?? null);
    // 放在当前图层上方；没有当前图层就放到最顶
    const at = active ? layers.findIndex((layer) => layer.id === active.id) + 1 : layers.length;
    const next = [...layers];
    next.splice(at, 0, group);

    set({ layers: next, activeLayerId: group.id });
    // 只多了一个空组（1×1 占位画布），别的图层像素没动
    get().pushHistory('action.newGroup', { layerIds: [group.id] });
    get().bumpRevision();
    return group;
  },

  groupLayers: (ids, name) => {
    const { doc, layers } = get();
    if (!doc || ids.length === 0) return null;

    // 祖先已经在选中集里的，跟着祖先一起走就行，单独再移一次会打乱层级
    const roots = ids.filter(
      (id) => layers.some((l) => l.id === id) && !ids.some((o) => o !== id && isAncestor(layers, o, id)),
    );
    if (roots.length === 0) return null;

    // 按数组顺序排，保持它们原来的上下关系
    const ordered = layers.filter((layer) => roots.includes(layer.id)).map((layer) => layer.id);
    const topId = ordered[ordered.length - 1];
    const top = layers.find((layer) => layer.id === topId)!;

    const group = makeGroup(name ?? newGroupName(get().locale, countGroups(layers) + 1), top.parentId ?? null);
    // 组插在最上面那个图层的位置，整组就落在原来的视觉位置上
    const at = layers.findIndex((layer) => layer.id === topId);
    let next = [...layers];
    next.splice(at + 1, 0, group);

    // 自底向上依次移进去，保持相对顺序
    ordered.forEach((id, i) => {
      next = moveSubtree(next, id, group.id, i);
    });

    set({ layers: next, activeLayerId: group.id });
    // 新建的组是 1×1 占位，被移进去的图层只改了父子关系，像素一个没动
    get().pushHistory('action.groupLayers', { layerIds: [group.id] });
    get().bumpRevision();
    return group;
  },

  ungroup: (id) => {
    const { layers } = get();
    const group = layers.find((layer) => layer.id === id);
    if (!group || group.type !== 'group') return;

    const kids = childrenOf(layers, id);
    const parentId = group.parentId ?? null;
    // 子图层要落到组原来的位置上，所以先算出组在同级里的插入点
    const siblingIndex = childrenOf(layers, parentId).findIndex((layer) => layer.id === id);

    let next = layers;
    kids.forEach((kid, i) => {
      next = moveSubtree(next, kid.id, parentId, siblingIndex + i);
    });
    next = next.filter((layer) => layer.id !== id);

    set({
      layers: next,
      activeLayerId: kids[kids.length - 1]?.id ?? next[next.length - 1]?.id ?? null,
    });
    /*
     * 子图层只改了父子关系，像素没动，所以传空 hint。
     * 被解散的那个组自身的「消失」增量不受影响：collectScans 里生成它的
     * 那段循环走的是「影子里还在、layers 里没了」，与 hint 无关。
     */
    get().pushHistory('action.ungroupLayers', { layerIds: [] });
    get().bumpRevision();
  },

  toggleGroupCollapsed: (id) => {
    const layer = get().layers.find((item) => item.id === id);
    if (!layer || layer.type !== 'group') return;
    // 折叠只是视图状态，不进历史：PS 里展开收起也不产生历史记录
    set({
      layers: get().layers.map((item) =>
        item.id === id ? { ...item, collapsed: !item.collapsed } : item,
      ),
    });
  },

  moveLayerTo: (id, parentId, index) => {
    const { layers } = get();
    const next = moveSubtree(layers, id, parentId, index);
    if (next === layers) return;
    set({ layers: next });
    // 改的只是顺序与父子关系，两者都在 meta 里整存，一个像素都没动
    get().pushHistory('action.moveLayer', { layerIds: [] });
    get().bumpRevision();
  },

  copyLayerTo: (id, parentId, index) => {
    const source = get().layers.find((layer) => layer.id === id);
    if (!source) return null;

    const duplicated = duplicateSubtree(get().layers, id, uid, (n) => copyOfName(get().locale, n));
    if (!duplicated.newId) return null;
    /*
     * 复制和落位合成一步历史：分成 duplicateLayer + moveLayerTo 两步的话，
     * 撤销一次只退到「复制完还没落位」的中间状态，那个状态用户从没见过。
     * 所以这里先在纯数据上把两步都做完，最后只 pushHistory 一次。
     */
    const placed = moveSubtree(duplicated.layers, duplicated.newId, parentId, index);

    set({
      layers: placed,
      activeLayerId: duplicated.newId,
      selectedLayerIds: [duplicated.newId],
    });
    get().pushHistory(source.type === 'group' ? 'action.duplicateGroup' : 'action.duplicateLayer');
    get().bumpRevision();
    return duplicated.newId;
  },

  mergeGroup: (id) => {
    const { layers, doc } = get();
    if (!doc) return;
    const group = layers.find((layer) => layer.id === id);
    if (!group || group.type !== 'group') return;

    const subtreeIds = new Set([id, ...descendantIds(layers, id)]);
    // 用整份 layers 合成再只保留这棵子树的结果，才能让组的混合模式/蒙版生效；
    // 单独把子图层拿出来合成会丢掉组自身的属性
    const merged = flatten(
      layers.filter((layer) => subtreeIds.has(layer.id)).map((layer) =>
        layer.id === id ? { ...layer, parentId: null } : layer,
      ),
      doc.width,
      doc.height,
    );

    // flatten 已经交出一张文档尺寸、声明过可读回的新画布，直接留下来当图层画布，
    // 再拷一遍只是白占一份内存
    const canvas = merged;
    const result: Layer = {
      id: uid('layer'),
      name: group.name,
      type: 'raster',
      visible: group.visible,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      canvas,
      bounds: boundsFor(canvas),
      parentId: group.parentId ?? null,
    };

    const at = layers.findIndex((layer) => layer.id === id);
    const next = layers.filter((layer) => !subtreeIds.has(layer.id));
    // 合并结果放回组原来的位置
    const insertAt = Math.min(next.length, layers.slice(0, at).filter((l) => !subtreeIds.has(l.id)).length);
    next.splice(insertAt, 0, result);

    set({ layers: next, activeLayerId: result.id });
    get().pushHistory('action.mergeGroup');
    get().bumpRevision();
  },
});

/** 已有组的数量，用于起名 */
function countGroups(layers: Layer[]): number {
  return layers.filter((layer) => layer.type === 'group').length;
}
