/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';
import { ancestorIds, descendantIds, panelRows } from './layerTree';

/**
 * 图层多选与单独显示的纯计算。不认识 store 与 React。
 *
 * 多选的取值规则集中在 resolveSelection 里，store 只负责把结果存下来。
 */

/** 点击图层时的选择方式，对应 PS 的三种修饰键组合 */
export type SelectMode =
  | 'set' // 普通点击：只选它
  | 'toggle' // Ctrl+点击：切换它的选中态，其他不变
  | 'range'; // Shift+点击：从活动层连选到它

/** 选择结果。activeId 必定在 ids 里 */
export interface SelectionResult {
  ids: string[];
  activeId: string | null;
}

/**
 * 把选中集合收拢到仍然存在的图层上，并保证活动层在里面。
 *
 * 其他 action（新建、删除、撤销）会直接改 activeLayerId 而不管选中集合，
 * 所以每次读取都要过一遍这里：活动层不在集合里就说明集合过期了，退回单选。
 * 这样十几处 set({ activeLayerId }) 一行都不用改。
 */
export function normalizeSelection(
  layers: Layer[],
  ids: string[],
  activeId: string | null,
): string[] {
  const alive = new Set(layers.map((layer) => layer.id));
  const kept = ids.filter((id) => alive.has(id));
  if (activeId === null) return kept.length > 0 ? kept : [];
  // 活动层不在集合里 = 集合是上一轮的残留，按单选处理
  if (!kept.includes(activeId)) return alive.has(activeId) ? [activeId] : [];
  return kept;
}

/**
 * 算出点击之后的选中集合与活动层。
 *
 * 连选走面板的可见行序（panelRows），不是 layers 数组序：
 * 折叠组里的子图层在面板上看不见，Shift 连选不该把它们捎带进来。
 */
export function resolveSelection(
  layers: Layer[],
  current: string[],
  activeId: string | null,
  clickedId: string,
  mode: SelectMode,
): SelectionResult {
  if (!layers.some((layer) => layer.id === clickedId)) {
    return { ids: normalizeSelection(layers, current, activeId), activeId };
  }
  const selected = normalizeSelection(layers, current, activeId);

  if (mode === 'toggle') {
    if (selected.includes(clickedId)) {
      const ids = selected.filter((id) => id !== clickedId);
      // PS 里不允许把最后一层也取消掉，总得有个活动层
      if (ids.length === 0) return { ids: selected, activeId };
      // 取消的正好是活动层时，活动层顺移到集合里剩下的最后一个
      return { ids, activeId: clickedId === activeId ? ids[ids.length - 1] : activeId };
    }
    return { ids: [...selected, clickedId], activeId: clickedId };
  }

  if (mode === 'range' && activeId !== null && activeId !== clickedId) {
    const order = panelRows(layers).map((row) => row.layer.id);
    const from = order.indexOf(activeId);
    const to = order.indexOf(clickedId);
    if (from >= 0 && to >= 0) {
      const [lo, hi] = from < to ? [from, to] : [to, from];
      // 活动层保持不动，与 PS 一致：连选是「从活动层拉到这里」
      return { ids: order.slice(lo, hi + 1), activeId };
    }
  }

  return { ids: [clickedId], activeId: clickedId };
}

/**
 * 单独显示时哪些图层还该画出来：目标层自己、它的祖先组、它的后代。
 *
 * 祖先必须留着，否则目标层被隐藏的父组挡掉，单独显示等于什么都看不见。
 * 后代要留着是因为 solo 一个组的语义是「只看这一组」。
 */
export function soloVisibleIds(layers: Layer[], soloId: string): Set<string> {
  if (!layers.some((layer) => layer.id === soloId)) return new Set(layers.map((l) => l.id));
  return new Set([soloId, ...ancestorIds(layers, soloId), ...descendantIds(layers, soloId)]);
}

/**
 * 把单独显示套到图层上，返回给合成器用的数组。
 *
 * solo 故意**不**去改图层的 visible：visible 会进历史快照，
 * solo 期间画一笔就会把「其他层全隐藏」一起记进那一步，
 * 退出 solo 之后再撤销，其他图层会莫名其妙全部消失。
 * 所以这里只在渲染前临时改，图层状态本身不动。
 *
 * PS 的做法是真改可见性（它的历史不记这个），行为一致，实现方式不同。
 */
export function applySolo(layers: Layer[], soloId: string | null): Layer[] {
  if (soloId === null) return layers;
  const keep = soloVisibleIds(layers, soloId);
  return layers.map((layer) => {
    if (!keep.has(layer.id)) return layer.visible ? { ...layer, visible: false } : layer;
    // 目标层自己被眼睛关掉时也要显示出来，否则 Alt+点击看不到任何反馈
    if (layer.id === soloId && !layer.visible) return { ...layer, visible: true };
    return layer;
  });
}
