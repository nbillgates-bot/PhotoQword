/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { duplicateSubtree } from './layerDuplicate';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import type { Layer } from '../types';

function layer(id: string, patch: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(4, 4);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas),
    ...patch,
  };
}

/** 依次产出 c1、c2……，测试里好断言 */
function counter(): (seed: string) => string {
  let n = 0;
  return () => `c${(n += 1)}`;
}

describe('duplicateSubtree', () => {
  it('图层不存在时原样返回', () => {
    const layers = [layer('a')];
    const result = duplicateSubtree(layers, 'nope', counter());
    expect(result.layers).toBe(layers);
    expect(result.newId).toBeNull();
  });

  it('副本插在原图层上方，名字带「副本」', () => {
    const layers = [layer('bg'), layer('a')];
    const result = duplicateSubtree(layers, 'bg', counter());

    expect(result.layers.map((item) => item.id)).toEqual(['bg', 'c1', 'a']);
    expect(result.newId).toBe('c1');
    expect(result.layers[1].name).toBe('bg 副本');
  });

  it('像素是深拷贝，改副本不影响原图', () => {
    const source = layer('a');
    ctx2d(source.canvas).fillRect(0, 0, 2, 2);
    const result = duplicateSubtree([source], 'a', counter());
    const copy = result.layers.find((item) => item.id === 'c1')!;

    expect(copy.canvas).not.toBe(source.canvas);
    expect(copy.bounds).not.toBe(source.bounds);
    ctx2d(copy.canvas).clearRect(0, 0, 4, 4);
    expect(ctx2d(source.canvas).getImageData(0, 0, 1, 1).data[3]).toBe(255);
  });

  it('蒙版也深拷贝', () => {
    const source = layer('a', { mask: createCanvas(4, 4) });
    const result = duplicateSubtree([source], 'a', counter());
    const copy = result.layers.find((item) => item.id === 'c1')!;

    expect(copy.mask).toBeDefined();
    expect(copy.mask).not.toBe(source.mask);
  });

  /*
   * 复制组必须连整棵子树一起复制，且组内的 parentId 要重新指到副本组上。
   * 指错的话子图层会挂在原来那个组下面，副本组是个空壳。
   */
  it('复制组连子树一起，组内父子指向重接到副本', () => {
    const layers = [
      layer('bg'),
      layer('g', { type: 'group' }),
      layer('k1', { parentId: 'g' }),
      layer('k2', { parentId: 'g' }),
    ];
    const result = duplicateSubtree(layers, 'g', counter());

    const copies = result.layers.filter((item) => item.id.startsWith('c'));
    expect(copies).toHaveLength(3);
    const group = copies.find((item) => item.type === 'group')!;
    expect(group.id).toBe(result.newId);
    // 副本组自己还留在原来的父级下
    expect(group.parentId ?? null).toBeNull();
    // 两个子副本都指向副本组，没有一个还指着原组
    const kids = copies.filter((item) => item.type !== 'group');
    expect(kids.map((item) => item.parentId)).toEqual([group.id, group.id]);
  });

  it('整棵子树插在原子树之后，不会插到子树中间', () => {
    const layers = [
      layer('bg'),
      layer('g', { type: 'group' }),
      layer('k1', { parentId: 'g' }),
      layer('top'),
    ];
    const result = duplicateSubtree(layers, 'g', counter());

    const ids = result.layers.map((item) => item.id);
    expect(ids.slice(0, 3)).toEqual(['bg', 'g', 'k1']);
    expect(ids[ids.length - 1]).toBe('top');
  });

  it('只有根副本改名，子图层名字照旧', () => {
    const layers = [layer('g', { type: 'group' }), layer('k1', { parentId: 'g' })];
    const result = duplicateSubtree(layers, 'g', counter());

    const copies = result.layers.filter((item) => item.id.startsWith('c'));
    const group = copies.find((item) => item.type === 'group')!;
    const kid = copies.find((item) => item.type !== 'group')!;
    expect(group.name).toBe('g 副本');
    expect(kid.name).toBe('k1');
  });

  it('组内图层的副本留在同一个组里', () => {
    const layers = [layer('g', { type: 'group' }), layer('k1', { parentId: 'g' })];
    const result = duplicateSubtree(layers, 'k1', counter());

    const copy = result.layers.find((item) => item.id === result.newId)!;
    expect(copy.parentId).toBe('g');
  });
});
