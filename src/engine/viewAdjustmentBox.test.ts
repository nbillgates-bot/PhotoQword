/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * 调整图层的读回范围收窄。
 *
 * 早先这里读整幅视口、写回 (0,0)。改成只读「视口 ∩ 文档」之后，box 的偏移
 * 不再恒为 0——文档比视口小、或者被平移到部分出屏时都是非零偏移。
 * 现有的 parity 测试是 zoom=1、视口=文档，偏移恒为 0，盖不住这一类，
 * 所以单独立一份：**调整结果必须落在文档那块上，不能整体偏移**。
 */
import { describe, expect, it } from 'vitest';
import { compositeInView } from './viewCompositor';
import {
  contentViewBox,
  counters,
  makeViewportContext,
  prepareViewportCanvas,
  resetCounters,
} from './viewportRender';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask } from './mask';
import type { BlendMode, Layer } from '../types';

const DOC = 40;
/** 视口比文档大一圈，文档居中，于是 box 的偏移非零 */
const VIEWPORT = 120;

function view(over: Partial<Parameters<typeof makeViewportContext>[0]> = {}) {
  return makeViewportContext({
    viewportWidth: VIEWPORT,
    viewportHeight: VIEWPORT,
    docWidth: DOC,
    docHeight: DOC,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
    ...over,
  });
}

function solid(color: string): Layer {
  const canvas = createCanvas(DOC, DOC);
  fillCanvas(canvas, color);
  return {
    id: 'base',
    name: 'base',
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas,
    bounds: { x: 0, y: 0, width: DOC, height: DOC },
  } as Layer;
}

/** 调整图层。照 addAdjustmentLayer：文档尺寸、原点、画布全透明 */
function adjust(params: Record<string, number>, over: Partial<Layer> = {}): Layer {
  return {
    id: 'adj',
    name: 'adj',
    type: 'adjustment',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas: createCanvas(DOC, DOC),
    bounds: { x: 0, y: 0, width: DOC, height: DOC },
    adjustmentData: { kind: 'brightness-contrast', params },
    ...over,
  } as Layer;
}

function render(layers: Layer[], v = view()) {
  const canvas = document.createElement('canvas');
  const context = prepareViewportCanvas(canvas, v);
  compositeInView(context, layers, v);
  return canvas;
}

function at(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return Array.from(ctx2d(canvas).getImageData(x, y, 1, 1).data);
}

describe('contentViewBox', () => {
  it('文档比视口小时只覆盖文档那块', () => {
    const box = contentViewBox(view());
    // 文档 40×40 居中在 120×120 视口里，左上角在 (40,40)
    expect(box).toEqual({ x: 40, y: 40, width: DOC, height: DOC });
  });

  it('文档比视口大时被夹到视口', () => {
    const box = contentViewBox(view({ zoom: 8 }));
    expect(box).toEqual({ x: 0, y: 0, width: VIEWPORT, height: VIEWPORT });
  });

  it('文档整个被平移出视口时返回 null', () => {
    // pan 在真实路径上会被 clampPan 夹住，这里直接给一个越界值验证兜底
    expect(contentViewBox(view({ panX: 9999, panY: 9999 }))).toBeNull();
  });
});

describe('调整图层在偏移的 box 下', () => {
  /*
   * 这条是整个改动的守门测试。
   * 写回时若还按 (0,0) 落笔，提亮的结果会整体挪到视口左上角：
   * 文档中心变回原色，而文档外的空白反倒被写上了像素。
   */
  it('提亮落在文档那块上，不整体偏移', () => {
    const canvas = render([solid('#404040'), adjust({ brightness: 60 })]);
    const center = at(canvas, 60, 60);

    expect(center[0]).toBeGreaterThan(0x40);
    expect(center[3]).toBe(255);
  });

  it('文档之外仍然是空的，没被写上像素', () => {
    const canvas = render([solid('#404040'), adjust({ brightness: 60 })]);
    // 视口左上角在文档之外，画布外一律不显示
    expect(at(canvas, 5, 5)[3]).toBe(0);
    expect(at(canvas, 115, 115)[3]).toBe(0);
  });

  it('不带调整层时中心色不变，用来隔离「是调整生效」而不是「本来就亮」', () => {
    const plain = render([solid('#404040')]);
    expect(at(plain, 60, 60)[0]).toBe(0x40);
  });

  it('读回量按文档那块算，不按整幅视口算', () => {
    resetCounters();
    render([solid('#404040'), adjust({ brightness: 30 })]);
    // 收窄前是 120×120=14400，收窄后是 40×40=1600
    expect(counters.readbackPixels).toBe(DOC * DOC);
  });

  it('带蒙版时走缓冲路径，蒙版位置仍然对得上', () => {
    // 左半黑右半白：白的那半通过，黑的那半挡住
    const mask = createMask(DOC, DOC, true);
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, DOC / 2, DOC);

    const canvas = render([solid('#404040'), adjust({ brightness: 60 }, { mask })]);
    // 视口坐标：文档左半在 40~60，右半在 60~80
    const masked = at(canvas, 50, 60);
    const passed = at(canvas, 70, 60);

    expect(masked[0]).toBe(0x40); // 被蒙版挡住，保持原色
    expect(passed[0]).toBeGreaterThan(0x40); // 蒙版通过，提亮生效
  });

  it('不透明度小于 100 时也走缓冲路径，结果介于原色与全量调整之间', () => {
    const half = render([solid('#404040'), adjust({ brightness: 60 }, { opacity: 50 })]);
    const full = render([solid('#404040'), adjust({ brightness: 60 })]);
    const halfValue = at(half, 60, 60)[0];

    expect(halfValue).toBeGreaterThan(0x40);
    expect(halfValue).toBeLessThan(at(full, 60, 60)[0]);
  });

  it('缩放下也不偏移', () => {
    // zoom=2：文档 80×80 居中在 120×120 视口里，box 从 (20,20) 起
    const canvas = render([solid('#404040'), adjust({ brightness: 60 })], view({ zoom: 2 }));
    expect(at(canvas, 60, 60)[0]).toBeGreaterThan(0x40);
    expect(at(canvas, 5, 5)[3]).toBe(0);
  });

  it('像素结果里不含 NaN 带来的黑块', () => {
    const canvas = render([solid('#404040'), adjust({ brightness: 60, contrast: 40 })]);
    const pixel = at(canvas, 60, 60);
    // NaN 会被 Uint8ClampedArray 变成 0，只表现为黑一块，不报错
    expect(pixel[0]).toBeGreaterThan(0);
    expect(pixel[3]).toBe(255);
  });
});
