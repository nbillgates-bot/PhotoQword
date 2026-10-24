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
import {
  boundsFor,
  contentBounds,
  contentRect,
  coversDoc,
  docRect,
  expandToCover,
  intersectRect,
  pointInRect,
  toDoc,
  toLocal,
  translateBounds,
  unionRect,
  withCanvas,
} from './layerBounds';

/** 造一个左上角 2×2 填红的图层，用来验证长大之后像素有没有跟着搬 */
function mkLayer(x: number, y: number, size = 8): Layer {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, 2, 2);
  return {
    id: 'l1',
    name: 'l1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas, x, y),
  };
}

function alphaAt(layer: Layer, x: number, y: number): number {
  return ctx2d(layer.canvas).getImageData(x, y, 1, 1).data[3];
}

describe('docRect', () => {
  it('从原点起、按给定尺寸', () => {
    expect(docRect(80, 60)).toEqual({ x: 0, y: 0, width: 80, height: 60 });
  });

  it('尺寸下限为 1（0 与负数都被抬到 1）', () => {
    expect(docRect(0, -5)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('小数尺寸取整', () => {
    expect(docRect(10.6, 10.2)).toEqual({ x: 0, y: 0, width: 11, height: 10 });
  });
});

describe('boundsFor', () => {
  it('宽高取自画布，位置默认原点', () => {
    expect(boundsFor(createCanvas(30, 20))).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });

  it('位置可以为负（图层伸出文档左上角）', () => {
    expect(boundsFor(createCanvas(10, 10), -5, -8)).toEqual({
      x: -5,
      y: -8,
      width: 10,
      height: 10,
    });
  });

  it('位置取整，保证像素对齐', () => {
    expect(boundsFor(createCanvas(4, 4), 2.6, -1.4)).toMatchObject({ x: 3, y: -1 });
  });
});

describe('translateBounds', () => {
  it('只改位置不改尺寸', () => {
    const moved = translateBounds({ x: 5, y: 5, width: 10, height: 20 }, 3, -7);
    expect(moved).toEqual({ x: 8, y: -2, width: 10, height: 20 });
  });

  it('平移 0 时等值但是新对象', () => {
    const original = { x: 1, y: 2, width: 3, height: 4 };
    const moved = translateBounds(original, 0, 0);
    expect(moved).toEqual(original);
    expect(moved).not.toBe(original);
  });
});

describe('unionRect', () => {
  it('取两者的最小外接矩形', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 20, y: 5, width: 10, height: 10 };
    expect(unionRect(a, b)).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });

  it('一个完全包含另一个时返回大的那个', () => {
    const big = { x: 0, y: 0, width: 100, height: 100 };
    const small = { x: 10, y: 10, width: 5, height: 5 };
    expect(unionRect(big, small)).toEqual(big);
  });

  it('负坐标参与时向左上扩张', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: -5, y: -5, width: 3, height: 3 };
    expect(unionRect(a, b)).toEqual({ x: -5, y: -5, width: 15, height: 15 });
  });
});

describe('intersectRect', () => {
  it('部分重叠时返回公共部分', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersectRect(a, b)).toEqual({ x: 5, y: 5, width: 5, height: 5 });
  });

  it('完全不相交时返回 null', () => {
    const a = { x: 0, y: 0, width: 5, height: 5 };
    const b = { x: 100, y: 100, width: 5, height: 5 };
    expect(intersectRect(a, b)).toBeNull();
  });

  it('仅边相接（宽为 0）视为不相交', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(intersectRect(a, b)).toBeNull();
  });

  it('1×1 的交集也能取到（边界值）', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 9, y: 9, width: 10, height: 10 };
    expect(intersectRect(a, b)).toEqual({ x: 9, y: 9, width: 1, height: 1 });
  });
});

describe('pointInRect', () => {
  const rect = { x: 10, y: 20, width: 30, height: 40 };

  it('内部的点算命中', () => {
    expect(pointInRect(rect, 25, 40)).toBe(true);
  });

  it('四条边都算命中，闭区间', () => {
    // 命中检测按闭区间处理：点在框边缘上，用户看到的是点在字上
    expect(pointInRect(rect, 10, 20)).toBe(true); // 左上角
    expect(pointInRect(rect, 40, 20)).toBe(true); // 右上角
    expect(pointInRect(rect, 10, 60)).toBe(true); // 左下角
    expect(pointInRect(rect, 40, 60)).toBe(true); // 右下角
  });

  it('四个方向各差一点都不算命中', () => {
    expect(pointInRect(rect, 9, 40)).toBe(false);
    expect(pointInRect(rect, 41, 40)).toBe(false);
    expect(pointInRect(rect, 25, 19)).toBe(false);
    expect(pointInRect(rect, 25, 61)).toBe(false);
  });

  it('宽高为 0 的框只命中它那一个点', () => {
    const dot = { x: 5, y: 5, width: 0, height: 0 };
    expect(pointInRect(dot, 5, 5)).toBe(true);
    expect(pointInRect(dot, 5.5, 5)).toBe(false);
  });

  it('负坐标的框照样算得对', () => {
    const neg = { x: -20, y: -10, width: 5, height: 5 };
    expect(pointInRect(neg, -18, -8)).toBe(true);
    expect(pointInRect(neg, 0, 0)).toBe(false);
  });

  it('小数坐标不被取整吞掉', () => {
    expect(pointInRect(rect, 10.5, 20.5)).toBe(true);
    expect(pointInRect(rect, 9.5, 20.5)).toBe(false);
  });
});

describe('coversDoc', () => {
  it('完全重合时为真', () => {
    expect(coversDoc({ x: 0, y: 0, width: 40, height: 30 }, 40, 30)).toBe(true);
  });

  it('位置偏移或尺寸不同都为假', () => {
    expect(coversDoc({ x: 1, y: 0, width: 40, height: 30 }, 40, 30)).toBe(false);
    expect(coversDoc({ x: 0, y: 0, width: 40, height: 20 }, 40, 30)).toBe(false);
  });
});

describe('withCanvas', () => {
  it('bounds 尺寸跟着新画布走，位置默认不变', () => {
    const layer = mkLayer(5, 7);
    const next = withCanvas(layer, createCanvas(3, 4));
    expect(next.bounds).toEqual({ x: 5, y: 7, width: 3, height: 4 });
  });

  it('可以同时指定新位置', () => {
    const next = withCanvas(mkLayer(5, 7), createCanvas(3, 4), 0, 0);
    expect(next.bounds).toEqual({ x: 0, y: 0, width: 3, height: 4 });
  });

  it('不改原图层', () => {
    const layer = mkLayer(5, 7);
    withCanvas(layer, createCanvas(3, 4), 0, 0);
    expect(layer.bounds).toEqual({ x: 5, y: 7, width: 8, height: 8 });
  });
});

describe('expandToCover', () => {
  it('已经覆盖住时原样返回同一个对象', () => {
    const layer = mkLayer(0, 0, 16);
    expect(expandToCover(layer, docRect(16, 16))).toBe(layer);
  });

  it('目标在右下时向右下长大，位置不动', () => {
    const layer = mkLayer(0, 0, 8);
    const grown = expandToCover(layer, { x: 4, y: 4, width: 16, height: 16 });
    expect(grown.bounds).toEqual({ x: 0, y: 0, width: 20, height: 20 });
    expect(grown.canvas.width).toBe(20);
  });

  it('目标在左上时向左上长大，位置变负，像素跟着搬', () => {
    // 图层在 (10,10)，红块在它的局部 (0,0)-(1,1)，即文档 (10,10)
    const layer = mkLayer(10, 10);
    const grown = expandToCover(layer, docRect(16, 16));
    expect(grown.bounds).toEqual({ x: 0, y: 0, width: 18, height: 18 });
    // 红块在新画布里应落到局部 (10,10)，原位置 (0,0) 变空
    expect(alphaAt(grown, 10, 10)).toBeGreaterThan(200);
    expect(alphaAt(grown, 0, 0)).toBe(0);
  });

  it('bounds 为负时长大后位置取到负值那一侧', () => {
    const layer = mkLayer(-6, -6);
    const grown = expandToCover(layer, docRect(16, 16));
    expect(grown.bounds).toEqual({ x: -6, y: -6, width: 22, height: 22 });
    // 原本在局部 (0,0) 的红块位置不变，因为左上角没往外扩
    expect(alphaAt(grown, 0, 0)).toBeGreaterThan(200);
  });

  it('长大后 bounds 宽高恒等于画布宽高', () => {
    const grown = expandToCover(mkLayer(7, -3), docRect(16, 16));
    expect(grown.bounds.width).toBe(grown.canvas.width);
    expect(grown.bounds.height).toBe(grown.canvas.height);
  });

  it('不改原图层的画布与 bounds', () => {
    const layer = mkLayer(10, 10);
    expandToCover(layer, docRect(16, 16));
    expect(layer.bounds).toEqual({ x: 10, y: 10, width: 8, height: 8 });
    expect(layer.canvas.width).toBe(8);
  });

  it('长大后的像素里没有 NaN', () => {
    const grown = expandToCover(mkLayer(10, 10), docRect(16, 16));
    const data = ctx2d(grown.canvas).getImageData(0, 0, grown.canvas.width, grown.canvas.height).data;
    expect([...data].some((v) => Number.isNaN(v))).toBe(false);
  });

  it('1×1 画布也能长大', () => {
    const grown = expandToCover(mkLayer(0, 0, 1), docRect(4, 4));
    expect(grown.bounds).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });
});

describe('contentBounds', () => {
  /** 在指定矩形里填不透明红色 */
  function withRect(
    width: number,
    height: number,
    rect: { x: number; y: number; w: number; h: number },
  ): HTMLCanvasElement {
    const canvas = createCanvas(width, height);
    const context = ctx2d(canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(rect.x, rect.y, rect.w, rect.h);
    return canvas;
  }

  it('取到不透明像素的外接矩形', () => {
    expect(contentBounds(withRect(10, 10, { x: 2, y: 3, w: 4, h: 2 }))).toEqual({
      x: 2,
      y: 3,
      width: 4,
      height: 2,
    });
  });

  it('全透明返回 null', () => {
    expect(contentBounds(createCanvas(4, 4))).toBeNull();
  });

  it('铺满时范围等于整幅', () => {
    expect(contentBounds(withRect(3, 3, { x: 0, y: 0, w: 3, h: 3 }))).toEqual({
      x: 0,
      y: 0,
      width: 3,
      height: 3,
    });
  });

  it('单像素画布：有内容时宽高都是 1', () => {
    expect(contentBounds(withRect(1, 1, { x: 0, y: 0, w: 1, h: 1 }))).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('只有首尾两个角有像素时范围覆盖整幅', () => {
    const canvas = createCanvas(5, 5);
    const context = ctx2d(canvas);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 1, 1);
    context.fillRect(4, 4, 1, 1);
    expect(contentBounds(canvas)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });

  it('宽或高为 0 的画布返回 null，不抛错', () => {
    expect(contentBounds(createCanvas(0, 4))).toBeNull();
    expect(contentBounds(createCanvas(4, 0))).toBeNull();
  });

  it('半透明像素也算内容', () => {
    const canvas = createCanvas(4, 4);
    const context = ctx2d(canvas);
    context.fillStyle = 'rgba(255,0,0,0.02)';
    context.fillRect(1, 1, 1, 1);
    const bounds = contentBounds(canvas);
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBe(1);
  });
});

describe('contentRect', () => {
  it('内容范围加上图层位置，得到文档坐标的矩形', () => {
    // mkLayer 在画布 (0,0)-(2,2) 填红，图层位置 (10,20)
    expect(contentRect(mkLayer(10, 20))).toEqual({ x: 10, y: 20, width: 2, height: 2 });
  });

  it('图层在原点时与内容范围一致', () => {
    expect(contentRect(mkLayer(0, 0))).toEqual({ x: 0, y: 0, width: 2, height: 2 });
  });

  it('负位置得到负坐标', () => {
    expect(contentRect(mkLayer(-5, -3))).toEqual({ x: -5, y: -3, width: 2, height: 2 });
  });

  it('全透明图层返回 null', () => {
    const canvas = createCanvas(8, 8);
    const layer = { ...mkLayer(4, 4), canvas, bounds: boundsFor(canvas, 4, 4) };
    expect(contentRect(layer)).toBeNull();
  });

  it('内容不在画布左上角时位置累加正确', () => {
    const canvas = createCanvas(8, 8);
    const context = ctx2d(canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(3, 5, 2, 1);
    const layer = { ...mkLayer(0, 0), canvas, bounds: boundsFor(canvas, 100, 200) };
    expect(contentRect(layer)).toEqual({ x: 103, y: 205, width: 2, height: 1 });
  });
});

describe('坐标换算', () => {
  const bounds = { x: 10, y: 20, width: 50, height: 50 };

  it('文档坐标与图层局部坐标互为逆运算', () => {
    const local = toLocal(bounds, 35, 45);
    expect(local).toEqual({ x: 25, y: 25 });
    expect(toDoc(bounds, local.x, local.y)).toEqual({ x: 35, y: 45 });
  });

  it('bounds 为负位置时换算依然成立', () => {
    const negative = { x: -8, y: -3, width: 20, height: 20 };
    expect(toLocal(negative, 0, 0)).toEqual({ x: 8, y: 3 });
    expect(toDoc(negative, 8, 3)).toEqual({ x: 0, y: 0 });
  });

  it('局部坐标可以为负（点在图层之外）', () => {
    expect(toLocal(bounds, 0, 0)).toEqual({ x: -10, y: -20 });
  });
});
