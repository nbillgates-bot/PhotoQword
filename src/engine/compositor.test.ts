/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { BlendMode, Layer, LayerType } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { flatten } from './compositor';

const W = 4;
const H = 4;

/** 造一个纯色填满的图层 */
function solid(id: string, color: string, extra: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, W, H);
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
    parentId: null,
    ...extra,
  };
}

/** 造一个组。组自己没有像素，画布是 1x1 占位 */
function group(id: string, extra: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(1, 1);
  return {
    id,
    name: id,
    type: 'group' as LayerType,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'pass-through' as BlendMode,
    canvas,
    bounds: boundsFor(canvas),
    parentId: null,
    ...extra,
  };
}

/** 读某点的 RGBA */
function at(canvas: HTMLCanvasElement, x = 0, y = 0): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

describe('组的基本合成', () => {
  it('组内图层按栈序合成，上面的盖住下面的', () => {
    const layers = [
      group('G'),
      solid('red', '#ff0000', { parentId: 'G' }),
      solid('blue', '#0000ff', { parentId: 'G' }),
    ];
    expect(at(flatten(layers, W, H))).toEqual([0, 0, 255, 255]);
  });

  it('空组不影响画面', () => {
    const layers = [solid('red', '#ff0000'), group('G')];
    expect(at(flatten(layers, W, H))).toEqual([255, 0, 0, 255]);
  });

  it('组隐藏时整棵子树都不画', () => {
    const layers = [
      solid('red', '#ff0000'),
      group('G', { visible: false }),
      solid('blue', '#0000ff', { parentId: 'G' }),
    ];
    expect(at(flatten(layers, W, H))).toEqual([255, 0, 0, 255]);
  });

  it('组不透明度为 0 时子树不画', () => {
    const layers = [
      solid('red', '#ff0000'),
      group('G', { opacity: 0 }),
      solid('blue', '#0000ff', { parentId: 'G' }),
    ];
    expect(at(flatten(layers, W, H))).toEqual([255, 0, 0, 255]);
  });

  it('嵌套组也能合成', () => {
    const layers = [
      group('G'),
      group('H', { parentId: 'G' }),
      solid('blue', '#0000ff', { parentId: 'H' }),
    ];
    expect(at(flatten(layers, W, H))).toEqual([0, 0, 255, 255]);
  });

  it('组内图层自己隐藏时不画', () => {
    const layers = [
      solid('red', '#ff0000'),
      group('G'),
      solid('blue', '#0000ff', { parentId: 'G', visible: false }),
    ];
    expect(at(flatten(layers, W, H))).toEqual([255, 0, 0, 255]);
  });
});

describe('组的不透明度与隔离', () => {
  it('组不透明度 50% 作用在整组结果上', () => {
    const layers = [
      solid('black', '#000000'),
      group('G', { opacity: 50 }),
      solid('white', '#ffffff', { parentId: 'G' }),
    ];
    const [r] = at(flatten(layers, W, H));
    // 黑底上盖 50% 白，应该在中灰附近
    expect(r).toBeGreaterThan(100);
    expect(r).toBeLessThan(155);
  });

  /*
   * 隔离的意义：组内两个图层先自己合成完，再作为整体按组不透明度混上去。
   * 如果没有隔离而是把 50% 分别乘到每个子图层上，结果会不一样。
   */
  it('组不透明度不是逐个子图层各乘一遍', () => {
    const isolated = flatten(
      [
        solid('black', '#000000'),
        group('G', { opacity: 50 }),
        solid('red', '#ff0000', { parentId: 'G' }),
        solid('blue', '#0000ff', { parentId: 'G' }),
      ],
      W,
      H,
    );
    // 组内 blue 完全盖住 red，整组结果是纯蓝，50% 混到黑底上
    const [r, gg, b] = at(isolated);
    expect(r).toBe(0);
    expect(gg).toBe(0);
    expect(b).toBeGreaterThan(100);
    expect(b).toBeLessThan(155);
  });
});

/*
 * 穿透与隔离的区别，是图层组最容易做错的地方。
 * 穿透：组内图层的混合模式直接作用在组下方的画面上。
 * 隔离：组内先合成成一张图（底下是透明的），再整体混上去。
 * 用「白色 + 正片叠底」能把两者分开：
 *   穿透 → 白 × 红 = 红
 *   隔离 → 组内底是透明，正片叠底出来还是白，再盖到红上 = 白
 */
describe('穿透与隔离', () => {
  const build = (groupExtra: Partial<Layer>) => [
    solid('red', '#ff0000'),
    group('G', groupExtra),
    solid('white', '#ffffff', { parentId: 'G', blendMode: 'multiply' }),
  ];

  it('穿透时组内混合模式作用到组下方的画面', () => {
    const out = flatten(build({ blendMode: 'pass-through' }), W, H);
    expect(at(out)).toEqual([255, 0, 0, 255]);
  });

  it('组设了混合模式就隔离，组内看不到下方画面', () => {
    const out = flatten(build({ blendMode: 'normal' }), W, H);
    expect(at(out)).toEqual([255, 255, 255, 255]);
  });

  it('穿透但不透明度小于 100 时也隔离', () => {
    const out = flatten(build({ blendMode: 'pass-through', opacity: 99 }), W, H);
    // 隔离后是白，99% 混到红上仍然接近白
    const [, g1] = at(out);
    expect(g1).toBeGreaterThan(200);
  });

  it('非组图层被设成穿透时按正常画，不能整层消失', () => {
    // pass-through 不在 CUSTOM 表里，不归一化会走进 blendImageData 的
    // 「没这个模式就 return」，结果整层不显示
    const layers = [solid('blue', '#0000ff', { blendMode: 'pass-through' })];
    expect(at(flatten(layers, W, H))).toEqual([0, 0, 255, 255]);
  });
});

describe('组合成不产生 NaN', () => {
  it('嵌套组 + 混合模式 + 不透明度下像素都是有效值', () => {
    const layers = [
      solid('red', '#ff0000'),
      group('G', { blendMode: 'linear-dodge', opacity: 60 }),
      solid('white', '#ffffff', { parentId: 'G', blendMode: 'multiply' }),
      group('H', { parentId: 'G', opacity: 40 }),
      solid('blue', '#0000ff', { parentId: 'H', blendMode: 'pin-light' }),
    ];
    const data = ctx2d(flatten(layers, W, H)).getImageData(0, 0, W, H).data;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });

  it('宽高为 1 的画布也能合成', () => {
    const canvas = createCanvas(1, 1);
    ctx2d(canvas).fillRect(0, 0, 1, 1);
    const layers = [group('G'), { ...solid('a', '#ff0000'), canvas, parentId: 'G' }];
    expect(() => flatten(layers, 1, 1)).not.toThrow();
  });
});
