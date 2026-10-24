/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * 随机结构对照。
 *
 * 手写的 case 都是我「想得到」的结构，局部缓冲的 bug 恰恰藏在想不到的组合里
 * （某类图层当剪贴基底、组里混着调整层、蒙版图层套在组里……）。
 * 这里用固定种子生成成百上千个随机图层树，逐个和 compositor.ts 的文档路径对照，
 * 第一个不一致的结构会连同它的 JSON 一起报出来，直接就是复现用例。
 *
 * 种子固定 ⇒ 每次跑的是同一批结构，失败可复现。
 */
import { describe, expect, it } from 'vitest';
import { composite } from './compositor';
import { compositeInView } from './viewCompositor';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask, maskGeometry } from './mask';
import type { BlendMode, Layer } from '../types';

const DOC = 48;

/** 线性同余，不用 Math.random，保证可复现 */
function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#c08040', '#3060a0', '#808080'];
const BLENDS: BlendMode[] = ['normal', 'multiply', 'screen', 'linear-burn', 'linear-dodge'];

interface Spec {
  kind: 'raster' | 'group' | 'adjustment';
  color: string;
  bounds: { x: number; y: number; width: number; height: number };
  blendMode: BlendMode;
  opacity: number;
  mask: boolean;
  clipped: boolean;
  children?: Spec[];
}

function makeSpec(next: () => number, depth: number): Spec {
  const roll = next();
  const kind: Spec['kind'] =
    depth < 2 && roll < 0.3 ? 'group' : roll > 0.94 ? 'adjustment' : 'raster';
  const x = Math.floor(next() * (DOC - 4));
  const y = Math.floor(next() * (DOC - 4));
  const spec: Spec = {
    kind,
    color: COLORS[Math.floor(next() * COLORS.length)],
    bounds: {
      x,
      y,
      width: Math.max(1, Math.floor(next() * (DOC - x))),
      height: Math.max(1, Math.floor(next() * (DOC - y))),
    },
    blendMode: BLENDS[Math.floor(next() * BLENDS.length)],
    opacity: next() < 0.7 ? 100 : Math.floor(next() * 100),
    mask: next() < 0.35,
    clipped: next() < 0.25,
  };
  if (kind === 'group') {
    const count = 1 + Math.floor(next() * 3);
    spec.children = [];
    for (let i = 0; i < count; i += 1) spec.children.push(makeSpec(next, depth + 1));
  }
  return spec;
}

/*
 * 按 maskGeometry 的契约建蒙版：普通层跟 canvas 同尺寸、对齐 bounds，组按文档尺寸。
 * 左半白右半黑——全白蒙版是死探针，两条路径都当空操作，等于这一掷没测东西。
 */
function halfMask(layer: { type: string; bounds: { x: number; y: number }; canvas: HTMLCanvasElement }) {
  const geom = maskGeometry(layer, { width: DOC, height: DOC });
  const mask = createMask(geom.width, geom.height, false);
  const context = ctx2d(mask);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, Math.ceil(geom.width / 2), geom.height);
  return mask;
}

/** Spec 树摊平成 Layer[]（store 里就是扁平数组 + parentId） */
function toLayers(specs: Spec[], parentId?: string, prefix = 'l'): Layer[] {
  const out: Layer[] = [];
  specs.forEach((spec, index) => {
    const id = `${prefix}${index}`;
    const isGroup = spec.kind === 'group';
    const isAdjust = spec.kind === 'adjustment';
    /*
     * 只造 store 造得出来的状态，否则测出来的分歧是假的：
     * 组的画布是 1×1 占位（paintGroup 不读它），调整层是文档尺寸、原点、全透明
     * （addAdjustmentLayer 就是 makeLayer(doc.width, doc.height)，像素来自读回下方）。
     */
    const bounds = isGroup
      ? { x: 0, y: 0, width: 1, height: 1 }
      : isAdjust
        ? { x: 0, y: 0, width: DOC, height: DOC }
        : spec.bounds;
    const canvas = createCanvas(bounds.width, bounds.height);
    if (!isGroup && !isAdjust) fillCanvas(canvas, spec.color);
    const layer = {
      id,
      name: id,
      type: spec.kind,
      visible: true,
      opacity: spec.opacity,
      blendMode: isGroup ? ('pass-through' as BlendMode) : spec.blendMode,
      canvas,
      bounds,
      parentId,
      clipped: spec.clipped,
      ...(spec.mask ? { mask: halfMask({ type: spec.kind, bounds, canvas }) } : {}),
      ...(spec.kind === 'adjustment'
        ? { adjustmentData: { kind: 'brightness-contrast', params: { brightness: 20 } } }
        : {}),
    } as Layer;
    // 子图层要排在父组之后：buildTree 靠 parentId，顺序决定绘制次序
    out.push(layer);
    if (spec.children) out.push(...toLayers(spec.children, id, `${id}c`));
  });
  return out;
}

function docPixels(layers: Layer[]): Uint8ClampedArray {
  const canvas = createCanvas(DOC, DOC);
  composite(ctx2d(canvas), layers, DOC, DOC);
  return ctx2d(canvas).getImageData(0, 0, DOC, DOC).data;
}

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
 * 最大通道差与第一处超出容差的坐标，**按预乘值比**。
 *
 * getImageData 给的是非预乘值，低 alpha 下它会把差异放大到失真：alpha=7 时
 * 一个预乘台阶就是 255/7 ≈ 36 个非预乘单位，于是「两条路径末位差 1」会报成
 * max=37，看起来像图层丢了。上屏可见的量是预乘值，所以比预乘才是比可见差异。
 * alpha=255 时两者相同，「整层丢失」那类差异一点不受影响。
 */
function premultiply(data: Uint8ClampedArray, i: number, c: number): number {
  if (c === 3) return data[i + 3];
  return Math.round((data[i + c] * data[i + 3]) / 255);
}

function diffOf(a: Uint8ClampedArray, b: Uint8ClampedArray, tolerance: number) {
  let max = 0;
  let over = 0;
  let first: { x: number; y: number; doc: number[]; view: number[] } | null = null;
  for (let i = 0; i < a.length; i += 4) {
    let worst = 0;
    const doc: number[] = [];
    const view: number[] = [];
    for (let c = 0; c < 4; c += 1) {
      const pa = premultiply(a, i, c);
      const pb = premultiply(b, i, c);
      doc.push(pa);
      view.push(pb);
      worst = Math.max(worst, Math.abs(pa - pb));
    }
    if (worst > max) max = worst;
    if (worst > tolerance) {
      over += 1;
      const pixel = i / 4;
      if (!first) first = { x: pixel % DOC, y: Math.floor(pixel / DOC), doc, view };
    }
  }
  return { max, over, first };
}

/*
 * 容差 2（预乘）。这个数是算出来的，不是试出来的：
 *
 * canvas 内部按预乘 8 位存，每过一张中间画布就最多丢 1 档。文档路径过两张
 * ——contentOf 建摆位画布、applyMaskAt 再建一张；视口路径的 placedInView
 * 把摆位和蒙版做在同一张缓冲里，只过一张。差值上限因此是 2，实测 max 也正好是 2。
 *
 * 原来是 8，且比的是非预乘值：低 alpha 下噪声被放大（alpha=7 时一档预乘 ≈ 36），
 * 所以那个 8 其实是给假差异让路的。改成预乘比之后判据比以前严了 4 倍，
 * 而「整层丢失」那类差异在 alpha=255 处两种比法完全一样，一点没放过。
 */
const TOLERANCE = 2;

describe('随机结构对照', () => {
  it('两条路径在 200 个随机图层树上结果一致', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = rng(seed);
      const count = 1 + Math.floor(next() * 4);
      const specs: Spec[] = [];
      for (let i = 0; i < count; i += 1) specs.push(makeSpec(next, 0));
      const layers = toLayers(specs);

      const { max, over, first } = diffOf(docPixels(layers), viewPixels(layers), TOLERANCE);
      if (first) {
        // 只给第一个失败附结构：JSON 就是复现用例，全打出来会淹掉结论
        const repro = failures.length === 0 ? `\n  结构 ${JSON.stringify(specs)}` : '';
        failures.push(
          `seed=${seed} max=${max} 超差像素=${over} 在 (${first.x},${first.y})：` +
            `文档预乘 [${first.doc}] vs 视口预乘 [${first.view}]${repro}`,
        );
      }
    }
    expect(failures.join('\n')).toBe('');
  });
});
