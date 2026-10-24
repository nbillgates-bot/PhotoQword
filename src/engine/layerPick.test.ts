/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { pickLayers, pickVisibleLayersAt } from './layerPick';

/** 造一个图层，在指定局部区域填不透明红色 */
function mkLayer(params: {
  id: string;
  x?: number;
  y?: number;
  size?: number;
  fill?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  type?: Layer['type'];
  parentId?: string;
}): Layer {
  const {
    id,
    x = 0,
    y = 0,
    size = 8,
    fill,
    visible = true,
    type = 'raster',
    parentId,
  } = params;
  const canvas = createCanvas(size, size);
  if (fill) {
    const context = ctx2d(canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  return {
    id,
    name: id,
    type,
    visible,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas, x, y),
    ...(parentId ? { parentId } : {}),
  };
}

describe('pickLayers', () => {
  it('只返回该点有不透明像素的图层', () => {
    const hit = mkLayer({ id: 'hit', fill: { x: 0, y: 0, w: 4, h: 4 } });
    const miss = mkLayer({ id: 'miss', fill: { x: 4, y: 4, w: 4, h: 4 } });

    const result = pickLayers([hit, miss], { x: 1, y: 1 });

    expect(result.map((layer) => layer.id)).toEqual(['hit']);
  });

  it('完全透明的图层不算命中', () => {
    const empty = mkLayer({ id: 'empty' });

    expect(pickLayers([empty], { x: 4, y: 4 })).toEqual([]);
  });

  it('跳过隐藏图层，PS 里隐藏的层右键也选不到', () => {
    const hidden = mkLayer({
      id: 'hidden',
      fill: { x: 0, y: 0, w: 8, h: 8 },
      visible: false,
    });

    expect(pickLayers([hidden], { x: 4, y: 4 })).toEqual([]);
  });

  it('跳过组，组没有自己的像素', () => {
    const group = mkLayer({
      id: 'group',
      fill: { x: 0, y: 0, w: 8, h: 8 },
      type: 'group',
    });

    expect(pickLayers([group], { x: 4, y: 4 })).toEqual([]);
  });

  it('按传入顺序返回，调用方负责排成自顶向底', () => {
    const top = mkLayer({ id: 'top', fill: { x: 0, y: 0, w: 8, h: 8 } });
    const bottom = mkLayer({ id: 'bottom', fill: { x: 0, y: 0, w: 8, h: 8 } });

    const result = pickLayers([top, bottom], { x: 4, y: 4 });

    expect(result.map((layer) => layer.id)).toEqual(['top', 'bottom']);
  });

  it('bounds 有偏移时按文档坐标换算到图层局部坐标', () => {
    // 图层摆在 (10,10)，局部 (0,0)-(4,4) 有像素 → 文档 (10,10)-(14,14)
    const moved = mkLayer({ id: 'moved', x: 10, y: 10, fill: { x: 0, y: 0, w: 4, h: 4 } });

    expect(pickLayers([moved], { x: 11, y: 11 }).map((l) => l.id)).toEqual(['moved']);
    // 文档原点处该层已没有像素覆盖
    expect(pickLayers([moved], { x: 1, y: 1 })).toEqual([]);
  });

  it('点在图层边界外时直接跳过，不去取样', () => {
    const layer = mkLayer({ id: 'l', fill: { x: 0, y: 0, w: 8, h: 8 } });

    expect(pickLayers([layer], { x: -1, y: 4 })).toEqual([]);
    expect(pickLayers([layer], { x: 4, y: 99 })).toEqual([]);
  });

  it('小数坐标向下取整，与像素网格对齐', () => {
    const layer = mkLayer({ id: 'l', fill: { x: 0, y: 0, w: 1, h: 1 } });

    // 0.9 落在第 0 个像素里
    expect(pickLayers([layer], { x: 0.9, y: 0.9 }).map((l) => l.id)).toEqual(['l']);
    // 1.2 落到第 1 个像素，那里是空的
    expect(pickLayers([layer], { x: 1.2, y: 1.2 })).toEqual([]);
  });

  it('tolerance 控制 alpha 阈值，半透明像素可被排除', () => {
    const canvas = createCanvas(4, 4);
    const context = ctx2d(canvas);
    // alpha ≈ 128
    context.fillStyle = 'rgba(255,0,0,0.5)';
    context.fillRect(0, 0, 4, 4);
    const layer: Layer = {
      id: 'semi',
      name: 'semi',
      type: 'raster',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      canvas,
      bounds: boundsFor(canvas, 0, 0),
    };

    expect(pickLayers([layer], { x: 1, y: 1 }, 1).map((l) => l.id)).toEqual(['semi']);
    // 阈值抬到 200 以上，半透明就不算命中了
    expect(pickLayers([layer], { x: 1, y: 1 }, 200)).toEqual([]);
  });

  it('宽高为 1 的画布首像素能命中', () => {
    const layer = mkLayer({ id: 'tiny', size: 1, fill: { x: 0, y: 0, w: 1, h: 1 } });

    expect(pickLayers([layer], { x: 0, y: 0 }).map((l) => l.id)).toEqual(['tiny']);
  });
});

/*
 * 画布右键取层。报的 bug：右键菜单里图层顺序不对，最顶层没排在第一个，
 * 用户没法凭菜单顺序快速定位。根因是调用方拿扁平数组直接 reverse，
 * 有组的时候那不是视觉堆叠顺序。
 */
describe('pickVisibleLayersAt', () => {
  const full = { x: 0, y: 0, w: 8, h: 8 };
  const at = { x: 4, y: 4 };

  it('吃 store 那份自底向顶的数组，返回自顶向底', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'mid', fill: full }),
      mkLayer({ id: 'top', fill: full }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['top', 'mid', 'bg']);
  });

  it('菜单第一项是视觉上最顶的那层', () => {
    const layers = [
      mkLayer({ id: 'bottom', fill: full }),
      mkLayer({ id: 'covering', fill: full }),
    ];

    expect(pickVisibleLayersAt(layers, at)[0].id).toBe('covering');
  });

  it('组内图层按视觉堆叠排，不是扁平数组的反转', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'group', type: 'group' }),
      mkLayer({ id: 'childA', fill: full, parentId: 'group' }),
      mkLayer({ id: 'childB', fill: full, parentId: 'group' }),
      mkLayer({ id: 'top', fill: full }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual([
      'top',
      'childB',
      'childA',
      'bg',
    ]);
  });

  it('组排在上面时，组内图层整体盖过组外的层', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'outside', fill: full }),
      mkLayer({ id: 'group', type: 'group' }),
      mkLayer({ id: 'child', fill: full, parentId: 'group' }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual([
      'child',
      'outside',
      'bg',
    ]);
  });

  it('父组隐藏时子图层画布上看不见，菜单里也不出现', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'group', type: 'group', visible: false }),
      // 图层自己 visible 是 true，但父组关掉了
      mkLayer({ id: 'child', fill: full, parentId: 'group' }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['bg']);
  });

  it('组显示时子图层正常出现', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'group', type: 'group' }),
      mkLayer({ id: 'child', fill: full, parentId: 'group' }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['child', 'bg']);
  });

  it('组自己不进菜单，它没有像素可点', () => {
    const layers = [
      mkLayer({ id: 'group', type: 'group', fill: full }),
      mkLayer({ id: 'child', fill: full, parentId: 'group' }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['child']);
  });

  it('该点没有像素的图层不列出来，即使它在最上面', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      // 只在左上角有像素，(4,4) 处是空的
      mkLayer({ id: 'corner', fill: { x: 0, y: 0, w: 2, h: 2 } }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['bg']);
  });

  it('隐藏图层不列出来', () => {
    const layers = [
      mkLayer({ id: 'bg', fill: full }),
      mkLayer({ id: 'hidden', fill: full, visible: false }),
    ];

    expect(pickVisibleLayersAt(layers, at).map((l) => l.id)).toEqual(['bg']);
  });

  it('空文档返回空列表', () => {
    expect(pickVisibleLayersAt([], at)).toEqual([]);
  });

  it('点在所有图层之外时返回空列表', () => {
    const layers = [mkLayer({ id: 'bg', fill: full })];

    expect(pickVisibleLayersAt(layers, { x: 99, y: 99 })).toEqual([]);
  });
});
