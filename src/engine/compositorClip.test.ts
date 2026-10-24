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

/** 造一个图层，只填左半边，用来看剪贴是否把右半边剪掉了 */
function halfLeft(id: string, color: string, extra: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, W / 2, H);
  return base(id, canvas, extra);
}

/** 造一个填满整幅的图层 */
function full(id: string, color: string, extra: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, W, H);
  return base(id, canvas, extra);
}

function base(id: string, canvas: HTMLCanvasElement, extra: Partial<Layer>): Layer {
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

function at(canvas: HTMLCanvasElement, x: number, y = 0): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

describe('剪贴蒙版合成', () => {
  it('成员只在基底的不透明区域内显示', () => {
    // 基底左半红，成员整幅绿并剪贴到它
    const out = flatten([halfLeft('base', '#ff0000'), full('m', '#00ff00', { clipped: true })], W, H);
    expect(at(out, 0)).toEqual([0, 255, 0, 255]);
    // 基底右半透明，成员被剪掉，什么都不剩
    expect(at(out, 3)).toEqual([0, 0, 0, 0]);
  });

  it('不标 clipped 时成员照常盖满整幅', () => {
    const out = flatten([halfLeft('base', '#ff0000'), full('m', '#00ff00')], W, H);
    expect(at(out, 3)).toEqual([0, 255, 0, 255]);
  });

  it('多个连续成员共用一个基底', () => {
    const out = flatten(
      [
        halfLeft('base', '#ff0000'),
        full('m1', '#00ff00', { clipped: true }),
        // 只覆盖最左一列，用来确认它盖在 m1 之上而不是被 m1 顶掉
        base('m2', stripe('#0000ff'), { clipped: true }),
      ],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([0, 0, 255, 255]);
    expect(at(out, 1)).toEqual([0, 255, 0, 255]);
    expect(at(out, 3)).toEqual([0, 0, 0, 0]);
  });

  it('剪贴组之上未标记的图层不受影响', () => {
    const out = flatten(
      [
        halfLeft('base', '#ff0000'),
        full('m', '#00ff00', { clipped: true }),
        full('top', '#ffffff'),
      ],
      W,
      H,
    );
    // top 独立成段，盖住全幅
    expect(at(out, 3)).toEqual([255, 255, 255, 255]);
  });

  it('基底隐藏时成员也不显示', () => {
    const out = flatten(
      [halfLeft('base', '#ff0000', { visible: false }), full('m', '#00ff00', { clipped: true })],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([0, 0, 0, 0]);
  });

  it('成员隐藏时基底照常显示', () => {
    const out = flatten(
      [halfLeft('base', '#ff0000'), full('m', '#00ff00', { clipped: true, visible: false })],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([255, 0, 0, 255]);
  });

  it('基底的不透明度作用在整个剪贴组上', () => {
    const out = flatten(
      [
        full('bg', '#000000'),
        halfLeft('base', '#ff0000', { opacity: 50 }),
        full('m', '#00ff00', { clipped: true }),
      ],
      W,
      H,
    );
    // 半透明的绿压在黑底上：绿约一半
    const [r, g, b, a] = at(out, 0);
    expect(a).toBe(255);
    expect(r).toBe(0);
    expect(g).toBeGreaterThan(100);
    expect(g).toBeLessThan(160);
    expect(b).toBe(0);
  });

  it('同级最底那层标了 clipped 也照常显示（没有基底）', () => {
    const out = flatten([full('only', '#00ff00', { clipped: true })], W, H);
    expect(at(out, 0)).toEqual([0, 255, 0, 255]);
  });

  it('剪贴只在同级内生效，不跨组', () => {
    // 组内唯一的子层标了 clipped，组外下方的红层不该成为它的基底
    const out = flatten(
      [
        halfLeft('outside', '#ff0000'),
        group('G'),
        full('kid', '#00ff00', { parentId: 'G', clipped: true }),
      ],
      W,
      H,
    );
    expect(at(out, 3)).toEqual([0, 255, 0, 255]);
  });

  it('组可以当基底，成员被剪到组的合成结果里', () => {
    const out = flatten(
      [
        group('G'),
        halfLeft('kid', '#ff0000', { parentId: 'G' }),
        full('m', '#00ff00', { clipped: true }),
      ],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([0, 255, 0, 255]);
    expect(at(out, 3)).toEqual([0, 0, 0, 0]);
  });

  it('组可以当成员，被剪到下方图层里', () => {
    const out = flatten(
      [
        halfLeft('base', '#ff0000'),
        group('G', { clipped: true }),
        full('kid', '#00ff00', { parentId: 'G' }),
      ],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([0, 255, 0, 255]);
    expect(at(out, 3)).toEqual([0, 0, 0, 0]);
  });

  it('成员的混合模式作用在基底上，不作用于下方画面', () => {
    /*
     * 白底 + 红基底 + 正片叠底的绿成员。
     * 成员若混的是基底：红 x 绿 = 黑；若错混成白底：白 x 绿 = 绿。
     */
    const out = flatten(
      [
        full('bg', '#ffffff'),
        halfLeft('base', '#ff0000'),
        full('m', '#00ff00', { clipped: true, blendMode: 'multiply' }),
      ],
      W,
      H,
    );
    expect(at(out, 0)).toEqual([0, 0, 0, 255]);
  });

  it('手写混合模式（linear-dodge）下不产生 NaN', () => {
    const out = flatten(
      [
        full('bg', '#202020'),
        halfLeft('base', '#804020', { opacity: 70 }),
        full('m', '#4080ff', { clipped: true, blendMode: 'linear-dodge' }),
        full('m2', '#20ff40', { clipped: true, blendMode: 'pin-light', opacity: 45 }),
      ],
      W,
      H,
    );
    const data = ctx2d(out).getImageData(0, 0, W, H).data;
    for (let i = 0; i < data.length; i += 1) expect(Number.isNaN(data[i])).toBe(false);
  });

  it('1x1 画布上的剪贴不抛错', () => {
    const canvas = createCanvas(1, 1);
    ctx2d(canvas).fillRect(0, 0, 1, 1);
    const layers = [base('b', canvas, {}), base('m', createCanvas(1, 1), { clipped: true })];
    expect(() => flatten(layers, 1, 1)).not.toThrow();
  });
});

/** 只填最左一列的画布 */
function stripe(color: string): HTMLCanvasElement {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, 1, H);
  return canvas;
}
