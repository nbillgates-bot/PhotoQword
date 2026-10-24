/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer, LayerType } from '../../types';
import { createCanvas, ctx2d } from '../canvasUtils';
import { boundsFor } from '../layerBounds';
import { flatten } from '../compositor';
import { graphFromLayers, resolverFrom, surfaceIdOf } from './layerAdapter';

const W = 4;
const H = 4;

/** 造一个纯色填满的图层，type 可换成 text / shape */
function solid(id: string, color: string, type: LayerType = 'raster'): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, W, H);
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas),
    parentId: null,
  };
}

/** 读画布某点的 RGBA */
function pixel(canvas: HTMLCanvasElement, x = 0, y = 0): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

describe('resolverFrom', () => {
  /*
   * 这是导出丢图层那个 bug 的回归用例。
   *
   * 文字/形状图层已经把排版结果烧进了 layer.canvas（文字工具提交时就栅格化），
   * 所以解析器必须把那张画布交出来。返回 null 会让求值器认为该节点没内容、
   * 整层跳过——屏幕上（走老 paintNodes 路径）还在，导出与存储（走求值器）就没了。
   */
  it('文字与形状节点能取到自己的像素', () => {
    const text = solid('t1', '#ff0000', 'text');
    const shape = solid('s1', '#00ff00', 'shape');
    const bridge = graphFromLayers([text, shape]);
    const resolver = resolverFrom(bridge.canvases, bridge.masks);

    const textNode = bridge.graph.nodes.t1;
    const shapeNode = bridge.graph.nodes.s1;

    expect(resolver.raster?.(textNode)).toBe(text.canvas);
    expect(resolver.raster?.(shapeNode)).toBe(shape.canvas);
  });

  it('像素节点仍然走 pixels，按 surfaceId 索引', () => {
    const raster = solid('r1', '#0000ff');
    const bridge = graphFromLayers([raster]);
    const resolver = resolverFrom(bridge.canvases, bridge.masks);

    expect(bridge.canvases.get(surfaceIdOf('r1'))).toBe(raster.canvas);
    expect(resolver.pixels(bridge.graph.nodes.r1)).toBe(raster.canvas);
  });

  it('组节点没有自己的像素，取不到也不抛错', () => {
    const canvas = createCanvas(1, 1);
    const groupLayer: Layer = {
      id: 'g1',
      name: 'g1',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'pass-through',
      canvas,
      bounds: boundsFor(canvas),
      parentId: null,
    };
    const bridge = graphFromLayers([groupLayer]);
    const resolver = resolverFrom(bridge.canvases, bridge.masks);

    expect(resolver.pixels(bridge.graph.nodes.g1)).toBeNull();
    expect(resolver.raster?.(bridge.graph.nodes.g1)).toBeNull();
  });
});

describe('flatten 覆盖全部图层类型', () => {
  /*
   * 导出/存储走的是 flatten → composite → evaluateGraph 这条路，
   * 与屏幕上那条（compositeInView → paintNodesInView）是两套实现。
   * 这几个用例专门盯住「导出结果里各类图层都在」。
   */
  it('文字图层出现在合成结果里', () => {
    const flat = flatten([solid('t1', '#ff0000', 'text')], W, H);
    expect(pixel(flat)).toEqual([255, 0, 0, 255]);
  });

  it('形状图层出现在合成结果里', () => {
    const flat = flatten([solid('s1', '#00ff00', 'shape')], W, H);
    expect(pixel(flat)).toEqual([0, 255, 0, 255]);
  });

  it('文字盖在像素图层之上，顺序与图层栈一致', () => {
    const flat = flatten([solid('r1', '#0000ff'), solid('t1', '#ff0000', 'text')], W, H);
    expect(pixel(flat)).toEqual([255, 0, 0, 255]);
  });

  it('隐藏的文字图层不出现在合成结果里', () => {
    const text = solid('t1', '#ff0000', 'text');
    const flat = flatten([{ ...text, visible: false }], W, H);
    expect(pixel(flat)[3]).toBe(0);
  });
});
