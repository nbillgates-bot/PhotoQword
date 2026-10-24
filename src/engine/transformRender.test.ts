/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createTransformState } from './transformBox';
import { renderTransformed, renderTransformedTo, transformedBounds } from './transformRender';

/**
 * 变换落像素。这里最要紧的一条是 transformedBounds 必须真的把变换结果全包住：
 * 少算一个像素，确认时图层画布就小一圈，边上那一行像素被永久裁掉。
 */

const state = (over: Partial<ReturnType<typeof createTransformState>> = {}) => ({
  ...createTransformState({ x: 0, y: 0, width: 10, height: 10 }),
  ...over,
});

/** 一张纯红的源画布 */
function redSource(width = 10, height = 10) {
  const canvas = createCanvas(width, height);
  fillCanvas(canvas, '#ff0000');
  return canvas;
}

const alphaAt = (canvas: HTMLCanvasElement, x: number, y: number) =>
  ctx2d(canvas).getImageData(x, y, 1, 1).data[3];

describe('transformedBounds', () => {
  it('没有旋转斜切时就是矩形本身', () => {
    expect(transformedBounds(state())).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('矩形移到画布外时 bounds 跟着变负', () => {
    expect(transformedBounds(state({ rect: { x: -20, y: -5, width: 10, height: 10 } })))
      .toEqual({ x: -20, y: -5, width: 10, height: 10 });
  });

  it('负宽高会归一化：外接矩形与正向等价', () => {
    const negative = transformedBounds(state({ rect: { x: 10, y: 10, width: -10, height: -10 } }));
    expect(negative).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('旋转 45° 后外接矩形变大，且仍以中心对称', () => {
    const bounds = transformedBounds(state({ angle: Math.PI / 4 }));
    /*
     * 10 的正方形绕中心 (5,5) 转 45°，半对角线 5√2 ≈ 7.07，
     * 所以跨度是 -2.07 ~ 12.07。floor/ceil 各往外让一格，得 -3 ~ 13 共 16。
     */
    expect(bounds.width).toBe(16);
    expect(bounds.height).toBe(16);
    expect(bounds.x + bounds.width / 2).toBeCloseTo(5, 5);
  });

  it('旋转 90° 的宽高与原来互换（正方形则不变）', () => {
    const bounds = transformedBounds(
      state({ rect: { x: 0, y: 0, width: 20, height: 4 }, angle: Math.PI / 2 }),
    );
    expect(bounds.width).toBe(4);
    expect(bounds.height).toBe(20);
  });

  it('非整数坐标往外取整，不切掉边上的抗锯齿', () => {
    const bounds = transformedBounds(state({ rect: { x: 0.5, y: 0.5, width: 10, height: 10 } }));
    expect(bounds.x).toBe(0);
    expect(bounds.y).toBe(0);
    // 右下到 10.5，往外取整到 11，所以宽是 11
    expect(bounds.width).toBe(11);
  });

  it('压成线或点时宽高至少是 1，画布建得出来', () => {
    const flat = transformedBounds(state({ rect: { x: 3, y: 3, width: 0, height: 0 } }));
    expect(flat.width).toBeGreaterThanOrEqual(1);
    expect(flat.height).toBeGreaterThanOrEqual(1);
  });

  it('斜切后的外接矩形把斜出去的部分算进来', () => {
    const plain = transformedBounds(state());
    const skewed = transformedBounds(state({ skewX: Math.PI / 6 }));
    expect(skewed.width).toBeGreaterThan(plain.width);
  });
});

describe('renderTransformed', () => {
  it('画进目标画布，位置按 offset 换算', () => {
    const target = createCanvas(10, 10);
    // 源在文档 (5,5)-(15,15)，目标左上角也在 (5,5)，所以整块落在画布里
    renderTransformed(target, redSource(), state({ rect: { x: 5, y: 5, width: 10, height: 10 } }), { x: 5, y: 5 });
    expect(alphaAt(target, 1, 1)).toBeGreaterThan(200);
    expect(alphaAt(target, 9, 9)).toBeGreaterThan(200);
  });

  it('先清空再画：上一帧的内容不会留下', () => {
    const target = createCanvas(20, 20);
    fillCanvas(target, '#0000ff');
    renderTransformed(target, redSource(), state({ rect: { x: 0, y: 0, width: 4, height: 4 } }), { x: 0, y: 0 });
    // 4x4 之外应当被清空，不是残留的蓝色
    expect(alphaAt(target, 15, 15)).toBe(0);
  });

  it('画完矩阵已复位，后续普通绘制不受影响', () => {
    const target = createCanvas(20, 20);
    renderTransformed(target, redSource(), state({ angle: 0.7, skewX: 0.3 }), { x: 0, y: 0 });
    const context = ctx2d(target);
    context.fillStyle = '#00ff00';
    context.fillRect(18, 18, 2, 2);
    const [, g] = ctx2d(target).getImageData(19, 19, 1, 1).data;
    expect(g).toBeGreaterThan(200);
  });

  it('结果不含 NaN', () => {
    const target = createCanvas(8, 8);
    renderTransformed(target, redSource(8, 8), state({ angle: Math.PI / 5, skewY: 0.2 }), { x: 0, y: 0 });
    const { data } = ctx2d(target).getImageData(0, 0, 8, 8);
    expect(Array.from(data).some(Number.isNaN)).toBe(false);
  });

  it('零尺寸矩形不抛错', () => {
    const target = createCanvas(8, 8);
    expect(() =>
      renderTransformed(target, redSource(), state({ rect: { x: 0, y: 0, width: 0, height: 0 } }), { x: 0, y: 0 }),
    ).not.toThrow();
  });
});

describe('renderTransformedTo', () => {
  it('新画布尺寸等于给的 bounds', () => {
    const bounds = { x: -5, y: -5, width: 12, height: 7 };
    const canvas = renderTransformedTo(redSource(), state(), bounds);
    expect(canvas.width).toBe(12);
    expect(canvas.height).toBe(7);
  });

  it('按 transformedBounds 建画布时，四角的内容都装得下', () => {
    // 移出画布左上角：出界的部分必须完整落在新画布里
    const current = state({ rect: { x: -6, y: -6, width: 10, height: 10 } });
    const bounds = transformedBounds(current);
    const canvas = renderTransformedTo(redSource(), current, bounds);
    expect(alphaAt(canvas, 0, 0)).toBeGreaterThan(200);
    expect(alphaAt(canvas, bounds.width - 1, bounds.height - 1)).toBeGreaterThan(200);
  });

  it('旋转后新画布的四条边上都还有内容，说明没多算也没少算', () => {
    const current = state({ angle: Math.PI / 4 });
    const bounds = transformedBounds(current);
    const canvas = renderTransformedTo(redSource(), current, bounds);
    const mid = Math.floor(bounds.width / 2);
    // 转 45° 的正方形，四条边的中点正对着菱形的四个尖
    expect(alphaAt(canvas, mid, 1)).toBeGreaterThan(0);
    expect(alphaAt(canvas, mid, bounds.height - 2)).toBeGreaterThan(0);
    expect(alphaAt(canvas, 1, mid)).toBeGreaterThan(0);
    expect(alphaAt(canvas, bounds.width - 2, mid)).toBeGreaterThan(0);
  });

  it('不改动源画布', () => {
    const origin = redSource();
    renderTransformedTo(origin, state({ angle: 1 }), transformedBounds(state({ angle: 1 })));
    expect(alphaAt(origin, 5, 5)).toBeGreaterThan(200);
    expect(origin.width).toBe(10);
  });
});
