/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { AdjustmentNode, GraphNode, LayerGraph, PixelNode } from '../../types/graph';
import { EvalCache, cumulativeSignature, nodeSignature } from './evalCache';

function pixel(id: string, extra: Partial<PixelNode> = {}): PixelNode {
  return {
    id,
    name: id,
    kind: 'pixel',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    parentId: null,
    surfaceId: `${id}-s`,
    bounds: { x: 0, y: 0, width: 10, height: 10 },
    ...extra,
  };
}

function adjust(id: string, extra: Partial<AdjustmentNode> = {}): AdjustmentNode {
  return {
    id,
    name: id,
    kind: 'adjustment',
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    parentId: null,
    adjustment: 'brightness-contrast',
    params: { brightness: 0 },
    ...extra,
  };
}

function graphOf(...nodes: GraphNode[]): LayerGraph {
  const map: Record<string, GraphNode> = {};
  for (const node of nodes) map[node.id] = node;
  return { nodes: map, order: nodes.map((n) => n.id) };
}

describe('nodeSignature', () => {
  it('同样的节点得到同样的签名', () => {
    expect(nodeSignature(pixel('a'))).toBe(nodeSignature(pixel('a')));
  });

  it('影响画面的属性变了签名就变', () => {
    const base = nodeSignature(pixel('a'));
    expect(nodeSignature(pixel('a', { visible: false }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { opacity: 0.5 }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { blendMode: 'multiply' }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { clipped: true }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { surfaceId: 'other' }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { bounds: { x: 1, y: 0, width: 10, height: 10 } }))).not.toBe(
      base,
    );
  });

  it('蒙版的挂载与启停都进签名（否则切蒙版画面不刷新）', () => {
    const base = nodeSignature(pixel('a'));
    expect(nodeSignature(pixel('a', { maskId: 'm' }))).not.toBe(base);
    expect(nodeSignature(pixel('a', { maskId: 'm', maskEnabled: false }))).not.toBe(
      nodeSignature(pixel('a', { maskId: 'm' })),
    );
  });

  it('调整参数变了签名就变', () => {
    const base = nodeSignature(adjust('x'));
    expect(nodeSignature(adjust('x', { params: { brightness: 20 } }))).not.toBe(base);
    expect(nodeSignature(adjust('x', { adjustment: 'curves' }))).not.toBe(base);
  });

  it('不同 id 的节点签名不同', () => {
    expect(nodeSignature(pixel('a'))).not.toBe(nodeSignature(pixel('b')));
  });

  it('不改任何属性时重复取值稳定（可用于比较）', () => {
    const node = adjust('x', { params: { brightness: 5, contrast: 3 } });
    expect(nodeSignature(node)).toBe(nodeSignature(node));
  });
});

describe('cumulativeSignature', () => {
  it('包含下方所有节点：下面变了上面的调整也要重算', () => {
    const before = cumulativeSignature(graphOf(pixel('a'), adjust('x')), 'x');
    const after = cumulativeSignature(
      graphOf(pixel('a', { opacity: 0.3 }), adjust('x')),
      'x',
    );
    expect(after).not.toBe(before);
  });

  it('上方节点变化不影响下方节点的签名', () => {
    const base = cumulativeSignature(graphOf(pixel('a'), adjust('x')), 'a');
    const changed = cumulativeSignature(
      graphOf(pixel('a'), adjust('x', { params: { brightness: 99 } })),
      'a',
    );
    expect(changed).toBe(base);
  });

  it('最底层节点的累积签名等于自身签名', () => {
    const graph = graphOf(pixel('a'), pixel('b'));
    expect(cumulativeSignature(graph, 'a')).toBe(nodeSignature(graph.nodes.a));
  });

  it('顺序变了签名也变', () => {
    const graph = graphOf(pixel('a'), pixel('b'), adjust('x'));
    const reordered: LayerGraph = { ...graph, order: ['b', 'a', 'x'] };
    expect(cumulativeSignature(reordered, 'x')).not.toBe(cumulativeSignature(graph, 'x'));
  });

  it('节点不存在时返回空串', () => {
    expect(cumulativeSignature(graphOf(pixel('a')), 'nope')).toBe('');
  });
});

describe('EvalCache', () => {
  it('签名一致时命中', () => {
    const cache = new EvalCache<string>();
    cache.set('a', 'sig1', 'result');
    expect(cache.get('a', 'sig1')).toBe('result');
  });

  it('签名不一致时未命中，不返回过期结果', () => {
    const cache = new EvalCache<string>();
    cache.set('a', 'sig1', 'old');
    expect(cache.get('a', 'sig2')).toBeNull();
  });

  it('没存过的节点返回 null', () => {
    expect(new EvalCache<string>().get('a', 'sig')).toBeNull();
  });

  it('同一节点重复存只占一份', () => {
    const cache = new EvalCache<string>();
    cache.set('a', 'sig1', 'one');
    cache.set('a', 'sig2', 'two');
    expect(cache.size).toBe(1);
    expect(cache.get('a', 'sig2')).toBe('two');
  });

  it('invalidate 之后不再命中', () => {
    const cache = new EvalCache<string>();
    cache.set('a', 'sig', 'v');
    cache.invalidate('a');
    expect(cache.get('a', 'sig')).toBeNull();
  });

  it('clear 清空全部', () => {
    const cache = new EvalCache<string>();
    cache.set('a', 's', '1');
    cache.set('b', 's', '2');
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('超上限时淘汰最旧的，容量不无限增长', () => {
    const cache = new EvalCache<number>(2);
    cache.set('a', 's', 1);
    cache.set('b', 's', 2);
    cache.set('c', 's', 3);
    expect(cache.size).toBe(2);
    expect(cache.get('a', 's')).toBeNull();
    expect(cache.get('c', 's')).toBe(3);
  });

  it('上限为 1 时也成立（边界值）', () => {
    const cache = new EvalCache<number>(1);
    cache.set('a', 's', 1);
    cache.set('b', 's', 2);
    expect(cache.size).toBe(1);
    expect(cache.get('b', 's')).toBe(2);
  });

  it('缓存独立于节点对象：改属性造出新对象后仍按 id 命中', () => {
    const cache = new EvalCache<string>();
    const node = pixel('a');
    cache.set(node.id, nodeSignature(node), 'v1');
    const moved = { ...node, opacity: 0.5 };
    // 签名变了所以不该命中旧值，但缓存本身还在，可以存入新值
    expect(cache.get(moved.id, nodeSignature(moved))).toBeNull();
    cache.set(moved.id, nodeSignature(moved), 'v2');
    expect(cache.get(moved.id, nodeSignature(moved))).toBe('v2');
    expect(cache.size).toBe(1);
  });
});
