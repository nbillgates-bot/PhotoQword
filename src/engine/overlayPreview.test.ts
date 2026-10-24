/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { overlayPreviewLayers, type OverlayState } from './overlayPreview';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask } from './mask';
import type { BlendMode, Layer, Selection } from '../types';

const DOC = 100;

function layerAt(id: string, x: number, y: number, size: number, color = '#ff0000'): Layer {
  const canvas = createCanvas(size, size);
  fillCanvas(canvas, color);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas,
    bounds: { x, y, width: size, height: size },
  } as Layer;
}

/** 文档尺寸的描边缓冲,只在给定矩形里有颜色 */
function buffer(rect: { x: number; y: number; w: number; h: number }, color = '#00ff00') {
  const canvas = createCanvas(DOC, DOC);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  return canvas;
}

function overlayOn(targetLayerId: string, over: Partial<OverlayState> = {}): OverlayState {
  return {
    targetLayerId,
    canvas: buffer({ x: 0, y: 0, w: DOC, h: DOC }),
    operation: 'source-over',
    opacity: 100,
    clipToSelection: false,
    ...over,
  };
}

function at(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return Array.from(ctx2d(canvas).getImageData(x, y, 1, 1).data);
}

describe('overlayPreviewLayers', () => {
  it('只替换目标图层,其余图层是原来那个对象', () => {
    const a = layerAt('a', 0, 0, DOC);
    const b = layerAt('b', 0, 0, DOC);
    const result = overlayPreviewLayers([a, b], overlayOn('b'), null);
    expect(result[0]).toBe(a);
    expect(result[1]).not.toBe(b);
  });

  it('返回新数组,不改动入参', () => {
    const layers = [layerAt('a', 0, 0, DOC)];
    const result = overlayPreviewLayers(layers, overlayOn('a'), null);
    expect(result).not.toBe(layers);
    expect(layers[0].canvas.width).toBe(DOC);
  });

  it('目标图层不存在时每个图层都原样返回', () => {
    const a = layerAt('a', 0, 0, DOC);
    const result = overlayPreviewLayers([a], overlayOn('missing'), null);
    expect(result[0]).toBe(a);
  });
});

describe('预览画布尺寸', () => {
  it('合成结果跟图层画布同尺寸,不是文档尺寸', () => {
    // 这是性能修复的核心:长文档里每次指针移动都分配文档尺寸画布会卡死
    const small = layerAt('a', 10, 20, 30);
    const [preview] = overlayPreviewLayers([small], overlayOn('a'), null);
    expect(preview.canvas.width).toBe(30);
    expect(preview.canvas.height).toBe(30);
  });

  it('bounds 原点保持不变', () => {
    const small = layerAt('a', 10, 20, 30);
    const [preview] = overlayPreviewLayers([small], overlayOn('a'), null);
    expect(preview.bounds).toEqual({ x: 10, y: 20, width: 30, height: 30 });
  });

  it('长文档里的小图层不会分配巨大的画布', () => {
    const tall = layerAt('a', 0, 15000, 40);
    const [preview] = overlayPreviewLayers([tall], overlayOn('a'), null);
    expect(preview.canvas.height).toBe(40);
  });
});

describe('缓冲的坐标对齐', () => {
  it('缓冲按 -bounds 平移,文档坐标的笔迹落在图层的正确位置', () => {
    // 图层占文档 (50,50)-(70,70);缓冲只在文档 (50,50) 起的 10×10 有色
    const layer = layerAt('a', 50, 50, 20, '#ff0000');
    const overlay = overlayOn('a', { canvas: buffer({ x: 50, y: 50, w: 10, h: 10 }) });
    const [preview] = overlayPreviewLayers([layer], overlay, null);
    // 图层局部 (5,5) 对应文档 (55,55):在缓冲范围内,应为绿色
    expect(at(preview.canvas, 5, 5)).toEqual([0, 255, 0, 255]);
    // 图层局部 (15,15) 对应文档 (65,65):缓冲外,保持原红色
    expect(at(preview.canvas, 15, 15)).toEqual([255, 0, 0, 255]);
  });

  it('缓冲完全落在图层之外时图层像素不变', () => {
    const layer = layerAt('a', 0, 0, 20, '#ff0000');
    const overlay = overlayOn('a', { canvas: buffer({ x: 60, y: 60, w: 10, h: 10 }) });
    const [preview] = overlayPreviewLayers([layer], overlay, null);
    expect(at(preview.canvas, 10, 10)).toEqual([255, 0, 0, 255]);
  });
});

describe('不透明度与运算方式', () => {
  it('opacity 50 时笔迹半透明地压在图层上', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const [preview] = overlayPreviewLayers([layer], overlayOn('a', { opacity: 50 }), null);
    const pixel = at(preview.canvas, 50, 50);
    // 红底压半透明绿:两个通道都有值
    expect(pixel[0]).toBeGreaterThan(0);
    expect(pixel[1]).toBeGreaterThan(0);
  });

  it('opacity 0 时图层保持原样', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const [preview] = overlayPreviewLayers([layer], overlayOn('a', { opacity: 0 }), null);
    expect(at(preview.canvas, 50, 50)).toEqual([255, 0, 0, 255]);
  });

  it('destination-out 擦掉图层像素(橡皮)', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const overlay = overlayOn('a', {
      operation: 'destination-out',
      canvas: buffer({ x: 0, y: 0, w: 50, h: DOC }),
    });
    const [preview] = overlayPreviewLayers([layer], overlay, null);
    expect(at(preview.canvas, 25, 50)[3]).toBe(0);
    expect(at(preview.canvas, 75, 50)).toEqual([255, 0, 0, 255]);
  });

  it('合成后不产生 NaN', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const [preview] = overlayPreviewLayers([layer], overlayOn('a', { opacity: 37 }), null);
    const data = ctx2d(preview.canvas).getImageData(0, 0, DOC, DOC).data;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });
});

describe('画在蒙版上', () => {
  it('target 为 mask 时改蒙版,图层画布不动', () => {
    const layer = { ...layerAt('a', 0, 0, DOC), mask: createMask(DOC, DOC, true) } as Layer;
    const overlay = overlayOn('a', { target: 'mask' });
    const [preview] = overlayPreviewLayers([layer], overlay, null);
    expect(preview.canvas).toBe(layer.canvas);
    expect(preview.mask).not.toBe(layer.mask);
  });

  it('蒙版预览保持文档尺寸(applyMask 会按源画布拉伸)', () => {
    const layer = { ...layerAt('a', 30, 40, 20), mask: createMask(DOC, DOC, true) } as Layer;
    const [preview] = overlayPreviewLayers([layer], overlayOn('a', { target: 'mask' }), null);
    expect(preview.mask!.width).toBe(DOC);
    expect(preview.mask!.height).toBe(DOC);
  });

  it('target 为 mask 但图层没有蒙版时,退回改图层像素', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const [preview] = overlayPreviewLayers([layer], overlayOn('a', { target: 'mask' }), null);
    expect(preview.mask).toBeUndefined();
    expect(at(preview.canvas, 50, 50)).toEqual([0, 255, 0, 255]);
  });
});

describe('裁到选区', () => {
  /** 选区只覆盖左半边 */
  function halfSelection(): Selection {
    const mask = createMask(DOC, DOC, false);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 50, DOC);
    return { mask, bounds: { x: 0, y: 0, width: 50, height: DOC } };
  }

  it('clipToSelection 为 true 时笔迹只落在选区内', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const overlay = overlayOn('a', { clipToSelection: true });
    const [preview] = overlayPreviewLayers([layer], overlay, halfSelection());
    expect(at(preview.canvas, 25, 50)).toEqual([0, 255, 0, 255]);
    expect(at(preview.canvas, 75, 50)).toEqual([255, 0, 0, 255]);
  });

  it('clipToSelection 为 true 但没有选区时不裁剪', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const overlay = overlayOn('a', { clipToSelection: true });
    const [preview] = overlayPreviewLayers([layer], overlay, null);
    expect(at(preview.canvas, 75, 50)).toEqual([0, 255, 0, 255]);
  });

  it('clipToSelection 为 false 时有选区也不裁剪', () => {
    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const [preview] = overlayPreviewLayers([layer], overlayOn('a'), halfSelection());
    expect(at(preview.canvas, 75, 50)).toEqual([0, 255, 0, 255]);
  });

  it('灰度选区(羽化边)得到半透明的笔迹,不是非黑即白', () => {
    // 选区蒙版是灰度的,裁剪必须走 maskToAlpha 才能保留中间调
    const mask = createMask(DOC, DOC, false);
    const context = ctx2d(mask);
    context.fillStyle = '#808080';
    context.fillRect(0, 0, DOC, DOC);
    const selection: Selection = { mask, bounds: { x: 0, y: 0, width: DOC, height: DOC } };

    const layer = layerAt('a', 0, 0, DOC, '#ff0000');
    const overlay = overlayOn('a', { clipToSelection: true });
    const [preview] = overlayPreviewLayers([layer], overlay, selection);
    const pixel = at(preview.canvas, 50, 50);
    // 半强度的绿压在红上:两个通道都有值,谁都没被压到 0
    expect(pixel[0]).toBeGreaterThan(0);
    expect(pixel[1]).toBeGreaterThan(0);
  });
});
