/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * 缓存复用 vs 全量重合成的像素对照。
 *
 * 这份是这个模块能不能上的闸门：**复用出来的画面必须和全量重合成一致**。
 * 平移复用把上一帧挪一下再补边条，任何一处坐标算错都会表现为
 * 「画面整体偏移」或「接缝处有一条」——都是肉眼可见的错，
 * 所以这里逐像素比，不看单点采样。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createViewCache,
  invalidateViewCache,
  renderCached,
  type ViewCache,
} from './viewCache';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';
import { paintLayersInto } from './viewRenderer';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import type { BlendMode, Layer } from '../types';

const DOC = 200;
const VIEW_W = 120;
const VIEW_H = 90;

function view(over: Partial<Parameters<typeof makeViewportContext>[0]> = {}) {
  return makeViewportContext({
    viewportWidth: VIEW_W,
    viewportHeight: VIEW_H,
    docWidth: DOC,
    docHeight: DOC,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
    ...over,
  });
}

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

/**
 * 一组有结构的图层：满幅底 + 几块错开的方块。
 * 全用纯色满幅的话，平移偏一格也看不出来——必须有边界才能验证对位。
 */
function scene(): Layer[] {
  return [
    solid('bg', '#202020'),
    solid('a', '#ff0000', { bounds: { x: 10, y: 10, width: 40, height: 30 } }),
    solid('b', '#00ff00', { bounds: { x: 55, y: 25, width: 35, height: 45 } }),
    solid('c', '#0000ff', { bounds: { x: 20, y: 60, width: 60, height: 25 } }),
  ];
}

/** 直接全量渲染一份，作为基准 */
function reference(layers: Layer[], v = view()): Uint8ClampedArray {
  const canvas = createCanvas(v.viewWidth, v.viewHeight);
  const context = prepareViewportCanvas(canvas, v);
  paintLayersInto(context, layers, v);
  return ctx2d(canvas).getImageData(0, 0, v.viewWidth, v.viewHeight).data;
}

/** 经过缓存渲染一份，连同这一帧实际走的路径 */
function cachedWithPlan(
  cache: ViewCache,
  layers: Layer[],
  v = view(),
  interacting = false,
  contentKey: readonly unknown[] = ['k'],
) {
  const canvas = createCanvas(v.viewWidth, v.viewHeight);
  const result = renderCached({ cache, canvas, layers, view: v, contentKey, interacting });
  return {
    plan: result.plan,
    repaintedPixels: result.repaintedPixels,
    pixels: ctx2d(canvas).getImageData(0, 0, v.viewWidth, v.viewHeight).data,
  };
}

function cached(
  cache: ViewCache,
  layers: Layer[],
  v = view(),
  interacting = false,
  contentKey: readonly unknown[] = ['k'],
): Uint8ClampedArray {
  return cachedWithPlan(cache, layers, v, interacting, contentKey).pixels;
}

/** 两幅像素不同的字节数 */
function diffCount(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) count += 1;
  return count;
}

let cache: ViewCache;
beforeEach(() => {
  cache = createViewCache();
});

describe('首帧', () => {
  it('没缓存时走全量，结果与直接渲染一致', () => {
    const layers = scene();
    const result = cachedWithPlan(cache, layers, view());
    expect(result.plan).toBe('full');
    expect(diffCount(result.pixels, reference(layers))).toBe(0);
  });
});

describe('平移复用与全量重合成逐像素一致', () => {
  /*
   * 这条是整个缓存的守门测试。
   * 挪一格、挪一大段、斜着挪，任何一种算错都会在这里露出来。
   */
  const shifts = [
    { dx: 1, dy: 0, label: '横挪一格' },
    { dx: -1, dy: 0, label: '反向挪一格' },
    { dx: 0, dy: 1, label: '纵挪一格' },
    { dx: 12, dy: 0, label: '横挪一段' },
    { dx: 0, dy: -9, label: '纵向反挪一段' },
    { dx: 7, dy: 5, label: '斜着挪' },
    { dx: -6, dy: -4, label: '反向斜着挪' },
  ];

  for (const { dx, dy, label } of shifts) {
    it(`${label} 后与全量结果一致`, () => {
      const layers = scene();
      cached(cache, layers, view({ panX: 0, panY: 0 }));

      const moved = view({ panX: dx, panY: dy });
      const viaCache = cachedWithPlan(cache, layers, moved);

      // 先确认真的走了条带路径：悄悄回退成全量的话这条断言就是假绿
      expect(viaCache.plan).toBe('shift');
      expect(diffCount(viaCache.pixels, reference(layers, moved))).toBe(0);
      // 补画量必须远小于整屏，否则复用没有意义
      expect(viaCache.repaintedPixels).toBeLessThan(VIEW_W * VIEW_H * 0.5);
    });
  }

  /*
   * 连续平移最容易暴露累积误差：每帧都从上一帧的结果挪，
   * 错一个像素会一路攒下去。走 20 帧之后仍要与全量结果一致。
   */
  it('连续平移 20 帧不累积漂移', () => {
    const layers = scene();
    cached(cache, layers, view());
    let last = { plan: 'full' as string, pixels: new Uint8ClampedArray() };
    for (let i = 1; i <= 20; i += 1) {
      last = cachedWithPlan(cache, layers, view({ panX: i * 2, panY: i }));
    }
    expect(last.plan).toBe('shift');
    expect(diffCount(last.pixels, reference(layers, view({ panX: 40, panY: 20 })))).toBe(0);
  });

  it('来回挪回原位后与初始画面一致', () => {
    const layers = scene();
    const start = view();
    const first = cached(cache, layers, start);
    cached(cache, layers, view({ panX: 15, panY: 8 }));
    const back = cached(cache, layers, start);
    expect(diffCount(back, first)).toBe(0);
  });
});

describe('缓存失效', () => {
  /*
   * 调用方每帧都新建一个身份数组（CanvasArea 就是这么做的），
   * 所以比较必须逐项看内容，不能看数组本身的引用——
   * 看引用的话每帧都判成「内容变了」，缓存永远命不中，等于白做。
   */
  it('每帧新建的身份数组只要内容相同就算同一份', () => {
    const layers = scene();
    cached(cache, layers, view(), false, ['a', 1]);
    expect(cachedWithPlan(cache, layers, view(), false, ['a', 1]).plan).toBe('reuse');
  });

  it('身份数组长度变了也算变了', () => {
    const layers = scene();
    cached(cache, layers, view(), false, ['a']);
    expect(cachedWithPlan(cache, layers, view(), false, ['a', 'b']).plan).toBe('full');
  });

  it('内容身份变了就全量重算', () => {
    const layers = scene();
    cached(cache, layers, view(), false, ['k1']);
    expect(cachedWithPlan(cache, layers, view(), false, ['k2']).plan).toBe('full');
  });

  it('内容变了之后画面跟着变，不会拿旧缓存顶着', () => {
    const before = scene();
    cached(cache, before, view(), false, ['k1']);

    const after = [
      ...scene(),
      solid('d', '#ffff00', { bounds: { x: 0, y: 0, width: 30, height: 30 } }),
    ];
    const shown = cached(cache, after, view(), false, ['k2']);
    expect(diffCount(shown, reference(after))).toBe(0);
  });

  it('视口尺寸变了就全量重算', () => {
    const layers = scene();
    cached(cache, layers, view());
    const wider = view({ viewportWidth: VIEW_W + 40 });
    const bigger = cachedWithPlan(cache, layers, wider);
    expect(bigger.plan).toBe('full');
    expect(diffCount(bigger.pixels, reference(layers, wider))).toBe(0);
  });

  it('手动作废之后下一帧全量', () => {
    const layers = scene();
    cached(cache, layers, view());
    invalidateViewCache(cache);
    expect(cachedWithPlan(cache, layers, view()).plan).toBe('full');
  });

  it('原样不动时纯复用，一个像素都不重画', () => {
    const layers = scene();
    cached(cache, layers, view());
    const again = cachedWithPlan(cache, layers, view());
    expect(again.plan).toBe('reuse');
    expect(again.repaintedPixels).toBe(0);
    expect(diffCount(again.pixels, reference(layers))).toBe(0);
  });
});

describe('缩放复用', () => {
  it('交互中拉伸缓存顶上，画面不空', () => {
    const layers = scene();
    cached(cache, layers, view());
    const zoomed = cachedWithPlan(cache, layers, view({ zoom: 1.5 }), true);
    expect(zoomed.plan).toBe('rescale');
    // 拉伸结果与精确结果必然有差，但不能是空画面
    const nonEmpty = Array.from(zoomed.pixels).some((value, i) => i % 4 === 3 && value > 0);
    expect(nonEmpty).toBe(true);
  });

  /*
   * 拉伸不回写缓存，否则「拉伸结果再拉伸」会一次比一次糊。
   * 连续拉伸两次之后，缓存里的几何必须还是那次全量的。
   */
  it('拉伸不污染缓存，连续缩放不累积模糊', () => {
    const layers = scene();
    cached(cache, layers, view());
    const anchor = cache.geometry;
    cachedWithPlan(cache, layers, view({ zoom: 1.3 }), true);
    cachedWithPlan(cache, layers, view({ zoom: 1.6 }), true);
    expect(cache.geometry).toEqual(anchor);
  });

  it('停手后收敛到精确结果', () => {
    const layers = scene();
    cached(cache, layers, view());
    const target = view({ zoom: 1.5 });
    cachedWithPlan(cache, layers, target, true);
    const settled = cachedWithPlan(cache, layers, target, false);
    expect(settled.plan).toBe('full');
    expect(diffCount(settled.pixels, reference(layers, target))).toBe(0);
  });

  it('倍率跨得太远时重新全量并换掉缓存', () => {
    const layers = scene();
    cached(cache, layers, view());
    const far = cachedWithPlan(cache, layers, view({ zoom: 4 }), true);
    expect(far.plan).toBe('full');
    expect(cache.geometry?.scale).toBe(4);
  });
});

/*
 * 带效果的图层不走条带：投影、外发光会画到 bounds 之外，需要的留边随效果
 * 大小走，条带就没多少便宜可占了，还会在接缝处露出被夹掉的那圈。
 * 退回全量与改造前的行为一致，不算退化。
 */
describe('带效果时退回全量', () => {
  it('有投影的图层平移时走全量，结果仍然正确', () => {
    const shadow = {
      enabled: true,
      color: '#000000',
      opacity: 75,
      angle: 120,
      distance: 5,
      size: 5,
      spread: 0,
      blendMode: 'multiply' as BlendMode,
    };
    const layers = [
      solid('bg', '#202020'),
      solid('a', '#ff0000', {
        bounds: { x: 20, y: 20, width: 40, height: 30 },
        effects: { dropShadow: shadow },
      } as Partial<Layer>),
    ];
    cached(cache, layers, view());
    const moved = view({ panX: 10, panY: 6 });
    const result = cachedWithPlan(cache, layers, moved);
    expect(result.plan).toBe('full');
    expect(diffCount(result.pixels, reference(layers, moved))).toBe(0);
  });
});
