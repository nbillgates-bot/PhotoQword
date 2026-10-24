/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { canClip, clipBaseOf, clipInfoOf, clipRuns, clipToAlpha } from './clipping';
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

describe('clipRuns', () => {
  it('没有 clipped 时每个节点各成一段', () => {
    const runs = clipRuns(['a', 'b', 'c'], () => false);
    expect(runs).toEqual([
      { base: 'a', members: [] },
      { base: 'b', members: [] },
      { base: 'c', members: [] },
    ]);
  });

  it('连续的 clipped 归到下方同一个基底', () => {
    const nodes = [
      { id: 'base', clipped: false },
      { id: 'm1', clipped: true },
      { id: 'm2', clipped: true },
      { id: 'top', clipped: false },
    ];
    const runs = clipRuns(nodes, (node) => node.clipped);
    expect(runs).toHaveLength(2);
    expect(runs[0].base.id).toBe('base');
    expect(runs[0].members.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(runs[1].base.id).toBe('top');
  });

  it('最底下那个标了 clipped 也当基底，没有基底可剪', () => {
    const runs = clipRuns([{ c: true }, { c: false }], (node) => node.c);
    expect(runs).toHaveLength(2);
    expect(runs[0].base.c).toBe(true);
    expect(runs[0].members).toEqual([]);
  });

  it('空输入返回空数组', () => {
    expect(clipRuns([], () => true)).toEqual([]);
  });
});

describe('clipToAlpha', () => {
  it('把 alpha 换成基底的，颜色不动', () => {
    const content = createCanvas(2, 1);
    const contentCtx = ctx2d(content);
    contentCtx.fillStyle = '#00ff00';
    contentCtx.fillRect(0, 0, 2, 1);

    // 基底左半不透明、右半全透明
    const base = createCanvas(2, 1);
    const baseCtx = ctx2d(base);
    baseCtx.fillStyle = '#ff0000';
    baseCtx.fillRect(0, 0, 1, 1);

    clipToAlpha(content, base);
    const out = ctx2d(content).getImageData(0, 0, 2, 1).data;
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 255, 0, 255]);
    // 基底透明处成员被剪掉
    expect(out[7]).toBe(0);
  });

  it('半透明基底不做二次相乘，alpha 等于基底的 alpha', () => {
    const content = createCanvas(1, 1);
    const contentCtx = ctx2d(content);
    // 成员自身也是半透明
    contentCtx.fillStyle = 'rgba(0,0,255,0.5)';
    contentCtx.fillRect(0, 0, 1, 1);

    const base = createCanvas(1, 1);
    const baseCtx = ctx2d(base);
    baseCtx.fillStyle = 'rgba(255,0,0,0.5)';
    baseCtx.fillRect(0, 0, 1, 1);

    clipToAlpha(content, base);
    const out = ctx2d(content).getImageData(0, 0, 1, 1).data;
    // destination-in 会得到 ~64（0.5*0.5），PS 的结果是基底的 128
    expect(out[3]).toBeGreaterThan(120);
    expect(out[3]).toBeLessThan(136);
    expect(Number.isNaN(out[3])).toBe(false);
  });

  it('基底尺寸不同时先对齐再取 alpha，不抛错', () => {
    const content = createCanvas(2, 2);
    ctx2d(content).fillRect(0, 0, 2, 2);
    const base = createCanvas(1, 1);
    ctx2d(base).fillRect(0, 0, 1, 1);
    expect(() => clipToAlpha(content, base)).not.toThrow();
    const out = ctx2d(content).getImageData(0, 0, 2, 2).data;
    expect(out[3]).toBe(255);
    // 基底只覆盖左上一格，其余被剪掉
    expect(out[7]).toBe(0);
  });

  it('1x1 画布也能处理', () => {
    const content = createCanvas(1, 1);
    ctx2d(content).fillRect(0, 0, 1, 1);
    const base = createCanvas(1, 1);
    expect(() => clipToAlpha(content, base)).not.toThrow();
    expect(ctx2d(content).getImageData(0, 0, 1, 1).data[3]).toBe(0);
  });
});

describe('canClip', () => {
  it('同级最底那层不能剪贴', () => {
    const layers = [layer('a'), layer('b')];
    expect(canClip(layers, 'a')).toBe(false);
    expect(canClip(layers, 'b')).toBe(true);
  });

  it('按同级判断，不看全局下标', () => {
    // 组内只有一层时，它在组里是最底，不能剪贴
    const layers = [layer('bg'), layer('g', { type: 'group' }), layer('kid', { parentId: 'g' })];
    expect(canClip(layers, 'kid')).toBe(false);
    expect(canClip(layers, 'g')).toBe(true);
  });

  it('图层不存在时返回 false', () => {
    expect(canClip([layer('a')], 'nope')).toBe(false);
  });
});

describe('clipBaseOf', () => {
  it('连续成员共用同一个基底', () => {
    const layers = [
      layer('base'),
      layer('m1', { clipped: true }),
      layer('m2', { clipped: true }),
    ];
    expect(clipBaseOf(layers, 'm1')).toBe('base');
    expect(clipBaseOf(layers, 'm2')).toBe('base');
  });

  it('没标 clipped 的返回 null', () => {
    expect(clipBaseOf([layer('a'), layer('b')], 'b')).toBeNull();
  });

  it('同级最底标了 clipped 也没有基底', () => {
    expect(clipBaseOf([layer('a', { clipped: true }), layer('b')], 'a')).toBeNull();
  });

  it('只在同级里找，不跨组', () => {
    const layers = [
      layer('bg'),
      layer('g', { type: 'group' }),
      layer('kid', { parentId: 'g', clipped: true }),
    ];
    expect(clipBaseOf(layers, 'kid')).toBeNull();
  });
});

/*
 * 面板每行都调一次 canClip + clipBaseOf，两者内部都要 find + childrenOf 全表扫，
 * 图层多的时候是 O(n²)。clipInfoOf 一趟算完，结论必须和逐个调用完全一致。
 */
describe('clipInfoOf', () => {
  const cases: { name: string; layers: Layer[] }[] = [
    { name: '平铺无剪贴', layers: [layer('a'), layer('b'), layer('c')] },
    {
      name: '连续成员共用基底',
      layers: [layer('base'), layer('m1', { clipped: true }), layer('m2', { clipped: true })],
    },
    { name: '同级最底标了 clipped', layers: [layer('a', { clipped: true }), layer('b')] },
    {
      name: '跨组不相认',
      layers: [
        layer('bg'),
        layer('g', { type: 'group' }),
        layer('kid', { parentId: 'g', clipped: true }),
        layer('kid2', { parentId: 'g', clipped: true }),
      ],
    },
    { name: '空图层表', layers: [] },
    { name: '只有一层', layers: [layer('only')] },
  ];

  for (const { name, layers } of cases) {
    it(`与逐个调用结论一致：${name}`, () => {
      const info = clipInfoOf(layers);
      for (const item of layers) {
        expect(info.get(item.id)).toEqual({
          clipped: clipBaseOf(layers, item.id) !== null,
          canClipHere: canClip(layers, item.id),
        });
      }
    });
  }

  it('不认识的 id 拿不到条目', () => {
    expect(clipInfoOf([layer('a')]).get('nope')).toBeUndefined();
  });
});
