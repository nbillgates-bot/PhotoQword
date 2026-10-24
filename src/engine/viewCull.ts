/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 视口裁剪:从图层树上剪掉视口里一个像素都看不见的分支。
 *
 * 这是长图文档的性能命门。790×16041 在 100% 缩放下屏幕只看得到不到 1/16 的高度,
 * 裁掉视口外的图层能把参与合成的层数从 287 降到 20~50;实测关掉之后一次合成要 24 秒。
 *
 * **必须在树上裁,不能在扁平数组上裁。**
 * 组的画布是 1×1 占位(组自己没有像素),按 bounds 与视口求交的话,
 * 只要视口不含文档左上角那个像素,所有组都会被判成不可见而被剔掉。
 * 而 buildTree 对「父级不存在」的图层是当作顶层处理的(见 layerTree.ts),
 * 于是组内的子图层会被提升成顶层照旧画出来,却丢掉了组的隔离、不透明度、
 * 蒙版和混合模式——表现就是「图层顺序对但画面不对」。这是之前那个
 * 显示不全的 bug 的根因,所以裁剪只能沿着树结构做。
 */

import type { Layer } from '../types';
import { clipRuns } from './clipping';
import type { LayerNode } from './layerTree';
import type { Viewport } from './compositor';

/** 图层是否与视口相交。半开区间:边界恰好相接时看不见一个像素,算不相交 */
function intersects(layer: Layer, rect: Viewport): boolean {
  const b = layer.bounds;
  return !(
    b.x + layer.canvas.width <= rect.x ||
    b.y + layer.canvas.height <= rect.y ||
    b.x >= rect.x + rect.width ||
    b.y >= rect.y + rect.height
  );
}

/**
 * 效果能画到 bounds 之外多远。
 *
 * 投影和外发光会溢出图层边界,所以判断相交时要把测试框放大这么多,
 * 否则一个刚好在视口外的图层,它投进视口里的那片阴影会凭空消失。
 * 取各效果所需外扩量的最大值,宁可多留一点也不要少。
 */
function effectMargin(layer: Layer): number {
  const { effects } = layer;
  if (!effects) return 0;
  let margin = 0;
  if (effects.dropShadow?.enabled) {
    margin = Math.max(margin, effects.dropShadow.size + effects.dropShadow.distance);
  }
  if (effects.outerGlow?.enabled) margin = Math.max(margin, effects.outerGlow.size);
  if (effects.stroke?.enabled && effects.stroke.position !== 'inside') {
    margin = Math.max(margin, effects.stroke.size);
  }
  return margin;
}

/** 把矩形四周外扩 margin */
function expand(rect: Viewport, margin: number): Viewport {
  if (margin <= 0) return rect;
  return {
    x: rect.x - margin,
    y: rect.y - margin,
    width: rect.width + margin * 2,
    height: rect.height + margin * 2,
  };
}

/**
 * 裁剪单个节点,整支都看不见时返回 null。
 *
 * - 调整图层**永不裁剪**:它作用于下方整幅合成结果,没有有意义的 bounds,
 *   裁掉它下方的画面就会少一次调整,颜色直接不对。
 * - 组按「有没有活下来的子节点」判断,不看组自己的 bounds(那是 1×1 占位)。
 *   子节点全没了的组画出来是空的,可以整个丢掉。
 */
function pruneNode(node: LayerNode, rect: Viewport): LayerNode | null {
  const { layer } = node;
  if (!layer.visible || layer.opacity <= 0) return null;
  if (layer.type === 'adjustment') return node;

  if (layer.type === 'group') {
    const children = pruneNodes(node.children, rect);
    if (children.length === 0) return null;
    return { layer, children };
  }

  return intersects(layer, expand(rect, effectMargin(layer))) ? node : null;
}

/**
 * 裁剪一层兄弟节点。
 *
 * 按剪贴组成段处理:基底被裁掉时整段一起丢。基底在视口里没有像素,
 * 它的 alpha 就是 0,而剪贴组的最终 alpha 等于基底的 alpha(见 clipping.ts),
 * 所以成员在视口里也一定看不见。要是只丢基底、留下成员,
 * 成员里的第一个会被 clipRuns 当成新基底,画出来完全是另一回事。
 */
export function pruneNodes(nodes: LayerNode[], rect: Viewport): LayerNode[] {
  const out: LayerNode[] = [];
  for (const run of clipRuns(nodes, (node) => Boolean(node.layer.clipped))) {
    const base = pruneNode(run.base, rect);
    if (!base) continue;
    out.push(base);
    for (const member of run.members) {
      const kept = pruneNode(member, rect);
      if (kept) out.push(kept);
    }
  }
  return out;
}

/** 树里的节点总数,用于统计裁掉了多少 */
export function countNodes(nodes: LayerNode[]): number {
  let total = 0;
  for (const node of nodes) total += 1 + countNodes(node.children);
  return total;
}
