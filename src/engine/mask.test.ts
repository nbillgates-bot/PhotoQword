/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  applyMask,
  createMask,
  fillMask,
  invalidateMask,
  invertMask,
  maskFromSelection,
  maskToAlpha,
} from './mask';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { recordContextOptions } from './testUtils';

/** 读某点像素，返回 [r,g,b,a] */
function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

/** 造一张纯色图层 */
function solid(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  fillCanvas(canvas, color);
  return canvas;
}

describe('createMask', () => {
  it('创建时就声明 willReadFrequently，蒙版像素也要进历史差分', () => {
    // fillCanvas 会先建上下文，声明晚一步就没机会了，所以断言的是第一次调用
    const { options } = recordContextOptions(() => createMask(4, 4));
    expect(options[0]?.willReadFrequently).toBe(true);
  });

  it('reveal 为 true 时全白，表示全部显示', () => {
    const mask = createMask(4, 4, true);
    expect(px(mask, 0, 0)).toEqual([255, 255, 255, 255]);
    expect(px(mask, 3, 3)).toEqual([255, 255, 255, 255]);
  });

  it('reveal 为 false 时全黑，表示全部隐藏', () => {
    const mask = createMask(4, 4, false);
    expect(px(mask, 2, 2)).toEqual([0, 0, 0, 255]);
  });

  it('宽高为 1 也能正常建', () => {
    const mask = createMask(1, 1, true);
    expect(mask.width).toBe(1);
    expect(mask.height).toBe(1);
    expect(px(mask, 0, 0)[0]).toBe(255);
  });
});

describe('maskToAlpha', () => {
  it('白色变成 alpha 255，黑色变成 alpha 0', () => {
    const mask = createCanvas(2, 1);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = '#000000';
    context.fillRect(1, 0, 1, 1);

    const alpha = maskToAlpha(mask);
    expect(px(alpha, 0, 0)[3]).toBe(255);
    expect(px(alpha, 1, 0)[3]).toBe(0);
  });

  it('中灰变成中间 alpha', () => {
    const mask = createMask(2, 2, false);
    fillMask(mask, 128);
    const alpha = maskToAlpha(mask);
    const value = px(alpha, 0, 0)[3];
    expect(value).toBeGreaterThan(120);
    expect(value).toBeLessThan(136);
  });

  it('RGB 一律置为白，只有 alpha 携带信息', () => {
    const mask = createMask(2, 2, false);
    fillMask(mask, 90);
    const alpha = maskToAlpha(mask);
    const [r, g, b] = px(alpha, 1, 1);
    expect([r, g, b]).toEqual([255, 255, 255]);
  });

  it('结果不含 NaN', () => {
    const mask = createMask(3, 3, true);
    const data = ctx2d(maskToAlpha(mask)).getImageData(0, 0, 3, 3).data;
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });

  it('同一张未改动的蒙版返回缓存的同一个对象', () => {
    const mask = createMask(4, 4, true);
    expect(maskToAlpha(mask)).toBe(maskToAlpha(mask));
  });

  it('invalidateMask 之后重新计算', () => {
    const mask = createMask(4, 4, true);
    const first = maskToAlpha(mask);
    invalidateMask(mask);
    expect(maskToAlpha(mask)).not.toBe(first);
  });

  it('改了像素但忘记失效缓存会拿到旧结果（记录该约定的代价）', () => {
    const mask = createMask(4, 4, true);
    maskToAlpha(mask);
    // 故意绕过 fillMask，直接改像素不失效缓存
    fillCanvas(mask, '#000000');
    expect(px(maskToAlpha(mask), 0, 0)[3]).toBe(255);
    invalidateMask(mask);
    expect(px(maskToAlpha(mask), 0, 0)[3]).toBe(0);
  });
});

describe('applyMask', () => {
  it('白蒙版处保留像素，黑蒙版处清空', () => {
    const layer = solid(2, 1, '#ff0000');
    const mask = createCanvas(2, 1);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = '#000000';
    context.fillRect(1, 0, 1, 1);

    const result = applyMask(layer, mask);
    expect(px(result, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(px(result, 1, 0)[3]).toBe(0);
  });

  it('不改动传入的图层与蒙版', () => {
    const layer = solid(2, 2, '#00ff00');
    const mask = createMask(2, 2, false);
    applyMask(layer, mask);
    expect(px(layer, 0, 0)).toEqual([0, 255, 0, 255]);
    expect(px(mask, 0, 0)).toEqual([0, 0, 0, 255]);
  });

  it('中灰蒙版得到半透明结果', () => {
    const layer = solid(2, 2, '#0000ff');
    const mask = createMask(2, 2, false);
    fillMask(mask, 128);
    const alpha = px(applyMask(layer, mask), 0, 0)[3];
    expect(alpha).toBeGreaterThan(100);
    expect(alpha).toBeLessThan(150);
  });

  it('蒙版尺寸与图层不一致时拉伸对齐', () => {
    const layer = solid(4, 4, '#ffffff');
    const mask = createMask(2, 2, true);
    const result = applyMask(layer, mask);
    expect(result.width).toBe(4);
    expect(px(result, 3, 3)[3]).toBe(255);
  });

  it('结果不含 NaN', () => {
    const layer = solid(3, 3, '#123456');
    const mask = createMask(3, 3, true);
    const data = ctx2d(applyMask(layer, mask)).getImageData(0, 0, 3, 3).data;
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });
});

describe('invertMask', () => {
  it('白变黑、黑变白', () => {
    const mask = createMask(2, 2, true);
    invertMask(mask);
    expect(px(mask, 0, 0)).toEqual([0, 0, 0, 255]);
    invertMask(mask);
    expect(px(mask, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('反相后缓存已失效，合成拿到新的 alpha', () => {
    const mask = createMask(2, 2, true);
    expect(px(maskToAlpha(mask), 0, 0)[3]).toBe(255);
    invertMask(mask);
    expect(px(maskToAlpha(mask), 0, 0)[3]).toBe(0);
  });
});

describe('fillMask', () => {
  it('按给定灰度填满', () => {
    const mask = createMask(2, 2, true);
    fillMask(mask, 64);
    expect(px(mask, 1, 1)).toEqual([64, 64, 64, 255]);
  });

  it('超出 0-255 的取值被夹紧', () => {
    const mask = createMask(2, 2, true);
    fillMask(mask, 999);
    expect(px(mask, 0, 0)[0]).toBe(255);
    fillMask(mask, -20);
    expect(px(mask, 0, 0)[0]).toBe(0);
  });

  it('小数取值四舍五入而不是产生 NaN', () => {
    const mask = createMask(2, 2, true);
    fillMask(mask, 0.6);
    expect(px(mask, 0, 0)[0]).toBe(1);
  });
});

describe('maskFromSelection', () => {
  it('选中处为白，未选中处为黑', () => {
    const selection = createCanvas(4, 4);
    const context = ctx2d(selection);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 2, 4);

    const mask = maskFromSelection(selection, { width: 4, height: 4, x: 0, y: 0 });
    expect(px(mask, 0, 0)[0]).toBe(255);
    expect(px(mask, 3, 0)[0]).toBe(0);
  });

  it('空选区蒙版得到全黑蒙版', () => {
    const selection = createCanvas(4, 4);
    const mask = maskFromSelection(selection, { width: 4, height: 4, x: 0, y: 0 });
    expect(px(mask, 2, 2)).toEqual([0, 0, 0, 255]);
  });

  it('图层不在原点时按位置裁选区，不缩放', () => {
    /*
     * 文档 8×8 的选区，右下 4×4 被选中；图层是 4×4 且 bounds 在 (4,4)。
     * 按位置裁的结果是整张蒙版全白；缩放的话会把 8×8 压进 4×4，
     * 只有右下 2×2 是白的——位置全错。
     */
    const selection = createCanvas(8, 8);
    const context = ctx2d(selection);
    context.fillStyle = '#ffffff';
    context.fillRect(4, 4, 4, 4);

    const mask = maskFromSelection(selection, { width: 4, height: 4, x: 4, y: 4 });
    expect(px(mask, 0, 0)[0]).toBe(255);
    expect(px(mask, 3, 3)[0]).toBe(255);
  });
});

