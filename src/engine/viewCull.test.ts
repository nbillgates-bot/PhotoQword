/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { countNodes, pruneNodes } from './viewCull';
import { buildTree } from './layerTree';
import { createCanvas } from './canvasUtils';
import type { Layer } from '../types';

/** 视口:文档坐标 (0,0)~(100,100) */
const VIEW = { x: 0, y: 0, width: 100, height: 100 };

function layer(over: Partial<Layer> & { id: string }): Layer {
  const width = over.canvas?.width ?? 50;
  const height = over.canvas?.height ?? 50;
  const canvas = over.canvas ?? createCanvas(width, height);
  return {
    name: over.id,
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    ...over,
  } as Layer;
}

/** 组:画布是 1×1 占位,与 store 里建组的做法一致 */
function group(id: string, over: Partial<Layer> = {}): Layer {
  return layer({
    id,
    type: 'group',
    canvas: createCanvas(1, 1),
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    blendMode: 'pass-through',
    ...over,
  });
}

/** 剪下来的 id 列表,便于断言 */
function idsOf(nodes: ReturnType<typeof pruneNodes>): string[] {
  const out: string[] = [];
  const walk = (list: typeof nodes) => {
    for (const node of list) {
      out.push(node.layer.id);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function prune(layers: Layer[], rect = VIEW) {
  return pruneNodes(buildTree(layers), rect);
}

describe('视口裁剪', () => {
  it('视口内的图层留下', () => {
    const layers = [layer({ id: 'a', bounds: { x: 10, y: 10, width: 50, height: 50 } })];
    expect(idsOf(prune(layers))).toEqual(['a']);
  });

  it('视口外的图层被裁掉', () => {
    const layers = [layer({ id: 'a', bounds: { x: 500, y: 500, width: 50, height: 50 } })];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('边界恰好相接算不相交:一个像素都看不见', () => {
    // 图层占 100~150,视口占 0~100,右边界与左边界重合
    const layers = [layer({ id: 'a', bounds: { x: 100, y: 0, width: 50, height: 50 } })];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('部分相交的图层留下', () => {
    const layers = [layer({ id: 'a', bounds: { x: 80, y: 80, width: 50, height: 50 } })];
    expect(idsOf(prune(layers))).toEqual(['a']);
  });

  it('隐藏的图层被裁掉', () => {
    const layers = [layer({ id: 'a', visible: false })];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('不透明度为 0 的图层被裁掉', () => {
    const layers = [layer({ id: 'a', opacity: 0 })];
    expect(idsOf(prune(layers))).toEqual([]);
  });
});

/*
 * 这一组是本模块存在的理由。
 *
 * 组的画布是 1×1 占位,按 bounds 与视口求交的话,只要视口不含文档左上角
 * 那个像素,所有组都会被判成不可见。而 buildTree 对「父级不存在」的图层
 * 是当作顶层处理的,于是组内的子图层会被提升成顶层照旧画出来,却丢掉了
 * 组的隔离、不透明度、蒙版和混合模式——表现就是「图层顺序对但画面不对」。
 */
describe('组不按自己的 bounds 裁剪', () => {
  it('视口挪开原点后,组和它可见的子图层都还在', () => {
    const layers = [
      group('g'),
      layer({ id: 'child', parentId: 'g', bounds: { x: 200, y: 200, width: 50, height: 50 } }),
    ];
    const rect = { x: 190, y: 190, width: 100, height: 100 };
    expect(idsOf(prune(layers, rect))).toEqual(['g', 'child']);
  });

  it('组保持嵌套结构,子图层不会被提升成顶层', () => {
    const layers = [
      group('g'),
      layer({ id: 'child', parentId: 'g', bounds: { x: 200, y: 200, width: 50, height: 50 } }),
    ];
    const kept = prune(layers, { x: 190, y: 190, width: 100, height: 100 });
    expect(kept).toHaveLength(1);
    expect(kept[0].layer.id).toBe('g');
    expect(kept[0].children.map((n) => n.layer.id)).toEqual(['child']);
  });

  it('子图层全在视口外时整个组一起丢掉', () => {
    const layers = [
      group('g'),
      layer({ id: 'child', parentId: 'g', bounds: { x: 900, y: 900, width: 50, height: 50 } }),
    ];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('多层嵌套逐级判断', () => {
    const layers = [
      group('outer'),
      group('inner', { parentId: 'outer' }),
      layer({ id: 'deep', parentId: 'inner', bounds: { x: 10, y: 10, width: 20, height: 20 } }),
      layer({ id: 'far', parentId: 'inner', bounds: { x: 900, y: 900, width: 20, height: 20 } }),
    ];
    expect(idsOf(prune(layers))).toEqual(['outer', 'inner', 'deep']);
  });

  it('隐藏的组连同子树一起丢掉,即使子图层自己 visible 为 true', () => {
    const layers = [
      group('g', { visible: false }),
      layer({ id: 'child', parentId: 'g' }),
    ];
    expect(idsOf(prune(layers))).toEqual([]);
  });
});

describe('调整图层永不裁剪', () => {
  it('调整图层没有有意义的 bounds,不能按位置裁', () => {
    // 裁掉它下方的画面就会少一次调整,颜色直接不对
    const layers = [
      layer({ id: 'base', bounds: { x: 10, y: 10, width: 50, height: 50 } }),
      layer({
        id: 'adj',
        type: 'adjustment',
        bounds: { x: 5000, y: 5000, width: 1, height: 1 },
        adjustmentData: { kind: 'brightness-contrast', params: { brightness: 20 } },
      }),
    ];
    expect(idsOf(prune(layers))).toContain('adj');
  });

  it('隐藏的调整图层还是要裁掉', () => {
    const layers = [
      layer({
        id: 'adj',
        type: 'adjustment',
        visible: false,
        adjustmentData: { kind: 'brightness-contrast', params: {} },
      }),
    ];
    expect(idsOf(prune(layers))).toEqual([]);
  });
});

describe('剪贴组整段处理', () => {
  it('基底被裁掉时成员一起丢:成员的 alpha 来自基底,基底看不见成员也看不见', () => {
    const layers = [
      layer({ id: 'base', bounds: { x: 900, y: 900, width: 50, height: 50 } }),
      layer({ id: 'member', clipped: true, bounds: { x: 10, y: 10, width: 50, height: 50 } }),
    ];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('基底留下时,视口外的成员单独丢掉', () => {
    const layers = [
      layer({ id: 'base', bounds: { x: 10, y: 10, width: 50, height: 50 } }),
      layer({ id: 'near', clipped: true, bounds: { x: 20, y: 20, width: 20, height: 20 } }),
      layer({ id: 'far', clipped: true, bounds: { x: 900, y: 900, width: 20, height: 20 } }),
    ];
    expect(idsOf(prune(layers))).toEqual(['base', 'near']);
  });

  it('顺序保持不变,剪贴关系靠相邻顺序表达', () => {
    const layers = [
      layer({ id: 'b1', bounds: { x: 0, y: 0, width: 20, height: 20 } }),
      layer({ id: 'm1', clipped: true, bounds: { x: 0, y: 0, width: 20, height: 20 } }),
      layer({ id: 'b2', bounds: { x: 30, y: 30, width: 20, height: 20 } }),
      layer({ id: 'm2', clipped: true, bounds: { x: 30, y: 30, width: 20, height: 20 } }),
    ];
    expect(idsOf(prune(layers))).toEqual(['b1', 'm1', 'b2', 'm2']);
  });
});

describe('效果外扩', () => {
  it('投影能溢出 bounds,刚在视口外的图层不能裁', () => {
    // 图层在 110~130,视口 0~100;投影 size 20 + distance 10 能画进视口
    const layers = [
      layer({
        id: 'a',
        bounds: { x: 110, y: 10, width: 20, height: 20 },
        effects: {
          dropShadow: {
            enabled: true,
            size: 20,
            distance: 10,
            angle: 180,
            spread: 0,
            color: '#000000',
            blendMode: 'normal',
            opacity: 75,
          },
        },
      }),
    ];
    expect(idsOf(prune(layers))).toEqual(['a']);
  });

  it('没有效果时不外扩', () => {
    const layers = [layer({ id: 'a', bounds: { x: 110, y: 10, width: 20, height: 20 } })];
    expect(idsOf(prune(layers))).toEqual([]);
  });

  it('效果关掉了也不外扩', () => {
    const layers = [
      layer({
        id: 'a',
        bounds: { x: 110, y: 10, width: 20, height: 20 },
        effects: {
          dropShadow: {
            enabled: false,
            size: 50,
            distance: 50,
            angle: 180,
            spread: 0,
            color: '#000000',
            blendMode: 'normal',
            opacity: 75,
          },
        },
      }),
    ];
    expect(idsOf(prune(layers))).toEqual([]);
  });
});

describe('countNodes', () => {
  it('数上所有层级的节点', () => {
    const tree = buildTree([
      group('g'),
      layer({ id: 'a', parentId: 'g' }),
      layer({ id: 'b' }),
    ]);
    expect(countNodes(tree)).toBe(3);
  });

  it('空树是 0', () => {
    expect(countNodes([])).toBe(0);
  });
});
