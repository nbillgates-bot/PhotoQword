/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * 视口合成器 vs 文档合成器的像素对照。
 *
 * 局部缓冲改造之后出现了「图层丢失」，光看单个 case 的断言查不出来是哪一类结构
 * 出的问题。compositor.ts 走文档尺寸缓冲、这次没动过，拿它当基准逐结构对照，
 * 谁不一致就暴露谁。zoom=1、dpr=1、视口与文档同尺寸时两条路径应当逐像素相同。
 */
import { describe, expect, it } from 'vitest';
import { composite } from './compositor';
import { compositeInView } from './viewCompositor';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask } from './mask';
import type { BlendMode, Layer } from '../types';

const DOC = 64;

function solid(id: string, color: string, over: Partial<Layer> = {}): Layer {
  const bounds = over.bounds ?? { x: 0, y: 0, width: DOC, height: DOC };
  const canvas = createCanvas(bounds.width, bounds.height);
  fillCanvas(canvas, color);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas,
    ...over,
    bounds,
  } as Layer;
}

function group(id: string, over: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
    type: 'group',
    visible: true,
    opacity: 100,
    blendMode: 'pass-through' as BlendMode,
    canvas: createCanvas(1, 1),
    bounds: { x: 0, y: 0, width: 1, height: 1 },
    ...over,
  } as Layer;
}

/**
 * 调整图层。尺寸与位置照 addAdjustmentLayer 来：文档尺寸、原点、画布全透明
 * （像素来自读回下方画面，不来自自己的 canvas）。
 */
function adjust(id: string, params: Record<string, number>, over: Partial<Layer> = {}): Layer {
  return {
    id,
    name: id,
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

/** 文档尺寸路径的结果 */
function docPixels(layers: Layer[]): Uint8ClampedArray {
  const canvas = createCanvas(DOC, DOC);
  composite(ctx2d(canvas), layers, DOC, DOC);
  return ctx2d(canvas).getImageData(0, 0, DOC, DOC).data;
}

/** 视口路径的结果。视口与文档同尺寸，所以视口坐标等于文档坐标 */
function viewPixels(layers: Layer[]): Uint8ClampedArray {
  const view = makeViewportContext({
    viewportWidth: DOC,
    viewportHeight: DOC,
    docWidth: DOC,
    docHeight: DOC,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
  });
  const canvas = document.createElement('canvas');
  const context = prepareViewportCanvas(canvas, view);
  compositeInView(context, layers, view);
  const raw = ctx2d(canvas);
  raw.setTransform(1, 0, 0, 1, 0, 0);
  return raw.getImageData(0, 0, DOC, DOC).data;
}

/**
 * 逐像素对照，允许 ±2 的舍入差（两条路径的中间缓冲尺寸不同，
 * 缩放采样与 alpha 合成的舍入不可能完全一致）。
 * 报错时给出第一处不一致的坐标，否则「有 3000 个像素不一样」没法定位。
 */
function expectSame(layers: Layer[], tolerance = 2): void {
  const doc = docPixels(layers);
  const view = viewPixels(layers);
  for (let i = 0; i < doc.length; i += 4) {
    for (let c = 0; c < 4; c += 1) {
      if (Math.abs(doc[i + c] - view[i + c]) > tolerance) {
        const pixel = i / 4;
        const x = pixel % DOC;
        const y = Math.floor(pixel / DOC);
        throw new Error(
          `(${x},${y}) 不一致：文档路径 [${doc[i]},${doc[i + 1]},${doc[i + 2]},${doc[i + 3]}]，` +
            `视口路径 [${view[i]},${view[i + 1]},${view[i + 2]},${view[i + 3]}]`,
        );
      }
    }
  }
  expect(true).toBe(true);
}

describe('两条合成路径对照', () => {
  it('单层', () => {
    expectSame([solid('a', '#ff0000')]);
  });

  it('偏移的小图层', () => {
    expectSame([solid('a', '#ff0000', { bounds: { x: 13, y: 21, width: 17, height: 9 } })]);
  });

  it('蒙版', () => {
    expectSame([solid('a', '#ff0000', { mask: createMask(DOC, DOC, true) })]);
  });

  /*
   * 调整图层在 PS 里是完整图层：自己的混合模式、不透明度、蒙版都算。
   * 视口路径原先直接 putImageData 把调整结果盖回画面，这三样全丢了——
   * multiply 的调整层在文档路径上乘完还是黑，在视口路径上却把画面提亮。
   * 这一组是那个 bug 的回归用例，之前视口对照里一个调整层用例都没有。
   */
  describe('调整图层', () => {
    it('普通叠加', () => {
      expectSame([solid('a', '#404040'), adjust('adj', { brightness: 20 })]);
    });

    it('混合模式生效', () => {
      expectSame([solid('a', '#404040'), adjust('adj', { brightness: 20 }, { blendMode: 'multiply' })]);
    });

    it('不透明度生效', () => {
      expectSame([solid('a', '#404040'), adjust('adj', { brightness: 40 }, { opacity: 35 })]);
    });

    it('蒙版生效：只有蒙版白的那半边变亮', () => {
      const mask = createMask(DOC, DOC, true);
      ctx2d(mask).fillStyle = '#000000';
      ctx2d(mask).fillRect(DOC / 2, 0, DOC / 2, DOC);
      const layers = [solid('a', '#404040'), adjust('adj', { brightness: 60 }, { mask })];
      expectSame(layers);
      // 也要绝对断言：两条路径都不套蒙版时对照同样成立，光对照抓不住
      const view = viewPixels(layers);
      expect(view[(10 * DOC + 10) * 4]).toBeGreaterThan(0x40 + 40);
      expect(view[(10 * DOC + 50) * 4]).toBe(0x40);
    });

    it('组内的调整层', () => {
      expectSame([
        solid('a', '#404040'),
        group('g', { opacity: 60 }),
        adjust('adj', { brightness: 30 }, { parentId: 'g', blendMode: 'multiply' }),
      ]);
    });
  });

  it('bounds 不在原点的图层，蒙版按 bounds 对齐（PSD 导入的形状）', () => {
    /*
     * 两条路径以前都错，而且错法不同：视口路径把蒙版画到文档 (0,0)，
     * 交集为空，整层消失；文档路径用 applyMask 把 24×16 的蒙版拉伸铺满 64×64，
     * 图层被扭曲。所以这个 case 单看一条路径都发现不了，必须对照。
     *
     * 蒙版左半白右半黑，图层在 (20,30)，所以只有 x∈[20,32) 那半边该留下。
     */
    const mask = createMask(24, 16, true);
    ctx2d(mask).fillStyle = '#000000';
    ctx2d(mask).fillRect(12, 0, 12, 16);
    const layers = [
      solid('bg', '#101010'),
      solid('shape', '#ff3b30', { bounds: { x: 20, y: 30, width: 24, height: 16 }, mask }),
    ];
    expectSame(layers);

    // 再断言一次「确实留下了东西」：两条路径同时把它抹掉的话，对照是相等的
    const view = viewPixels(layers);
    const at = (x: number, y: number) => view[(y * DOC + x) * 4];
    expect(at(24, 34)).toBeGreaterThan(200); // 蒙版白的一半，红色留下
    expect(at(38, 34)).toBeLessThan(60); // 蒙版黑的一半，露出背景
  });

  it('手写混合模式', () => {
    expectSame([
      solid('base', '#3060a0'),
      solid('top', '#c08040', { blendMode: 'linear-burn' as BlendMode }),
    ]);
  });

  it('偏移图层上的手写混合', () => {
    expectSame([
      solid('base', '#3060a0'),
      solid('top', '#c08040', {
        blendMode: 'linear-burn' as BlendMode,
        bounds: { x: 11, y: 7, width: 20, height: 30 },
      }),
    ]);
  });

  it('隔离组', () => {
    expectSame([
      group('g', { blendMode: 'normal' as BlendMode }),
      solid('a', '#ff0000', { parentId: 'g' }),
    ]);
  });

  it('组里偏移的子图层', () => {
    expectSame([
      group('g', { blendMode: 'normal' as BlendMode }),
      solid('a', '#ff0000', { parentId: 'g', bounds: { x: 9, y: 15, width: 31, height: 18 } }),
    ]);
  });

  it('组里多个偏移子图层', () => {
    expectSame([
      group('g', { blendMode: 'normal' as BlendMode }),
      solid('a', '#ff0000', { parentId: 'g', bounds: { x: 3, y: 3, width: 10, height: 10 } }),
      solid('b', '#00ff00', { parentId: 'g', bounds: { x: 51, y: 51, width: 10, height: 10 } }),
    ]);
  });

  it('嵌套组', () => {
    expectSame([
      group('outer', { blendMode: 'normal' as BlendMode }),
      group('inner', { parentId: 'outer', blendMode: 'normal' as BlendMode }),
      solid('a', '#0000ff', { parentId: 'inner', bounds: { x: 20, y: 20, width: 8, height: 8 } }),
    ]);
  });

  it('剪贴组:基底偏在一角', () => {
    expectSame([
      solid('base', '#ff0000', { bounds: { x: 40, y: 40, width: 20, height: 20 } }),
      solid('m', '#00ff00', { clipped: true }),
    ]);
  });

  it('剪贴组:成员比基底小', () => {
    expectSame([
      solid('base', '#ff0000', { bounds: { x: 10, y: 10, width: 44, height: 44 } }),
      solid('m', '#00ff00', { clipped: true, bounds: { x: 20, y: 20, width: 20, height: 20 } }),
    ]);
  });

  it('剪贴组:成员超出基底', () => {
    expectSame([
      solid('base', '#ff0000', { bounds: { x: 26, y: 26, width: 12, height: 12 } }),
      solid('m', '#00ff00', { clipped: true }),
    ]);
  });

  it('剪贴组的基底是一个隔离组', () => {
    expectSame([
      group('g', { blendMode: 'normal' as BlendMode }),
      solid('inner', '#ff0000', { parentId: 'g', bounds: { x: 20, y: 20, width: 24, height: 24 } }),
      solid('m', '#00ff00', { clipped: true }),
    ]);
  });
});

/*
 * 016.psd 的真实结构:790×16041 的长图，缩到 scale≈0.11 看全貌，
 * 图层分散在几十个组里、大量带蒙版。上面那组都是 zoom=1 的小文档，
 * 缩放路径上的问题它们抓不到。
 */
describe('长图缩略视图下的缓冲范围', () => {
  const LONG_W = 790;
  const LONG_H = 4000;

  function longView(zoom: number) {
    return makeViewportContext({
      viewportWidth: 400,
      viewportHeight: 500,
      docWidth: LONG_W,
      docHeight: LONG_H,
      zoom,
      panX: 0,
      panY: 0,
      dpr: 1,
    });
  }

  function renderLong(layers: Layer[], zoom: number) {
    const view = longView(zoom);
    const canvas = document.createElement('canvas');
    const context = prepareViewportCanvas(canvas, view);
    compositeInView(context, layers, view);
    const raw = ctx2d(canvas);
    raw.setTransform(1, 0, 0, 1, 0, 0);
    return { view, raw };
  }

  /** 有多少个不透明像素。整层丢失时这个数会掉到 0 */
  function opaqueCount(raw: CanvasRenderingContext2D, view: ReturnType<typeof longView>): number {
    const { data } = raw.getImageData(0, 0, view.viewWidth, view.viewHeight);
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count += 1;
    return count;
  }

  /** 铺满长文档的图层，分散在 y 方向 */
  function band(id: string, y: number, color: string, over: Partial<Layer> = {}): Layer {
    return solid(id, color, { ...over, bounds: { x: 40, y, width: 700, height: 300 } });
  }

  it('隔离组里散布在长文档各处的子图层都要画出来', () => {
    const layers = [
      group('g', { blendMode: 'normal' as BlendMode }),
      band('a', 100, '#ff0000', { parentId: 'g' }),
      band('b', 1800, '#00ff00', { parentId: 'g' }),
      band('c', 3600, '#0000ff', { parentId: 'g' }),
    ];
    const { view, raw } = renderLong(layers, 0.11);
    // 三条带子各占 700×300 文档像素，缩到 0.11 后每条约 77×33
    expect(opaqueCount(raw, view)).toBeGreaterThan(3 * 77 * 30);
  });

  it('组的缓冲要覆盖所有子图层，不能只有第一个', () => {
    const layers = [
      group('g', { blendMode: 'normal' as BlendMode }),
      band('a', 100, '#ff0000', { parentId: 'g' }),
      band('b', 3600, '#0000ff', { parentId: 'g' }),
    ];
    const { view, raw } = renderLong(layers, 0.11);
    const scale = view.scale;
    const at = (docX: number, docY: number) => {
      const x = Math.round(docX * scale + view.originX);
      const y = Math.round(docY * scale + view.originY);
      return Array.from(raw.getImageData(x, y, 1, 1).data);
    };
    // 第一条带子里
    expect(at(400, 250)[3]).toBeGreaterThan(0);
    // 最后一条带子里——组的缓冲没覆盖到它的话这里是空的
    expect(at(400, 3750)[3]).toBeGreaterThan(0);
  });

  it('带蒙版的图层在缩略视图下不会整层消失', () => {
    const mask = createMask(LONG_W, LONG_H, true);
    const layers = [band('a', 1500, '#ff0000', { mask })];
    const { view, raw } = renderLong(layers, 0.11);
    expect(opaqueCount(raw, view)).toBeGreaterThan(70 * 30);
  });
});
