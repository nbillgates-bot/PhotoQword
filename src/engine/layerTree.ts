/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';

/**
 * 图层树。扁平数组 + parentId 的解释规则都在这里，纯函数，不认识 store 和 React。
 *
 * 约定：
 * - layers[0] 是最底层，与图层面板「倒序显示」相对应。
 * - 某个组的子图层 = parentId 等于它的图层，按数组里的先后为序。
 * - 组自身在数组里的位置决定整棵子树在同层兄弟中的位置。
 *
 * 这里**不要求**子图层在数组里与组相邻。写入侧的操作会尽量保持相邻，
 * 但读取侧只依赖 (顺序, parentId)，少一条隐式不变量就少一类难查的 bug。
 */

/** 树节点：图层本身加上它的子节点 */
export interface LayerNode {
  layer: Layer;
  children: LayerNode[];
}

/** 取直接子图层，按数组顺序 */
export function childrenOf(layers: Layer[], parentId: string | null): Layer[] {
  return layers.filter((layer) => (layer.parentId ?? null) === parentId);
}

/**
 * 建树。返回最外层节点，自底向上（与 layers 数组同序）。
 *
 * parentId 指向不存在的图层时，该图层被当作最外层处理，不会凭空消失。
 */
export function buildTree(layers: Layer[]): LayerNode[] {
  const ids = new Set(layers.map((layer) => layer.id));
  const childMap = new Map<string | null, Layer[]>();

  for (const layer of layers) {
    const raw = layer.parentId ?? null;
    // 父不存在就挂回最外层，否则整棵子树会从界面上凭空消失
    const parent = raw !== null && ids.has(raw) ? raw : null;
    const list = childMap.get(parent);
    if (list) list.push(layer);
    else childMap.set(parent, [layer]);
  }

  const expand = (parent: string | null, guard: Set<string>): LayerNode[] =>
    (childMap.get(parent) ?? []).map((layer) => {
      // 环（A 的父是 B，B 的父是 A）会让递归停不下来。
      // 正常路径进不来，但历史回退遇到坏数据时不能把页面卡死。
      if (guard.has(layer.id)) return { layer, children: [] };
      const next = new Set(guard);
      next.add(layer.id);
      return { layer, children: layer.type === 'group' ? expand(layer.id, next) : [] };
    });

  return expand(null, new Set());
}

/** 某个图层的全部后代 id（不含自己）。删除组、判断能否拖进去都要用 */
export function descendantIds(layers: Layer[], id: string): string[] {
  const out: string[] = [];
  const walk = (parent: string) => {
    for (const layer of layers) {
      if ((layer.parentId ?? null) !== parent) continue;
      // 环保护：已经收过的不再展开
      if (out.includes(layer.id)) continue;
      out.push(layer.id);
      if (layer.type === 'group') walk(layer.id);
    }
  };
  walk(id);
  return out;
}

/** ancestorId 是否为 id 的祖先。把组拖进自己的子组里必须挡掉 */
export function isAncestor(layers: Layer[], ancestorId: string, id: string): boolean {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const seen = new Set<string>();
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null) {
    if (current === ancestorId) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** 从最外层到该图层的深度，最外层为 0。面板用它算缩进 */
export function depthOf(layers: Layer[], id: string): number {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const seen = new Set<string>();
  let depth = 0;
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null && byId.has(current)) {
    if (seen.has(current)) break;
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentId ?? null;
  }
  return depth;
}

/**
 * 把某个图层连同整棵子树移到新的父级与位置，返回新数组（不修改传入的）。
 *
 * index 是在目标父级子列表里的插入位置，0 = 最底。
 * 目标非法时原样返回：移进自己的后代、目标父级不是组、或图层不存在。
 */
export function moveSubtree(
  layers: Layer[],
  id: string,
  parentId: string | null,
  index: number,
): Layer[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  if (!byId.has(id)) return layers;

  if (parentId !== null) {
    const parent = byId.get(parentId);
    if (!parent || parent.type !== 'group') return layers;
    // 组不能移进自己或自己的后代里，否则整棵子树从树上脱落
    if (parentId === id || isAncestor(layers, id, parentId)) return layers;
  }

  const subtreeIds = new Set([id, ...descendantIds(layers, id)]);
  const subtree = layers.filter((layer) => subtreeIds.has(layer.id));
  const rest = layers.filter((layer) => !subtreeIds.has(layer.id));

  const siblings = childrenOf(rest, parentId);
  const anchor = insertionIndex(rest, parentId, siblings, index);
  // 只有被移动的那一个改父级，它的后代保持原样
  const moved = subtree.map((layer) => (layer.id === id ? { ...layer, parentId } : layer));

  const next = [...rest];
  next.splice(anchor, 0, ...moved);
  return next;
}

/** 某图层子树在数组里的结束位置（最后一个成员的下标 + 1） */
function subtreeEnd(layers: Layer[], id: string): number {
  const ids = new Set([id, ...descendantIds(layers, id)]);
  let end = 0;
  layers.forEach((layer, i) => {
    if (ids.has(layer.id)) end = Math.max(end, i + 1);
  });
  return end;
}

/**
 * 算出插入到数组的哪个下标。
 *
 * 兄弟之间要跳过整棵子树，不能只看兄弟自己的下标，
 * 否则会插到别人的组里面去。
 */
function insertionIndex(
  layers: Layer[],
  parentId: string | null,
  siblings: Layer[],
  index: number,
): number {
  const clamped = Math.max(0, Math.min(siblings.length, index));

  if (clamped < siblings.length) {
    // 插到这个兄弟之前：取它子树的起点
    const target = siblings[clamped].id;
    return layers.findIndex((layer) => layer.id === target);
  }
  if (siblings.length > 0) {
    // 插到最上面：跳过最后一个兄弟的整棵子树
    return subtreeEnd(layers, siblings[siblings.length - 1].id);
  }
  // 空组：紧跟在组自己后面，保持子图层与组相邻
  if (parentId !== null) {
    const at = layers.findIndex((layer) => layer.id === parentId);
    return at < 0 ? layers.length : at + 1;
  }
  return 0;
}

/** 面板里的一行：图层加上它的缩进层级 */
export interface PanelRow {
  layer: Layer;
  depth: number;
}

/**
 * 图层面板要渲染的行，自上而下。
 * 折叠的组只出它自己这一行，子图层不展开。
 */
export function panelRows(layers: Layer[]): PanelRow[] {
  const rows: PanelRow[] = [];
  const walk = (nodes: LayerNode[], depth: number) => {
    // 面板自上而下 = 图层栈自顶向下，每一层都要倒序
    for (const node of [...nodes].reverse()) {
      rows.push({ layer: node.layer, depth });
      if (node.layer.type === 'group' && !node.layer.collapsed) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(buildTree(layers), 0);
  return rows;
}

/** 从内到外的祖先组 id。不含自己，指向不存在的父级时提前结束 */
export function ancestorIds(layers: Layer[], id: string): string[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const out: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    out.push(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return out;
}

/**
 * 算上祖先组之后这个图层到底显不显示。
 * 组隐藏时整棵子树都不画，即使子图层自己的 visible 是 true。
 */
export function effectiveVisible(layers: Layer[], id: string): boolean {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const layer = byId.get(id);
  if (!layer || !layer.visible) return false;
  return ancestorIds(layers, id).every((parent) => byId.get(parent)?.visible !== false);
}

/**
 * 取消编组该作用于哪个组：选中的是组就是它自己，否则是它所在的组。
 * PS 里选中组内图层按 Ctrl+Shift+G 解散的是外层那个组，不必先点到组那一行。
 */
export function ungroupTarget(layers: Layer[], activeId: string | null): string | null {
  const active = layers.find((layer) => layer.id === activeId);
  if (!active) return null;
  return active.type === 'group' ? active.id : (active.parentId ?? null);
}

/**
 * 展开该图层的全部祖先组，返回新数组；本来就都展开着时**原样返回**。
 *
 * 面板里只有 panelRows 吐出来的行才存在于 DOM，藏在折叠组里的图层
 * 连元素都没有，滚动定位自然落空。所以选中一个图层时要先把路开出来，
 * 这和 PS 从画布右键选层的表现一致——它会直接展开到那一行。
 *
 * 没有变化时返回原数组是有意为之：图层面板按引用比较，
 * 每次选中都造一份新数组会让所有行的 memo 失效，几百层时选一下就卡。
 */
export function revealAncestors(layers: Layer[], id: string): Layer[] {
  const collapsed = new Set(
    ancestorIds(layers, id).filter((parent) =>
      layers.some((layer) => layer.id === parent && layer.collapsed),
    ),
  );
  if (collapsed.size === 0) return layers;
  return layers.map((layer) =>
    collapsed.has(layer.id) ? { ...layer, collapsed: false } : layer,
  );
}

/**
 * 该图层是否因为某个祖先组折叠而不该显示在面板里。
 * 注意判断的是**祖先**折叠，组自己折叠时它这一行还是要显示的。
 */
export function isHiddenByCollapse(layers: Layer[], id: string): boolean {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const seen = new Set<string>();
  let current = byId.get(id)?.parentId ?? null;
  while (current !== null) {
    const parent = byId.get(current);
    if (!parent) return false;
    if (parent.collapsed) return true;
    if (seen.has(current)) return false;
    seen.add(current);
    current = parent.parentId ?? null;
  }
  return false;
}
