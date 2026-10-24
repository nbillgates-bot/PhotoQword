/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 「图层不能丢」的见证测试。
 *
 * 前面的对照测试只验局部缓冲和全视口缓冲结果一致，验不出「两条路径一起漏掉同一
 * 层」；而且它直接调 compositeInView，整条裁剪路径(buildTree → pruneNodes)根本
 * 没被覆盖——用户日志里一帧能裁掉 269 层，裁错了就正是「图层丢失」。
 *
 * 这里换一个不依赖像素精度的判据：**把某一层藏起来，画面必须发生变化。**
 * 没变化就意味着这层本来就没画上去。判据对重采样噪声天然免疫，可以直接在
 * scale 0.109 这种缩略视图下跑，也就是用户实际看到问题的档位。
 */
import { describe, expect, it } from 'vitest';
import { renderViewport } from './viewRenderer';
import { makeLayer } from './viewBufferHarness';
import { layerDocRect, makeViewportContext, type ViewportContext } from './viewportRender';
import { ctx2d } from './canvasUtils';
import type { Layer } from '../types';

const DOC_W = 790;
const DOC_H = 4000;
const VIEW_W = 300;
const VIEW_H = 500;

function frameOf(layers: Layer[], zoom: number, panY: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  renderViewport({
    canvas,
    layers,
    docWidth: DOC_W,
    docHeight: DOC_H,
    viewportWidth: VIEW_W,
    viewportHeight: VIEW_H,
    zoom,
    panX: 0,
    panY,
    dpr: 1,
  });
  const raw = ctx2d(canvas);
  raw.setTransform(1, 0, 0, 1, 0, 0);
  return raw.getImageData(0, 0, canvas.width, canvas.height).data;
}

/** 两帧的最大通道差 */
function maxDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const delta = Math.abs(a[i] - b[i]);
    if (delta > max) max = delta;
  }
  return max;
}

/**
 * 这一层落进视口的部分有多大(视口像素,取较短的那一边)。
 *
 * 必须用几何算，不能用「单独画一遍看有没有像素」：后者会把「被 bug 抹掉的层」
 * 一并判成不在视口内，正好把要抓的 bug 滤掉。
 */
function onScreenExtent(layer: Layer, view: ViewportContext): number {
  const rect = layerDocRect(layer);
  const doc = view.docRect;
  const width = Math.min(rect.x + rect.width, doc.x + doc.width) - Math.max(rect.x, doc.x);
  const height = Math.min(rect.y + rect.height, doc.y + doc.height) - Math.max(rect.y, doc.y);
  if (width <= 0 || height <= 0) return 0;
  return Math.min(width, height) * view.scale;
}

/**
 * 逐层验证：把这一层的 visible 置 false，画面必须变。
 *
 * 只对「本来就该看得见」的层成立，所以调用方给的树里不能有被完全遮挡的层。
 * 视口外的层不参与判据：文档比视口高时首尾几条本来就该看不见。
 */
function witnessEach(layers: Layer[], zoom: number, panY: number): string[] {
  const view = makeViewportContext({
    viewportWidth: VIEW_W,
    viewportHeight: VIEW_H,
    docWidth: DOC_W,
    docHeight: DOC_H,
    zoom,
    panX: 0,
    panY,
    dpr: 1,
  });
  const base = frameOf(layers, zoom, panY);
  const lost: string[] = [];
  for (const target of layers) {
    // 组自己藏起来等于藏掉整棵子树，语义不同，见证判据只用在叶子上
    if (target.type === 'group') continue;
    // 只露出不到 1 个视口像素的层，重采样后可能合法地消失，不作要求
    if (onScreenExtent(target, view) < 1) continue;
    const hidden = layers.map((l) => (l.id === target.id ? { ...l, visible: false } : l));
    if (maxDelta(base, frameOf(hidden, zoom, panY)) === 0) lost.push(target.id);
  }
  return lost;
}

/** 016.psd 的形态：长图，一摞不重叠的条带，有的在隔离组里，有的带蒙版 */
function longDocTree(): Layer[] {
  const layers: Layer[] = [
    makeLayer({ id: 'bg', x: 0, y: 0, width: DOC_W, height: DOC_H, color: '#101010' }),
    makeLayer({ id: 'g1', type: 'group', x: 0, y: 0, width: 1, height: 1, opacity: 90 }),
    makeLayer({ id: 'g2', type: 'group', x: 0, y: 0, width: 1, height: 1, blendMode: 'multiply' }),
  ];
  for (let i = 0; i < 10; i += 1) {
    const y = 120 + i * 380;
    layers.push(
      makeLayer({
        id: `band${i}`,
        parentId: i % 3 === 0 ? 'g1' : i % 3 === 1 ? 'g2' : null,
        x: 40 + (i % 4) * 7,
        y,
        width: 700,
        height: i % 2 ? 240 : 9,
        color: ['#ff3b30', '#34c759', '#0a84ff', '#ffd60a'][i % 4],
        mask: i % 5 === 0,
      }),
    );
  }
  return layers;
}

describe('缩略视图下不能丢图层', () => {
  it('长图整体视图，每一层都看得见', () => {
    const layers = longDocTree();
    for (const zoom of [0.109, 0.15, 0.22, 0.33, 0.5, 1]) {
      expect(witnessEach(layers, zoom, 0), `zoom=${zoom} 这些层没画上去`).toEqual([]);
    }
  });

  it('平移到文档各段，落在视口内的层都看得见', () => {
    const layers = longDocTree();
    // 整棵树都传进去，视口内外由 witnessEach 按几何判定，不在这里预筛
    for (const panY of [-600, -1500, -2600, -3400]) {
      expect(witnessEach(layers, 1, panY), `panY=${panY} 这些层没画上去`).toEqual([]);
    }
  });
});
