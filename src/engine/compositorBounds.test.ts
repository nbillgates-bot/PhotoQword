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
import { flatten } from './compositor';

const W = 8;
const H = 8;

/**
 * 造一个「小于文档」的图层：画布只有 size×size，位置由 x/y 决定。
 * 这是 bounds 的核心场景 —— 图层画布不必和文档同尺寸。
 */
function patch(id: string, color: string, x: number, y: number, size = 4): Layer {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas, x, y),
    parentId: null,
  };
}

function at(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

const RED = [255, 0, 0, 255];
const BLANK = [0, 0, 0, 0];

describe('合成尊重图层 bounds', () => {
  it('图层画在 bounds.x/y 处，不是画在原点', () => {
    const out = flatten([patch('a', '#ff0000', 2, 3)], W, H);
    expect(at(out, 2, 3)).toEqual(RED);
    expect(at(out, 5, 6)).toEqual(RED);
    // 偏移之外应当是空的
    expect(at(out, 1, 3)).toEqual(BLANK);
    expect(at(out, 2, 2)).toEqual(BLANK);
    expect(at(out, 6, 3)).toEqual(BLANK);
  });

  it('bounds 在原点但画布小于文档时只画自己那块', () => {
    const out = flatten([patch('a', '#ff0000', 0, 0)], W, H);
    expect(at(out, 0, 0)).toEqual(RED);
    expect(at(out, 3, 3)).toEqual(RED);
    expect(at(out, 4, 4)).toEqual(BLANK);
  });

  it('负坐标的图层被文档边界裁掉，不报错', () => {
    const out = flatten([patch('a', '#ff0000', -2, -2)], W, H);
    expect(at(out, 0, 0)).toEqual(RED);
    expect(at(out, 1, 1)).toEqual(RED);
    expect(at(out, 2, 2)).toEqual(BLANK);
  });

  it('整个跑到文档外的图层什么都不画', () => {
    const out = flatten([patch('a', '#ff0000', W + 1, H + 1)], W, H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) expect(at(out, x, y)).toEqual(BLANK);
    }
  });

  it('手写混合模式路径也按 bounds 定位', () => {
    // 底色铺满，上面用 PS 特有的模式（走读回像素手算的那条路）
    const base = patch('base', '#808080', 0, 0, W);
    const top = { ...patch('top', '#ffffff', 4, 0), blendMode: 'linear-light' as const };
    const out = flatten([base, top], W, H);
    // 右半边被提亮，左半边保持底色
    expect(at(out, 5, 1)[0]).toBeGreaterThan(at(out, 1, 1)[0]);
  });

  it('合成结果不含 NaN', () => {
    const out = flatten([patch('a', '#ff0000', 2, 2), patch('b', '#00ff00', -1, 5)], W, H);
    const data = ctx2d(out).getImageData(0, 0, W, H).data;
    expect([...data].some((v) => Number.isNaN(v))).toBe(false);
  });
});
