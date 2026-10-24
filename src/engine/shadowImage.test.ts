/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { shadowFromCanvas, shadowFromPixels } from './shadowImage';
import { createCanvas, ctx2d } from './canvasUtils';
import { readAll } from './pixelDiff';

/** 造一张纯色画布 */
function solid(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

/** 取左上角那个像素的 RGBA */
function corner(image: ImageData): [number, number, number, number] {
  const { data } = image;
  return [data[0], data[1], data[2], data[3]];
}

describe('shadowFromPixels', () => {
  it('宽高来自传入的 ImageData', () => {
    const shadow = shadowFromPixels(readAll(solid(7, 3, '#ff0000')));
    expect(shadow.width).toBe(7);
    expect(shadow.height).toBe(3);
  });

  it('pixels 原样返回，不复制', () => {
    const pixels = readAll(solid(4, 4, '#00ff00'));
    const shadow = shadowFromPixels(pixels);
    expect(shadow.pixels()).toBe(pixels);
  });

  it('toCanvas 得到内容相同的画布', () => {
    const shadow = shadowFromPixels(readAll(solid(4, 4, '#0000ff')));
    expect(corner(readAll(shadow.toCanvas()))).toEqual([0, 0, 255, 255]);
  });
});

describe('shadowFromCanvas', () => {
  it('宽高立刻可用，不必先解像素', () => {
    const shadow = shadowFromCanvas(solid(5, 9, '#ff0000'));
    expect(shadow.width).toBe(5);
    expect(shadow.height).toBe(9);
  });

  it('pixels 解出的是冻结那一刻的画面', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#ff0000'));
    expect(corner(shadow.pixels())).toEqual([255, 0, 0, 255]);
  });

  /*
   * 这条是整个懒解方案的正确性前提。
   * 图层画布会被工具就地改写，影子必须是当时的拷贝而不是同一个引用，
   * 否则算出来的增量恒为空，撤销就回不去了。
   */
  it('源画布随后被改写，影子不受影响', () => {
    const source = solid(4, 4, '#ff0000');
    const shadow = shadowFromCanvas(source);

    const context = ctx2d(source);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 4, 4);

    expect(corner(shadow.pixels())).toEqual([255, 0, 0, 255]);
    expect(corner(readAll(source))).toEqual([0, 255, 0, 255]);
  });

  it('pixels 多次调用返回同一份，不重复回读', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#ff0000'));
    expect(shadow.pixels()).toBe(shadow.pixels());
  });

  // toCanvas 有两条分支（快照画布还在 / 已被 pixels 换成 ImageData），都要成立
  it('toCanvas 在解像素之前可用', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#ff0000'));
    expect(corner(readAll(shadow.toCanvas()))).toEqual([255, 0, 0, 255]);
  });

  it('toCanvas 在解像素之后可用', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#ff0000'));
    shadow.pixels();
    expect(corner(readAll(shadow.toCanvas()))).toEqual([255, 0, 0, 255]);
  });

  // 撤销时 toCanvas 的产物会成为图层画布，接着就被工具改写
  it('改写 toCanvas 的产物不影响影子', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#ff0000'));
    const copy = shadow.toCanvas();
    const context = ctx2d(copy);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 4, 4);
    expect(corner(shadow.pixels())).toEqual([255, 0, 0, 255]);
  });

  // 组的画布就是 1×1 占位，数量还最多，不能在这个尺寸上出岔
  it('1×1 画布也成立', () => {
    const shadow = shadowFromCanvas(solid(1, 1, '#ff0000'));
    expect(shadow.width).toBe(1);
    expect(corner(shadow.pixels())).toEqual([255, 0, 0, 255]);
    expect(corner(readAll(shadow.toCanvas()))).toEqual([255, 0, 0, 255]);
  });

  it('像素里不含 NaN', () => {
    const shadow = shadowFromCanvas(solid(4, 4, '#123456'));
    for (const value of shadow.pixels().data) expect(Number.isNaN(value)).toBe(false);
  });
});
