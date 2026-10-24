/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  buildSelection,
  ellipseSelection,
  lassoSelection,
  maskBounds,
  rectSelection,
  wandSelection,
} from './selection';
import { createCanvas, ctx2d } from './canvasUtils';

function alphaAt(mask: HTMLCanvasElement, x: number, y: number): number {
  return ctx2d(mask).getImageData(x, y, 1, 1).data[3];
}

/** 蒙版里既不是全选中也不是全不选的像素个数——消除锯齿的判据 */
function partialCount(mask: HTMLCanvasElement): number {
  const { data } = ctx2d(mask).getImageData(0, 0, mask.width, mask.height);
  let n = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0 && data[i] < 255) n += 1;
  }
  return n;
}

/** 画一块纯色方块，供魔棒取样 */
function blockCanvas(size: number, rect: { x: number; y: number; w: number; h: number }) {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  return canvas;
}

describe('maskBounds', () => {
  it('空蒙版返回全 0', () => {
    expect(maskBounds(createCanvas(16, 16))).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('准确框出非零像素的外接矩形（含边界像素）', () => {
    const mask = createCanvas(20, 20);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(4, 6, 5, 3);
    expect(maskBounds(mask)).toEqual({ x: 4, y: 6, width: 5, height: 3 });
  });
});

describe('buildSelection', () => {
  it('没画到任何像素时返回 null', () => {
    expect(buildSelection(16, 16, () => {})).toBeNull();
  });

  it('不羽化时选区内实心、边界锐利', () => {
    const selection = rectSelection(20, 20, { x: 5, y: 5, width: 10, height: 10 });
    expect(selection).not.toBeNull();
    expect(alphaAt(selection!.mask, 10, 10)).toBe(255);
    expect(alphaAt(selection!.mask, 2, 2)).toBe(0);
    expect(selection!.bounds).toEqual({ x: 5, y: 5, width: 10, height: 10 });
  });

  it('羽化让边界渗出半透明像素，且 bounds 随之扩大', () => {
    const hard = rectSelection(40, 40, { x: 12, y: 12, width: 16, height: 16 });
    const soft = rectSelection(40, 40, { x: 12, y: 12, width: 16, height: 16 }, { feather: 4 });
    expect(soft).not.toBeNull();

    // 原矩形之外应出现过渡像素——这是羽化生效的判据，
    // 不支持 ctx.filter 的环境走手写回退，结论必须一样成立
    const outside = alphaAt(soft!.mask, 10, 20);
    expect(outside).toBeGreaterThan(0);
    expect(outside).toBeLessThan(255);
    expect(soft!.bounds.width).toBeGreaterThan(hard!.bounds.width);
    expect(soft!.bounds.height).toBeGreaterThan(hard!.bounds.height);
  });

  it('羽化后中心仍然保持全选中', () => {
    const soft = rectSelection(40, 40, { x: 8, y: 8, width: 24, height: 24 }, { feather: 3 });
    expect(alphaAt(soft!.mask, 20, 20)).toBe(255);
  });
});

/*
 * 消除锯齿以前只是选项栏上一个不接线的勾选框：勾不勾结果一模一样。
 * 这组用例钉住它真的接上了引擎。
 */
describe('消除锯齿', () => {
  const ellipseRect = { x: 4, y: 4, width: 25, height: 17 };

  it('开着时斜边上有半透明过渡像素', () => {
    const on = ellipseSelection(40, 40, ellipseRect, { antiAlias: true })!;
    expect(partialCount(on.mask)).toBeGreaterThan(0);
  });

  it('关掉后蒙版只剩 0 和 255，边缘是硬锯齿', () => {
    const off = ellipseSelection(40, 40, ellipseRect, { antiAlias: false })!;
    expect(partialCount(off.mask)).toBe(0);
  });

  it('默认是开着的，与 PS 的默认一致', () => {
    const fallback = ellipseSelection(40, 40, ellipseRect)!;
    const explicit = ellipseSelection(40, 40, ellipseRect, { antiAlias: true })!;
    expect(partialCount(fallback.mask)).toBe(partialCount(explicit.mask));
  });

  it('关掉锯齿不会掏空选区，中心照样全选中', () => {
    const off = ellipseSelection(40, 40, ellipseRect, { antiAlias: false })!;
    expect(alphaAt(off.mask, 16, 12)).toBe(255);
    expect(alphaAt(off.mask, 1, 1)).toBe(0);
  });

  it('套索的斜边同样受消除锯齿控制', () => {
    const points = [
      { x: 2, y: 2 },
      { x: 30, y: 9 },
      { x: 14, y: 30 },
    ];
    expect(partialCount(lassoSelection(40, 40, points, { antiAlias: true })!.mask)).toBeGreaterThan(0);
    expect(partialCount(lassoSelection(40, 40, points, { antiAlias: false })!.mask)).toBe(0);
  });

  it('矩形边界落在整像素上，开关都不产生过渡像素', () => {
    // PS 正因如此把矩形选框的「消除锯齿」置灰
    const rect = { x: 5, y: 5, width: 10, height: 10 };
    expect(partialCount(rectSelection(20, 20, rect, { antiAlias: true })!.mask)).toBe(0);
    expect(partialCount(rectSelection(20, 20, rect, { antiAlias: false })!.mask)).toBe(0);
  });

  it('关掉锯齿仍然可以羽化，两者互不吞掉', () => {
    // 先硬化再羽化：硬化不能把羽化的过渡带抹平
    const soft = ellipseSelection(40, 40, ellipseRect, { antiAlias: false, feather: 3 })!;
    expect(partialCount(soft.mask)).toBeGreaterThan(0);
    expect(alphaAt(soft.mask, 16, 12)).toBe(255);
  });

  it('蒙版里没有 NaN', () => {
    const off = ellipseSelection(40, 40, ellipseRect, { antiAlias: false })!;
    const { data } = ctx2d(off.mask).getImageData(0, 0, 40, 40);
    for (let i = 0; i < data.length; i += 1) expect(Number.isNaN(data[i])).toBe(false);
  });
});

describe('魔棒', () => {
  const source = blockCanvas(24, { x: 6, y: 6, w: 8, h: 8 });
  const click = { x: 9, y: 9 };

  it('消除锯齿不会让选区胀大一圈', () => {
    // 软化只作用在原本就选中的那一圈边界像素上，范围必须原封不动
    const on = wandSelection(source, click, { tolerance: 10, contiguous: true, antiAlias: true })!;
    const off = wandSelection(source, click, { tolerance: 10, contiguous: true, antiAlias: false })!;
    expect(on.bounds).toEqual(off.bounds);
    expect(on.bounds).toEqual({ x: 6, y: 6, width: 8, height: 8 });
  });

  it('开着消除锯齿时边界像素是部分覆盖，关掉则是硬边', () => {
    const on = wandSelection(source, click, { tolerance: 10, contiguous: true, antiAlias: true })!;
    const off = wandSelection(source, click, { tolerance: 10, contiguous: true, antiAlias: false })!;
    expect(partialCount(on.mask)).toBeGreaterThan(0);
    expect(partialCount(off.mask)).toBe(0);
    // 无论开关，内部都是全选中
    expect(alphaAt(on.mask, 9, 9)).toBe(255);
    expect(alphaAt(off.mask, 9, 9)).toBe(255);
  });

  it('取样点模式只看单个像素', () => {
    const selection = wandSelection(source, click, {
      tolerance: 0,
      sampleSize: 1,
      contiguous: true,
      antiAlias: false,
    })!;
    expect(selection.bounds).toEqual({ x: 6, y: 6, width: 8, height: 8 });
  });

  it('取样大小放大后取的是邻域平均，点在边缘会把周围的底色算进去', () => {
    /*
     * 点在红块左上角：11x11 的邻域里一半是透明底，平均出来的颜色
     * 既不是纯红也不是纯透明，容差为 0 时谁都匹配不上。
     */
    const corner = { x: 6, y: 6 };
    const point = wandSelection(source, corner, {
      tolerance: 0,
      sampleSize: 1,
      contiguous: true,
      antiAlias: false,
    });
    const averaged = wandSelection(source, corner, {
      tolerance: 0,
      sampleSize: 11,
      contiguous: true,
      antiAlias: false,
    });
    expect(point!.bounds).toEqual({ x: 6, y: 6, width: 8, height: 8 });
    expect(averaged).toBeNull();
  });

  it('取样区域越界时不读出画布外的像素', () => {
    // 点在左上角，101x101 的窗口大半在画布外，只能统计画布内的部分
    const edge = blockCanvas(8, { x: 0, y: 0, w: 8, h: 8 });
    const selection = wandSelection(edge, { x: 0, y: 0 }, {
      tolerance: 0,
      sampleSize: 101,
      contiguous: true,
      antiAlias: false,
    })!;
    expect(selection.bounds).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });

  it('1×1 画布上不产生 NaN', () => {
    const tiny = blockCanvas(1, { x: 0, y: 0, w: 1, h: 1 });
    const selection = wandSelection(tiny, { x: 0, y: 0 }, {
      tolerance: 50,
      sampleSize: 11,
      contiguous: true,
    })!;
    expect(selection).not.toBeNull();
    for (const v of Object.values(selection.bounds)) expect(Number.isNaN(v)).toBe(false);
  });
});
