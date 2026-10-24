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
import { evaluateGraph } from './evaluator';
import type { ContentResolver, EvalContext } from './evalTypes';

const W = 4;
const H = 4;

/** 纯色画布，供解析器返回 */
function solid(color: string, width = W, height = H): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

/** 读某点的 RGBA */
function pixelAt(canvas: HTMLCanvasElement, x = 0, y = 0): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

/** 按 id 给内容的解析器；未登记的返回 null */
function resolverOf(
  content: Record<string, HTMLCanvasElement>,
  masks: Record<string, HTMLCanvasElement> = {},
): ContentResolver {
  return {
    pixels: (node) => content[node.id] ?? null,
    raster: (node) => content[node.id] ?? null,
    mask: (maskId) => masks[maskId] ?? null,
  };
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

function contextOf(resolver: ContentResolver, extra: Partial<EvalContext> = {}): EvalContext {
  return { width: W, height: H, resolver, ...extra };
}

describe('基础合成', () => {
  it('空图求出全透明画面', () => {
    const out = evaluateGraph({ nodes: {}, order: [] }, contextOf(resolverOf({})));
    expect(pixelAt(out)).toEqual([0, 0, 0, 0]);
  });

  it('单个像素节点原样画出', () => {
    const graph = graphOf(node('a'));
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('order 决定叠放：后面的盖住前面的', () => {
    const graph = graphOf(node('a'), node('b'));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)'), b: solid('rgb(0,255,0)') })),
    );
    expect(pixelAt(out)).toEqual([0, 255, 0, 255]);
  });

  it('隐藏节点不参与合成', () => {
    const graph = graphOf(node('a'), node('b', { visible: false }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)'), b: solid('rgb(0,255,0)') })),
    );
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('不透明度为 0 的节点等同隐藏', () => {
    const graph = graphOf(node('a'), node('b', { opacity: 0 }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)'), b: solid('rgb(0,255,0)') })),
    );
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('不透明度 50% 时与下方混出中间色', () => {
    const graph = graphOf(node('a'), node('b', { opacity: 50 }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(0,0,0)'), b: solid('rgb(255,255,255)') })),
    );
    const [r] = pixelAt(out);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  it('解析器返回 null 时跳过该节点，不抛错也不白屏', () => {
    const graph = graphOf(node('a'), node('missing'));
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('文档尺寸为 0 时返回空画布而不是抛错', () => {
    const graph = graphOf(node('a'));
    const ctx = contextOf(resolverOf({ a: solid('rgb(255,0,0)') }), { width: 0, height: 0 });
    expect(() => evaluateGraph(graph, ctx)).not.toThrow();
  });

  it('手写混合模式（PS 特有的 6 个）能生效', () => {
    const graph = graphOf(node('a'), node('b', { blendMode: 'linear-dodge' }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(100,100,100)'), b: solid('rgb(100,100,100)') })),
    );
    // 线性减淡是相加，应该明显亮于任一输入
    expect(pixelAt(out)[0]).toBeGreaterThan(150);
  });

  it('结果里没有 NaN', () => {
    const graph = graphOf(node('a'), node('b', { blendMode: 'vivid-light', opacity: 60 }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(30,60,90)'), b: solid('rgb(200,150,100)') })),
    );
    const data = ctx2d(out).getImageData(0, 0, W, H).data;
    expect([...data].some((v) => Number.isNaN(v))).toBe(false);
  });
});

/** 把 RGB 全部置为 0 的调整，效果一眼可辨 */
const blackout = (image: ImageData) => {
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = 0;
    image.data[i + 1] = 0;
    image.data[i + 2] = 0;
  }
};

describe('调整节点（非破坏性的核心）', () => {
  const adjustNode = (id: string, extra: Partial<GraphNode> = {}) =>
    node(id, { kind: 'adjustment', adjustment: 'brightness-contrast', params: {}, ...extra });

  it('作用于下方已合成的画面，而不是某一个图层', () => {
    const graph = graphOf(node('a'), adjustNode('adj'));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }), { applyAdjustment: blackout }),
    );
    expect(pixelAt(out)).toEqual([0, 0, 0, 255]);
  });

  it('只影响它下方的层，上方的层不受影响', () => {
    const graph = graphOf(node('a'), adjustNode('adj'), node('top'));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)'), top: solid('rgb(0,0,255)') }), {
        applyAdjustment: blackout,
      }),
    );
    expect(pixelAt(out)).toEqual([0, 0, 255, 255]);
  });

  it('隐藏调整节点后画面恢复原样（这就是非破坏性）', () => {
    const resolver = resolverOf({ a: solid('rgb(255,0,0)') });
    const on = evaluateGraph(
      graphOf(node('a'), adjustNode('adj')),
      contextOf(resolver, { applyAdjustment: blackout }),
    );
    const off = evaluateGraph(
      graphOf(node('a'), adjustNode('adj', { visible: false })),
      contextOf(resolver, { applyAdjustment: blackout }),
    );
    expect(pixelAt(on)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(off)).toEqual([255, 0, 0, 255]);
  });

  it('反复求值不累积误差：原始像素始终没被改动', () => {
    const source = solid('rgb(255,0,0)');
    const resolver = resolverOf({ a: source });
    const graph = graphOf(node('a'), adjustNode('adj'));
    const ctx = contextOf(resolver, { applyAdjustment: blackout });
    evaluateGraph(graph, ctx);
    evaluateGraph(graph, ctx);
    evaluateGraph(graph, ctx);
    // 源画布未被就地修改，仍是纯红
    expect(pixelAt(source)).toEqual([255, 0, 0, 255]);
  });

  it('不透明度决定效果生效多少（不是替换）', () => {
    const graph = graphOf(node('a'), adjustNode('adj', { opacity: 50 }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }), { applyAdjustment: blackout }),
    );
    const [r] = pixelAt(out);
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(160);
  });

  it('没有提供 applyAdjustment 时跳过，不抛错', () => {
    const graph = graphOf(node('a'), adjustNode('adj'));
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('参数与类型都会透传给施加者', () => {
    const seen: { kind: string; params: Record<string, unknown> }[] = [];
    const graph = graphOf(
      node('a'),
      adjustNode('adj', { adjustment: 'curves', params: { amount: 7 } }),
    );
    evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }), {
        applyAdjustment: (_image, kind, params) => seen.push({ kind, params }),
      }),
    );
    expect(seen).toEqual([{ kind: 'curves', params: { amount: 7 } }]);
  });

  it('多个调整节点按自底向上依次叠加', () => {
    const order: string[] = [];
    const graph = graphOf(
      node('a'),
      adjustNode('first', { adjustment: 'levels' }),
      adjustNode('second', { adjustment: 'curves' }),
    );
    evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(128,128,128)') }), {
        applyAdjustment: (_image, kind) => order.push(kind),
      }),
    );
    expect(order).toEqual(['levels', 'curves']);
  });
});

describe('图层组', () => {
  const groupNode = (id: string, extra: Partial<GraphNode> = {}) =>
    node(id, { kind: 'group', blendMode: 'pass-through', ...extra });

  it('组内子节点参与合成', () => {
    const graph = graphOf(groupNode('g'), node('child', { parentId: 'g' }));
    const out = evaluateGraph(graph, contextOf(resolverOf({ child: solid('rgb(0,255,0)') })));
    expect(pixelAt(out)).toEqual([0, 255, 0, 255]);
  });

  it('组隐藏时组内一律不显示', () => {
    const graph = graphOf(
      node('bg'),
      groupNode('g', { visible: false }),
      node('child', { parentId: 'g' }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ bg: solid('rgb(255,0,0)'), child: solid('rgb(0,255,0)') })),
    );
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('穿透组不隔离：组内调整能影响到组下方的图层', () => {
    const graph = graphOf(
      node('below'),
      groupNode('g'),
      node('adj', {
        parentId: 'g',
        kind: 'adjustment',
        adjustment: 'brightness-contrast',
        params: {},
      }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ below: solid('rgb(255,0,0)') }), { applyAdjustment: blackout }),
    );
    // 穿透语义下调整读到了组下方的红色并压黑
    expect(pixelAt(out)).toEqual([0, 0, 0, 255]);
  });

  it('组有不透明度时强制隔离：组内调整读不到组下方', () => {
    const graph = graphOf(
      node('below'),
      groupNode('g', { opacity: 99 }),
      node('adj', {
        parentId: 'g',
        kind: 'adjustment',
        adjustment: 'brightness-contrast',
        params: {},
      }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ below: solid('rgb(255,0,0)') }), { applyAdjustment: blackout }),
    );
    // 隔离后组内是空的，压黑一片透明仍是透明，下方红色透上来
    expect(pixelAt(out)[0]).toBeGreaterThan(200);
  });

  it('组的混合模式非穿透时也强制隔离', () => {
    const graph = graphOf(
      groupNode('g', { blendMode: 'multiply' }),
      node('child', { parentId: 'g' }),
    );
    const out = evaluateGraph(graph, contextOf(resolverOf({ child: solid('rgb(0,255,0)') })));
    expect(pixelAt(out)[1]).toBe(255);
  });

  it('嵌套组逐层合成', () => {
    const graph = graphOf(
      groupNode('outer'),
      groupNode('inner', { parentId: 'outer' }),
      node('leaf', { parentId: 'inner' }),
    );
    const out = evaluateGraph(graph, contextOf(resolverOf({ leaf: solid('rgb(0,0,255)') })));
    expect(pixelAt(out)).toEqual([0, 0, 255, 255]);
  });

  it('空组不影响画面', () => {
    const graph = graphOf(node('bg'), groupNode('g'));
    const out = evaluateGraph(graph, contextOf(resolverOf({ bg: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });
});

/** 左半白右半黑的蒙版：左侧显示，右侧隐藏 */
function halfMask(): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = 'rgb(0,0,0)';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgb(255,255,255)';
  ctx.fillRect(0, 0, W / 2, H);
  return canvas;
}

describe('蒙版', () => {
  it('白处显示黑处隐藏', () => {
    const graph = graphOf(node('a', { maskId: 'm' }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }, { m: halfMask() })),
    );
    expect(pixelAt(out, 0, 0)[3]).toBe(255);
    expect(pixelAt(out, W - 1, 0)[3]).toBe(0);
  });

  it('停用蒙版后整层显示（蒙版仍保留）', () => {
    const graph = graphOf(node('a', { maskId: 'm', maskEnabled: false }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }, { m: halfMask() })),
    );
    expect(pixelAt(out, W - 1, 0)[3]).toBe(255);
  });

  it('蒙版取不到时按无蒙版处理，不白屏', () => {
    const graph = graphOf(node('a', { maskId: 'ghost' }));
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('调整节点的蒙版限定生效范围', () => {
    const graph = graphOf(
      node('a'),
      node('adj', {
        kind: 'adjustment',
        adjustment: 'brightness-contrast',
        params: {},
        maskId: 'm',
      }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }, { m: halfMask() }), {
        applyAdjustment: blackout,
      }),
    );
    // 左半被压黑，右半保持原色
    expect(pixelAt(out, 0, 0)[0]).toBe(0);
    expect(pixelAt(out, W - 1, 0)[0]).toBe(255);
  });

  it('组蒙版作用于组内合成结果', () => {
    const graph = graphOf(
      node('g', { kind: 'group', blendMode: 'pass-through', maskId: 'm' }),
      node('child', { parentId: 'g' }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ child: solid('rgb(0,255,0)') }, { m: halfMask() })),
    );
    expect(pixelAt(out, 0, 0)[3]).toBe(255);
    expect(pixelAt(out, W - 1, 0)[3]).toBe(0);
  });
});

describe('剪贴组', () => {
  it('成员只在基底的不透明区域内显示', () => {
    // 基底只占左半边
    const base = createCanvas(W, H);
    const baseCtx = ctx2d(base);
    baseCtx.fillStyle = 'rgb(255,0,0)';
    baseCtx.fillRect(0, 0, W / 2, H);

    const graph = graphOf(node('base'), node('member', { clipped: true }));
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ base, member: solid('rgb(0,255,0)') })),
    );
    // 左半是成员的绿色，右半基底透明所以成员也不显示
    expect(pixelAt(out, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(out, W - 1, 0)[3]).toBe(0);
  });

  it('基底隐藏时整组都不显示', () => {
    const graph = graphOf(
      node('bg'),
      node('base', { visible: false }),
      node('member', { clipped: true }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(
        resolverOf({
          bg: solid('rgb(0,0,255)'),
          base: solid('rgb(255,0,0)'),
          member: solid('rgb(0,255,0)'),
        }),
      ),
    );
    expect(pixelAt(out)).toEqual([0, 0, 255, 255]);
  });

  it('同级最底下那层标了剪贴也按普通图层处理', () => {
    const graph = graphOf(node('a', { clipped: true }));
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('连续多个成员共用同一个基底', () => {
    const graph = graphOf(
      node('base'),
      node('m1', { clipped: true }),
      node('m2', { clipped: true }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(
        resolverOf({
          base: solid('rgb(255,0,0)'),
          m1: solid('rgb(0,255,0)'),
          m2: solid('rgb(0,0,255)'),
        }),
      ),
    );
    // 最上面的成员盖住前面的
    expect(pixelAt(out)).toEqual([0, 0, 255, 255]);
  });

  it('基底的不透明度作用于整组', () => {
    const graph = graphOf(
      node('base', { opacity: 50 }),
      node('member', { clipped: true }),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ base: solid('rgb(255,0,0)'), member: solid('rgb(0,255,0)') })),
    );
    expect(pixelAt(out)[3]).toBeLessThan(200);
  });
});

describe('滤镜节点', () => {
  const filterNode = (id: string, filters: unknown[]) =>
    node(id, { kind: 'filter', filters } as Partial<GraphNode>);

  it('按顺序跑启用的滤镜', () => {
    const ran: string[] = [];
    const graph = graphOf(
      node('a'),
      filterNode('f', [
        { id: '1', filterId: 'blur', params: {}, enabled: true, opacity: 100, blendMode: 'normal' },
        { id: '2', filterId: 'sharpen', params: {}, enabled: true, opacity: 100, blendMode: 'normal' },
      ]),
    );
    evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(128,128,128)') }), {
        applyFilter: (source, filterId) => {
          ran.push(filterId);
          return source;
        },
      }),
    );
    expect(ran).toEqual(['blur', 'sharpen']);
  });

  it('停用的滤镜被跳过', () => {
    const ran: string[] = [];
    const graph = graphOf(
      node('a'),
      filterNode('f', [
        { id: '1', filterId: 'blur', params: {}, enabled: false, opacity: 100, blendMode: 'normal' },
      ]),
    );
    evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(128,128,128)') }), {
        applyFilter: (source, filterId) => {
          ran.push(filterId);
          return source;
        },
      }),
    );
    expect(ran).toEqual([]);
  });

  it('滤镜返回 null 时保留上一步结果，不让画面消失', () => {
    const graph = graphOf(
      node('a'),
      filterNode('f', [
        { id: '1', filterId: 'broken', params: {}, enabled: true, opacity: 100, blendMode: 'normal' },
      ]),
    );
    const out = evaluateGraph(
      graph,
      contextOf(resolverOf({ a: solid('rgb(255,0,0)') }), { applyFilter: () => null }),
    );
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });

  it('没有提供 applyFilter 时跳过，不抛错', () => {
    const graph = graphOf(
      node('a'),
      filterNode('f', [
        { id: '1', filterId: 'blur', params: {}, enabled: true, opacity: 100, blendMode: 'normal' },
      ]),
    );
    const out = evaluateGraph(graph, contextOf(resolverOf({ a: solid('rgb(255,0,0)') })));
    expect(pixelAt(out)).toEqual([255, 0, 0, 255]);
  });
});
