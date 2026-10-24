/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 现有 Layer[] ↔ LayerGraph 的映射。
 *
 * 这是新旧模型之间的接缝：旧的工具、面板、PSD 读写继续吃 Layer，
 * 新的求值器吃 LayerGraph，两边通过这里对齐。有了它才能一个功能一个功能地
 * 迁移，而不是某天一次性替换掉整个引擎。
 *
 * 映射是有损的：Layer 没有调整/滤镜节点的概念（它把效果烧进了像素），
 * 所以 graph → layers 只能还原 pixel/text/shape/group 这四类，
 * 遇到 effect 节点会跳过。反向映射因此只适用于「图里没有 effect 节点」的场合，
 * 主要是给 PSD 导出与旧代码兜底用。
 */

import type { Layer, LayerType } from '../../types';
import type { GraphNode, LayerGraph } from '../../types/graph';
import type { ContentResolver } from './evalTypes';

/** 像素/蒙版画布按 surfaceId 索引，供解析器查 */
export interface LayerBridge {
  graph: LayerGraph;
  canvases: Map<string, HTMLCanvasElement>;
  masks: Map<string, HTMLCanvasElement>;
}

/** surfaceId 由图层 id 派生，保证同一图层每次映射结果一致（缓存签名依赖这一点） */
export function surfaceIdOf(layerId: string): string {
  return `surface:${layerId}`;
}

export function maskIdOf(layerId: string): string {
  return `mask:${layerId}`;
}

/** Layer.type → 节点类型。组以外都各有对应 */
function kindOf(type: LayerType): GraphNode['kind'] {
  if (type === 'group') return 'group';
  if (type === 'text') return 'text';
  if (type === 'shape') return 'shape';
  if (type === 'adjustment') return 'adjustment';
  return 'pixel';
}

/**
 * 把 Layer[] 转成图 + 像素索引。
 *
 * layers 的顺序即 order（自底向上），与现有 compositor 的约定一致。
 * 像素不进图，只进 canvases —— 节点必须保持可廉价复制。
 */
export function graphFromLayers(layers: Layer[]): LayerBridge {
  const nodes: Record<string, GraphNode> = {};
  const canvases = new Map<string, HTMLCanvasElement>();
  const masks = new Map<string, HTMLCanvasElement>();

  for (const layer of layers) {
    const surfaceId = surfaceIdOf(layer.id);
    // 只有有像素内容的图层才放进 canvases（调整/滤镜/组没有自己的像素）
    if (layer.type === 'raster' || layer.type === 'text' || layer.type === 'shape') {
      canvases.set(surfaceId, layer.canvas);
    }
    if (layer.mask) masks.set(maskIdOf(layer.id), layer.mask);

    nodes[layer.id] = buildNode(layer, surfaceId);
  }

  return { graph: { nodes, order: layers.map((layer) => layer.id) }, canvases, masks };
}

/** 单个图层转节点。组不带 surfaceId（组本身没有像素） */
function buildNode(layer: Layer, surfaceId: string): GraphNode {
  const kind = kindOf(layer.type);
  const common = {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    parentId: layer.parentId ?? null,
    clipped: layer.clipped,
    locked: layer.locked,
    maskId: layer.mask ? maskIdOf(layer.id) : undefined,
    maskEnabled: layer.maskEnabled,
    effects: layer.effects,
  };

  if (kind === 'group') {
    return { ...common, kind: 'group', collapsed: layer.collapsed } as GraphNode;
  }
  if (kind === 'text') {
    return { ...common, kind: 'text', textId: layer.id, bounds: layer.bounds } as GraphNode;
  }
  if (kind === 'shape') {
    return { ...common, kind: 'shape', shapeId: layer.id, bounds: layer.bounds } as GraphNode;
  }
  if (kind === 'adjustment' && layer.adjustmentData) {
    return {
      ...common,
      kind: 'adjustment',
      adjustment: layer.adjustmentData.kind,
      params: layer.adjustmentData.params,
    } as GraphNode;
  }
  return { ...common, kind: 'pixel', surfaceId, bounds: layer.bounds } as GraphNode;
}

/** 从 canvas/mask Map 造一个解析器，供 evaluator 查像素 */
export function resolverFrom(canvases: Map<string, HTMLCanvasElement>, masks: Map<string, HTMLCanvasElement>): ContentResolver {
  return {
    pixels: (node) => {
      if (node.kind !== 'pixel') return null;
      return canvases.get(node.surfaceId) ?? null;
    },
    mask: (maskId) => masks.get(maskId) ?? null,
    /*
     * 文字与形状的排版结果在提交时就已经栅格化进 layer.canvas 了
     * （graphFromLayers 把它按 surfaceId 存进了 canvases），
     * 所以这里按同一个 id 取回来即可，不需要重新排版。
     *
     * 曾经这里一律返回 null，求值器就把整层当作没内容跳过。
     * 屏幕上看不出问题——那条路走的是老的 paintNodes，直接读 layer.canvas；
     * 但导出与存储走求值器，于是存出来的 JPG/PNG 里文字图层凭空消失。
     * 两条渲染路径对同一份图层必须给出同样的结果。
     */
    raster: (node) => {
      if (node.kind !== 'text' && node.kind !== 'shape') return null;
      return canvases.get(surfaceIdOf(node.id)) ?? null;
    },
  };
}

