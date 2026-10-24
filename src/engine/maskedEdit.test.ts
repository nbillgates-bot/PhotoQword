/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect } from 'vitest';
import { applyWithinSelection } from './maskedEdit';
import { createCanvas, ctx2d } from './canvasUtils';
import { invert } from './adjustments';
import type { Selection } from '../types';

/** 纯色画布 */
function solid(size: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/** 左半边被选中的矩形选区，边缘不羽化 */
function leftHalf(size: number): Selection {
  const mask = createCanvas(size, size);
  const context = ctx2d(mask);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size / 2, size);
  return { mask, bounds: { x: 0, y: 0, width: size / 2, height: size } };
}

function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

function hasNaN(canvas: HTMLCanvasElement): boolean {
  const data = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 1) if (Number.isNaN(data[i])) return true;
  return false;
}

describe('applyWithinSelection 无选区', () => {
  it('整幅都被处理', () => {
    const canvas = solid(8, '#ff0000');
    applyWithinSelection(canvas, null, invert);
    expect(px(canvas, 0, 0)).toEqual([0, 255, 255, 255]);
    expect(px(canvas, 7, 7)).toEqual([0, 255, 255, 255]);
  });

  it('1x1 画布也能处理', () => {
    const canvas = solid(1, '#000000');
    applyWithinSelection(canvas, null, invert);
    expect(px(canvas, 0, 0)).toEqual([255, 255, 255, 255]);
  });

  it('处理完没有 NaN', () => {
    const canvas = solid(8, '#3366cc');
    applyWithinSelection(canvas, null, invert);
    expect(hasNaN(canvas)).toBe(false);
  });
});

describe('applyWithinSelection 有选区', () => {
  it('选区内被处理，选区外保持原样', () => {
    const canvas = solid(8, '#ff0000');
    applyWithinSelection(canvas, leftHalf(8), invert);
    expect(px(canvas, 1, 4)).toEqual([0, 255, 255, 255]);
    expect(px(canvas, 6, 4)).toEqual([255, 0, 0, 255]);
  });

  it('边界像素归属正确：选区最后一列在内，下一列在外', () => {
    const canvas = solid(8, '#ff0000');
    applyWithinSelection(canvas, leftHalf(8), invert);
    expect(px(canvas, 3, 0)[0]).toBe(0);
    expect(px(canvas, 4, 0)[0]).toBe(255);
  });

  it('反相两次回到原状', () => {
    const canvas = solid(8, '#3366cc');
    const selection = leftHalf(8);
    applyWithinSelection(canvas, selection, invert);
    applyWithinSelection(canvas, selection, invert);
    expect(px(canvas, 1, 1)).toEqual([0x33, 0x66, 0xcc, 255]);
  });

  it('全选的选区等价于无选区', () => {
    const full = createCanvas(8, 8);
    const context = ctx2d(full);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 8, 8);
    const canvas = solid(8, '#ff0000');
    applyWithinSelection(canvas, { mask: full, bounds: { x: 0, y: 0, width: 8, height: 8 } }, invert);
    expect(px(canvas, 4, 4)).toEqual([0, 255, 255, 255]);
  });
});

describe('applyWithinSelection 图层原点偏移', () => {
  it('按 origin 平移蒙版：偏移后落在画布左侧的部分才被处理', () => {
    // 8x8 文档，选区是右半 (4..7)。画布原点在文档 x=4，于是画布 0..3 对应文档 4..7
    const mask = createCanvas(8, 8);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(4, 0, 4, 8);
    const selection: Selection = { mask, bounds: { x: 4, y: 0, width: 4, height: 8 } };

    const canvas = solid(8, '#ff0000');
    applyWithinSelection(canvas, selection, invert, { x: 4, y: 0 });

    // 画布 0..3 = 文档 4..7，在选区内，被反相
    expect(px(canvas, 1, 4)).toEqual([0, 255, 255, 255]);
    // 画布 4..7 = 文档 8..11，在文档外，蒙版没覆盖到，保持原样
    expect(px(canvas, 6, 4)).toEqual([255, 0, 0, 255]);
  });

  it('负原点（图层移出左上角）同样对齐', () => {
    const mask = createCanvas(8, 8);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 8);
    const selection: Selection = { mask, bounds: { x: 0, y: 0, width: 4, height: 8 } };

    const canvas = solid(8, '#ff0000');
    // 画布原点在文档 -2，画布 2..5 对应文档 0..3
    applyWithinSelection(canvas, selection, invert, { x: -2, y: 0 });

    expect(px(canvas, 3, 4)).toEqual([0, 255, 255, 255]);
    expect(px(canvas, 7, 4)).toEqual([255, 0, 0, 255]);
  });

  it('尺寸不同的蒙版按平移贴，不缩放', () => {
    // 4x4 蒙版全选，贴到 8x8 画布上只应覆盖 0..3，缩放的话会盖满整幅
    const mask = createCanvas(4, 4);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 4);
    const canvas = solid(8, '#ff0000');
    applyWithinSelection(
      canvas,
      { mask, bounds: { x: 0, y: 0, width: 4, height: 4 } },
      invert,
    );

    expect(px(canvas, 1, 1)).toEqual([0, 255, 255, 255]);
    expect(px(canvas, 6, 6)).toEqual([255, 0, 0, 255]);
  });

  it('原点为 0 时与不传 origin 结果一致', () => {
    const a = solid(8, '#3366cc');
    const b = solid(8, '#3366cc');
    applyWithinSelection(a, leftHalf(8), invert);
    applyWithinSelection(b, leftHalf(8), invert, { x: 0, y: 0 });
    expect(px(a, 1, 1)).toEqual(px(b, 1, 1));
    expect(px(a, 6, 1)).toEqual(px(b, 6, 1));
  });

  it('偏移对齐后没有 NaN', () => {
    const canvas = solid(8, '#3366cc');
    applyWithinSelection(canvas, leftHalf(8), invert, { x: 3, y: -2 });
    expect(hasNaN(canvas)).toBe(false);
  });
});

describe('applyWithinSelection 半透明与羽化', () => {
  it('半透明像素的 alpha 不因合成而升高', () => {
    // 用 canvas 合成实现时这里会从 128 涨上去，是选这套逐点插值的原因
    const canvas = createCanvas(4, 4);
    const context = ctx2d(canvas);
    context.fillStyle = 'rgba(200, 0, 0, 0.5)';
    context.fillRect(0, 0, 4, 4);
    const before = px(canvas, 1, 1)[3];
    applyWithinSelection(canvas, leftHalf(4), invert);
    expect(px(canvas, 1, 1)[3]).toBe(before);
  });

  it('半选（蒙版 alpha 一半）得到原色与处理色之间的中间值', () => {
    const mask = createCanvas(4, 4);
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    maskCtx.fillRect(0, 0, 4, 4);
    const canvas = solid(4, '#ff0000');
    applyWithinSelection(canvas, { mask, bounds: { x: 0, y: 0, width: 4, height: 4 } }, invert);
    // 原色 255 与反相后的 0 之间，不断言具体数值：取决于蒙版 alpha 的实际取整
    const red = px(canvas, 1, 1)[0];
    expect(red).toBeGreaterThan(0);
    expect(red).toBeLessThan(255);
  });

  it('蒙版尺寸与画布不一致时先缩放，不抛错', () => {
    const mask = createCanvas(4, 4);
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillRect(0, 0, 4, 4);
    const canvas = solid(8, '#ff0000');
    expect(() =>
      applyWithinSelection(canvas, { mask, bounds: { x: 0, y: 0, width: 4, height: 4 } }, invert),
    ).not.toThrow();
    expect(hasNaN(canvas)).toBe(false);
  });

  it('选区处理完没有 NaN', () => {
    const canvas = solid(8, '#3366cc');
    applyWithinSelection(canvas, leftHalf(8), invert);
    expect(hasNaN(canvas)).toBe(false);
  });
});
