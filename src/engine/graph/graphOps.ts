/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 图层图的结构操作：查询、遍历、层级关系。纯函数，不碰像素也不碰 store。
 *
 * 求值（真正算像素）在 evaluator 里，这里只回答「图长什么样」。
 * 分开是因为结构逻辑最容易被各处重复实现，也最好测。
 */

import type { GraphNode, LayerGraph } from '../../types/graph';

/** 取节点，不存在返回 null */
export function nodeAt(graph: LayerGraph, id: string): GraphNode | null {
  return graph.nodes[id] ?? null;
}

/** 按 order 顺序（自底向上）返回全部存在的节点 */
export function orderedNodes(graph: LayerGraph): GraphNode[] {
  const out: GraphNode[] = [];
  for (const id of graph.order) {
    const node = graph.nodes[id];
    // order 里可能残留已删节点的 id，跳过而不是抛错：
    // 撤销/重做过程中会短暂出现这种不一致
    if (node) out.push(node);
  }
  return out;
}

/** 某个父级下的直接子节点，保持 order 的相对次序 */
export function childrenOf(graph: LayerGraph, parentId: string | null): GraphNode[] {
  return orderedNodes(graph).filter((node) => (node.parentId ?? null) === parentId);
}

/**
 * 从节点走到根的祖先链，由近及远。
 *
 * 带访问过的集合防环：parentId 理论上不该成环，但撤销一半的状态、
 * 手写的测试数据都可能构造出环，一旦成环这里会死循环卡死整个页面。
 */
export function ancestorsOf(graph: LayerGraph, id: string): GraphNode[] {
  const chain: GraphNode[] = [];
  const seen = new Set<string>([id]);
  let current = graph.nodes[id]?.parentId ?? null;
  while (current) {
    if (seen.has(current)) break;
    seen.add(current);
    const parent = graph.nodes[current];
    if (!parent) break;
    chain.push(parent);
    current = parent.parentId ?? null;
  }
  return chain;
}

/**
 * 节点最终是否可见：自身可见且所有祖先都可见。
 * 组一关，组里的层不管自己标了什么都不该出现，与 PS 一致。
 */
export function isEffectivelyVisible(graph: LayerGraph, id: string): boolean {
  const node = graph.nodes[id];
  if (!node || !node.visible) return false;
  return ancestorsOf(graph, id).every((parent) => parent.visible);
}

/** 节点及其全部后代的 id（含自身），用于删除组、复制组 */
export function subtreeIds(graph: LayerGraph, id: string): string[] {
  const result: string[] = [];
  const stack = [id];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (!graph.nodes[current]) continue;
    result.push(current);
    for (const child of childrenOf(graph, current)) stack.push(child.id);
  }
  return result;
}

/**
 * 剪贴组的基底：从该节点往下找同一父级内第一个没被剪贴的节点。
 *
 * 与 PS 一样由栈内相邻顺序决定，而不是存「剪贴到哪个 id」——
 * 存 id 就得在每次排序、删层、撤销时校正引用。
 * 同级最底下那层没有基底，返回 null。
 */
export function clipBaseOf(graph: LayerGraph, id: string): GraphNode | null {
  const node = graph.nodes[id];
  if (!node?.clipped) return null;
  const siblings = childrenOf(graph, node.parentId ?? null);
  const index = siblings.findIndex((item) => item.id === id);
  for (let i = index - 1; i >= 0; i -= 1) {
    if (!siblings[i].clipped) return siblings[i];
  }
  return null;
}

/**
 * 把节点移到某个父级下，拒绝会成环的移动（把组移进它自己的后代里）。
 * 返回新图；非法移动时原样返回，由调用方决定是否提示。
 */
export function reparent(graph: LayerGraph, id: string, parentId: string | null): LayerGraph {
  const node = graph.nodes[id];
  if (!node) return graph;
  if (parentId !== null) {
    if (!graph.nodes[parentId]) return graph;
    if (subtreeIds(graph, id).includes(parentId)) return graph;
  }
  return { ...graph, nodes: { ...graph.nodes, [id]: { ...node, parentId } } };
}

/** 空图，供初始化与测试用 */
export function emptyGraph(): LayerGraph {
  return { nodes: {}, order: [] };
}
