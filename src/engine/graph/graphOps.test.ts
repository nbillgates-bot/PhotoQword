/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { GraphNode, LayerGraph } from '../../types/graph';
import {
  ancestorsOf,
  childrenOf,
  clipBaseOf,
  emptyGraph,
  isEffectivelyVisible,
  nodeAt,
  orderedNodes,
  reparent,
  subtreeIds,
} from './graphOps';

/** 造一个像素节点，只填测试关心的字段 */
function pixel(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    kind: 'pixel',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    parentId: null,
    surfaceId: `${id}-surface`,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    ...extra,
  } as GraphNode;
}

/** 造一个组节点 */
function group(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    kind: 'group',
    visible: true,
    opacity: 1,
    blendMode: 'pass-through',
    parentId: null,
    ...extra,
  } as GraphNode;
}

/** 按自底向上的顺序组装图 */
function graphOf(...nodes: GraphNode[]): LayerGraph {
  const map: Record<string, GraphNode> = {};
  for (const node of nodes) map[node.id] = node;
  return { nodes: map, order: nodes.map((node) => node.id) };
}

describe('nodeAt / orderedNodes', () => {
  it('空图什么都没有', () => {
    const graph = emptyGraph();
    expect(nodeAt(graph, 'a')).toBeNull();
    expect(orderedNodes(graph)).toEqual([]);
  });

  it('按 order 自底向上返回', () => {
    const graph = graphOf(pixel('a'), pixel('b'), pixel('c'));
    expect(orderedNodes(graph).map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('order 里残留的已删 id 被跳过，不抛错', () => {
    const graph = graphOf(pixel('a'), pixel('b'));
    graph.order.push('ghost');
    expect(orderedNodes(graph).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('childrenOf', () => {
  it('取最外层用 null 作父级', () => {
    const graph = graphOf(pixel('a'), group('g'), pixel('b', { parentId: 'g' }));
    expect(childrenOf(graph, null).map((n) => n.id)).toEqual(['a', 'g']);
    expect(childrenOf(graph, 'g').map((n) => n.id)).toEqual(['b']);
  });

  it('parentId 缺席等同于最外层', () => {
    const orphan = pixel('a');
    delete (orphan as { parentId?: unknown }).parentId;
    expect(childrenOf(graphOf(orphan), null).map((n) => n.id)).toEqual(['a']);
  });

  it('保持 order 的相对次序', () => {
    const graph = graphOf(
      group('g'),
      pixel('x', { parentId: 'g' }),
      pixel('y', { parentId: 'g' }),
    );
    expect(childrenOf(graph, 'g').map((n) => n.id)).toEqual(['x', 'y']);
  });

  it('没有子节点时返回空数组', () => {
    expect(childrenOf(graphOf(group('g')), 'g')).toEqual([]);
  });
});

describe('ancestorsOf', () => {
  it('由近及远列出祖先', () => {
    const graph = graphOf(
      group('outer'),
      group('inner', { parentId: 'outer' }),
      pixel('leaf', { parentId: 'inner' }),
    );
    expect(ancestorsOf(graph, 'leaf').map((n) => n.id)).toEqual(['inner', 'outer']);
  });

  it('最外层节点没有祖先', () => {
    expect(ancestorsOf(graphOf(pixel('a')), 'a')).toEqual([]);
  });

  it('节点不存在时返回空数组', () => {
    expect(ancestorsOf(emptyGraph(), 'nope')).toEqual([]);
  });

  it('parentId 成环时中断而不是死循环', () => {
    const graph = graphOf(
      group('a', { parentId: 'b' }),
      group('b', { parentId: 'a' }),
    );
    expect(ancestorsOf(graph, 'a').length).toBeLessThanOrEqual(2);
  });

  it('指向不存在的父级时到此为止', () => {
    expect(ancestorsOf(graphOf(pixel('a', { parentId: 'ghost' })), 'a')).toEqual([]);
  });
});

describe('isEffectivelyVisible', () => {
  it('自身隐藏则不可见', () => {
    expect(isEffectivelyVisible(graphOf(pixel('a', { visible: false })), 'a')).toBe(false);
  });

  it('组隐藏时组内图层一律不可见（与 PS 一致）', () => {
    const graph = graphOf(
      group('g', { visible: false }),
      pixel('leaf', { parentId: 'g', visible: true }),
    );
    expect(isEffectivelyVisible(graph, 'leaf')).toBe(false);
  });

  it('祖先链全可见才可见', () => {
    const graph = graphOf(
      group('outer'),
      group('inner', { parentId: 'outer' }),
      pixel('leaf', { parentId: 'inner' }),
    );
    expect(isEffectivelyVisible(graph, 'leaf')).toBe(true);
  });

  it('隐藏最外层组会连带隐藏深层节点', () => {
    const graph = graphOf(
      group('outer', { visible: false }),
      group('inner', { parentId: 'outer' }),
      pixel('leaf', { parentId: 'inner' }),
    );
    expect(isEffectivelyVisible(graph, 'leaf')).toBe(false);
  });

  it('节点不存在按不可见处理', () => {
    expect(isEffectivelyVisible(emptyGraph(), 'nope')).toBe(false);
  });
});

describe('subtreeIds', () => {
  it('含自身', () => {
    expect(subtreeIds(graphOf(pixel('a')), 'a')).toEqual(['a']);
  });

  it('收全所有后代', () => {
    const graph = graphOf(
      group('g'),
      group('h', { parentId: 'g' }),
      pixel('x', { parentId: 'h' }),
      pixel('y', { parentId: 'g' }),
    );
    expect(subtreeIds(graph, 'g').sort()).toEqual(['g', 'h', 'x', 'y']);
  });

  it('节点不存在时返回空数组', () => {
    expect(subtreeIds(emptyGraph(), 'nope')).toEqual([]);
  });

  it('成环时不死循环', () => {
    const graph = graphOf(group('a', { parentId: 'b' }), group('b', { parentId: 'a' }));
    expect(subtreeIds(graph, 'a').length).toBeLessThanOrEqual(2);
  });
});

describe('clipBaseOf', () => {
  it('没标剪贴则没有基底', () => {
    expect(clipBaseOf(graphOf(pixel('a'), pixel('b')), 'b')).toBeNull();
  });

  it('取同级往下第一个未剪贴的节点', () => {
    const graph = graphOf(pixel('base'), pixel('a', { clipped: true }), pixel('b', { clipped: true }));
    expect(clipBaseOf(graph, 'a')?.id).toBe('base');
    expect(clipBaseOf(graph, 'b')?.id).toBe('base');
  });

  it('同级最底下那层标了剪贴也没有基底', () => {
    const graph = graphOf(pixel('a', { clipped: true }), pixel('b'));
    expect(clipBaseOf(graph, 'a')).toBeNull();
  });

  it('只在同一父级内查找，不穿透到组外', () => {
    const graph = graphOf(
      pixel('outside'),
      group('g'),
      pixel('inner', { parentId: 'g', clipped: true }),
    );
    expect(clipBaseOf(graph, 'inner')).toBeNull();
  });

  it('顺序一变基底自动跟着变（存布尔而非 id 的意义）', () => {
    const graph = graphOf(pixel('b1'), pixel('b2'), pixel('top', { clipped: true }));
    expect(clipBaseOf(graph, 'top')?.id).toBe('b2');
    const reordered: LayerGraph = { ...graph, order: ['b2', 'b1', 'top'] };
    expect(clipBaseOf(reordered, 'top')?.id).toBe('b1');
  });
});

describe('reparent', () => {
  it('移进组里', () => {
    const graph = graphOf(pixel('a'), group('g'));
    expect(reparent(graph, 'a', 'g').nodes.a.parentId).toBe('g');
  });

  it('移出到最外层', () => {
    const graph = graphOf(group('g'), pixel('a', { parentId: 'g' }));
    expect(reparent(graph, 'a', null).nodes.a.parentId).toBeNull();
  });

  it('拒绝把组移进自己的后代（否则成环）', () => {
    const graph = graphOf(group('g'), group('inner', { parentId: 'g' }));
    expect(reparent(graph, 'g', 'inner')).toBe(graph);
  });

  it('拒绝把节点移到自己下面', () => {
    const graph = graphOf(group('g'));
    expect(reparent(graph, 'g', 'g')).toBe(graph);
  });

  it('目标父级不存在时原样返回', () => {
    const graph = graphOf(pixel('a'));
    expect(reparent(graph, 'a', 'ghost')).toBe(graph);
  });

  it('节点不存在时原样返回', () => {
    const graph = graphOf(group('g'));
    expect(reparent(graph, 'nope', 'g')).toBe(graph);
  });

  it('返回新图，不改动原图（便于历史记录）', () => {
    const graph = graphOf(pixel('a'), group('g'));
    const next = reparent(graph, 'a', 'g');
    expect(graph.nodes.a.parentId).toBeNull();
    expect(next).not.toBe(graph);
  });
});
