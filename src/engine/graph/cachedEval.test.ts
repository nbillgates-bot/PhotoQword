/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { GraphNode, LayerGraph } from '../../types/graph';
import { createCanvas, ctx2d } from '../canvasUtils';
import { GraphRenderer } from './cachedEval';
import type { ContentResolver, EvalContext } from './evalTypes';

const W = 4;
const H = 4;

function solid(color: string): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  return canvas;
}

function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    kind: 'pixel',
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    parentId: null,
    surfaceId: `${id}-s`,
    bounds: { x: 0, y: 0, width: W, height: H },
    ...extra,
  } as GraphNode;
}

function graphOf(...nodes: GraphNode[]): LayerGraph {
  const map: Record<string, GraphNode> = {};
  for (const item of nodes) map[item.id] = item;
  return { nodes: map, order: nodes.map((item) => item.id) };
}

/** 记录求值次数的解析器 */
function countingResolver(): { resolver: ContentResolver; calls: () => number } {
  let calls = 0;
  const canvas = solid('rgb(255,0,0)');
  return {
    resolver: {
      pixels: () => {
        calls += 1;
        return canvas;
      },
      raster: () => canvas,
      mask: () => null,
    },
    calls: () => calls,
  };
}

function ctxOf(resolver: ContentResolver): EvalContext {
  return { width: W, height: H, resolver };
}

describe('GraphRenderer 缓存命中', () => {
  it('图与版本都没变时复用上次结果，不重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));

    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    expect(calls()).toBe(before);
  });

  it('命中时返回同一个画布实例', () => {
    const { resolver } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));
    const first = renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const second = renderer.render(graph, ctxOf(resolver), { revision: 1 });
    expect(second).toBe(first);
  });

  it('像素版本变了必须重新求值（否则画了没反应）', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));

    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render(graph, ctxOf(resolver), { revision: 2 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('节点属性变了要重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();

    renderer.render(graphOf(node('a')), ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render(graphOf(node('a', { opacity: 50 })), ctxOf(resolver), { revision: 1 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('新增节点要重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();

    renderer.render(graphOf(node('a')), ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render(graphOf(node('a'), node('b')), ctxOf(resolver), { revision: 1 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('顺序变了要重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'), node('b'));

    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render({ ...graph, order: ['b', 'a'] }, ctxOf(resolver), { revision: 1 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('文档尺寸变了要重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));

    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.render(graph, { ...ctxOf(resolver), width: 8 }, { revision: 1 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('variant 不同视为不同结果（视口等维度）', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));

    renderer.render(graph, ctxOf(resolver), { revision: 1, variant: 'full' });
    const before = calls();
    renderer.render(graph, ctxOf(resolver), { revision: 1, variant: 'zoomed' });
    expect(calls()).toBeGreaterThan(before);
  });

  it('clear 之后重新求值', () => {
    const { resolver, calls } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));

    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const before = calls();
    renderer.clear();
    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    expect(calls()).toBeGreaterThan(before);
  });

  it('空图也能求值并缓存', () => {
    const { resolver } = countingResolver();
    const renderer = new GraphRenderer();
    const empty: LayerGraph = { nodes: {}, order: [] };
    const first = renderer.render(empty, ctxOf(resolver), { revision: 1 });
    expect(renderer.render(empty, ctxOf(resolver), { revision: 1 })).toBe(first);
  });

  it('缓存结果的画面内容正确，不只是引用相同', () => {
    const { resolver } = countingResolver();
    const renderer = new GraphRenderer();
    const graph = graphOf(node('a'));
    renderer.render(graph, ctxOf(resolver), { revision: 1 });
    const cached = renderer.render(graph, ctxOf(resolver), { revision: 1 });
    expect([...ctx2d(cached).getImageData(0, 0, 1, 1).data]).toEqual([255, 0, 0, 255]);
  });
});
