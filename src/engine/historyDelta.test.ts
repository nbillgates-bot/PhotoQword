/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { applyDelta, buildDelta, layerMeta, metaMap, removalDeltas } from './historyDelta';
import { readAll } from './pixelDiff';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { shadowFromPixels } from './shadowImage';
import type { Layer, LayerDelta } from '../types';

/**
 * 这些用例测的是"图层像素怎么差分"这个契约，与蒙版无关。
 * 蒙版引入后 buildDelta 多了 target 参数，用这个 helper 保持用例本身不动。
 */
function buildLayerDelta(layer: Layer, shadow: ImageData | null): LayerDelta | null {
  return buildDelta(layer.id, 'canvas', layer.canvas, shadow);
}

/** 旧的单条 removalDelta 现在返回数组，取像素那条 */
function removalDelta(layerId: string, shadow: ImageData): LayerDelta {
  return removalDeltas(layerId, { canvas: shadowFromPixels(shadow), mask: null })[0];
}

function makeLayer(id: string, width = 16, height = 16, color = '#ffffff'): Layer {
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return {
    id,
    name: `图层 ${id}`,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas),
  };
}

function paint(layer: Layer, color: string, x: number, y: number, w: number, h: number): void {
  const context = ctx2d(layer.canvas);
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

function pixel(layer: Layer, x: number, y: number): number[] {
  const d = ctx2d(layer.canvas).getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

const WHITE = [255, 255, 255, 255];
const RED = [255, 0, 0, 255];

describe('layerMeta / metaMap', () => {
  it('剥掉画布，保留其余属性', () => {
    const layer = makeLayer('a');
    const meta = layerMeta(layer);
    expect('canvas' in meta).toBe(false);
    expect(meta.name).toBe('图层 a');
    expect(meta.opacity).toBe(100);
  });

  it('深拷贝 textData，改原图层不影响已存的 meta', () => {
    const layer = makeLayer('a');
    layer.textData = {
      content: '原文',
      fontFamily: 'Arial',
      fontSize: 12,
      fontWeight: 400,
      bold: false,
      italic: false,
      underline: false,
      align: 'left',
      color: '#000000',
      lineHeight: 1.2,
      letterSpacing: 0,
      x: 0,
      y: 0,
    };
    const meta = layerMeta(layer);
    layer.textData.content = '改过了';
    expect(meta.textData?.content).toBe('原文');
  });

  it('metaMap 按 id 索引全部图层', () => {
    const map = metaMap([makeLayer('a'), makeLayer('b')]);
    expect(Object.keys(map).sort()).toEqual(['a', 'b']);
  });

  /*
   * 回退时 rebuildLayers 做的是 { ...existing, ...meta }。
   * 缺席的键盖不掉旧值，所以 parentId 必须显式为 null——
   * 否则撤销编组之后子图层的 parentId 还指着已删除的组，从图层树上脱落，
   * 界面上表现为图层凭空消失。
   */
  it('parentId 显式写成 null，而不是让键缺席', () => {
    const layer = makeLayer('a');
    expect(layer.parentId).toBeUndefined();
    const meta = layerMeta(layer);
    expect('parentId' in meta).toBe(true);
    expect(meta.parentId).toBeNull();
  });

  it('meta 里的 null parentId 能盖掉旧的组指向', () => {
    const inGroup = { ...makeLayer('a'), parentId: 'g1' };
    const meta = layerMeta({ ...inGroup, parentId: null });
    // 模拟 rebuildLayers 的合并方式
    const merged = { ...inGroup, ...meta };
    expect(merged.parentId).toBeNull();
  });
});

describe('buildLayerDelta', () => {
  it('没有变化时返回 null', () => {
    const layer = makeLayer('a');
    const shadow = readAll(layer.canvas);
    expect(buildLayerDelta(layer, shadow)).toBeNull();
  });

  it('局部改动生成 region 增量，只存那一块', () => {
    const layer = makeLayer('a', 20, 20);
    const shadow = readAll(layer.canvas);
    paint(layer, '#ff0000', 4, 5, 3, 2);

    const delta = buildLayerDelta(layer, shadow);
    expect(delta?.kind).toBe('region');
    if (delta?.kind !== 'region') throw new Error('应为 region');
    expect(delta.rect).toEqual({ x: 4, y: 5, width: 3, height: 2 });
    // 只存了 3x2，而不是 20x20
    expect(delta.after.data.length).toBe(3 * 2 * 4);
  });

  it('影子为 null（新图层）生成 full 增量，before 为 null', () => {
    const layer = makeLayer('a');
    const delta = buildLayerDelta(layer, null);
    expect(delta?.kind).toBe('full');
    if (delta?.kind !== 'full') throw new Error('应为 full');
    expect(delta.before).toBeNull();
    expect(delta.after).not.toBeNull();
  });

  it('改动面积过大时退回 full，避免存两份差不多大的区域', () => {
    const layer = makeLayer('a', 10, 10);
    const shadow = readAll(layer.canvas);
    paint(layer, '#ff0000', 0, 0, 10, 10); // 100% 改动
    expect(buildLayerDelta(layer, shadow)?.kind).toBe('full');
  });

  it('画布尺寸变化时退回 full（区域比对失效）', () => {
    const layer = makeLayer('a', 10, 10);
    const shadow = readAll(layer.canvas);
    layer.canvas = createCanvas(20, 20); // 模拟改画布大小
    const delta = buildLayerDelta(layer, shadow);
    expect(delta?.kind).toBe('full');
    if (delta?.kind !== 'full') throw new Error('应为 full');
    expect(delta.before?.width).toBe(10);
    expect(delta.after?.width).toBe(20);
  });
});

describe('applyDelta', () => {
  it('region 增量能来回切换像素', () => {
    const layer = makeLayer('a', 20, 20);
    const shadow = readAll(layer.canvas);
    paint(layer, '#ff0000', 4, 4, 4, 4);
    const delta = buildLayerDelta(layer, shadow)!;

    applyDelta(delta, [layer], 'undo');
    expect(pixel(layer, 5, 5)).toEqual(WHITE);
    applyDelta(delta, [layer], 'redo');
    expect(pixel(layer, 5, 5)).toEqual(RED);
  });

  it('撤销 region 增量不影响矩形外的像素', () => {
    const layer = makeLayer('a', 20, 20);
    const shadow = readAll(layer.canvas);
    paint(layer, '#ff0000', 4, 4, 4, 4);
    const delta = buildLayerDelta(layer, shadow)!;
    // 生成增量之后又在别处涂了一笔，这一笔不在增量范围内，撤销时不该被动到
    paint(layer, '#00ff00', 15, 15, 2, 2);

    applyDelta(delta, [layer], 'undo');
    expect(pixel(layer, 5, 5)).toEqual(WHITE);
    expect(pixel(layer, 16, 16)).toEqual([0, 255, 0, 255]);
  });

  it('full 增量能整幅还原，且尺寸跟着变', () => {
    const layer = makeLayer('a', 10, 10);
    const shadow = readAll(layer.canvas);
    layer.canvas = createCanvas(20, 20);
    const delta = buildLayerDelta(layer, shadow)!;

    applyDelta(delta, [layer], 'undo');
    expect([layer.canvas.width, layer.canvas.height]).toEqual([10, 10]);
    applyDelta(delta, [layer], 'redo');
    expect([layer.canvas.width, layer.canvas.height]).toEqual([20, 20]);
  });

  it('目标图层不在列表里时安全跳过，不抛错', () => {
    const layer = makeLayer('a');
    const shadow = readAll(layer.canvas);
    paint(layer, '#ff0000', 1, 1, 2, 2);
    const delta = buildLayerDelta(layer, shadow)!;
    expect(() => applyDelta(delta, [], 'undo')).not.toThrow();
  });

  it('新图层的增量在 undo 方向没有像素可贴，跳过而不清空画布', () => {
    const layer = makeLayer('a');
    const delta = buildLayerDelta(layer, null)!;
    applyDelta(delta, [layer], 'undo'); // before 为 null
    // 画布应保持原样，由图层列表负责把它整个移除
    expect(pixel(layer, 0, 0)).toEqual(WHITE);
  });
});

describe('removalDelta', () => {
  it('删除图层的增量 after 为 null，undo 时能把像素还回来', () => {
    const layer = makeLayer('a');
    paint(layer, '#ff0000', 0, 0, 16, 16);
    const delta = removalDelta('a', readAll(layer.canvas));
    expect(delta.kind).toBe('full');
    if (delta.kind !== 'full') throw new Error('应为 full');
    expect(delta.after).toBeNull();

    const revived = makeLayer('a');
    applyDelta(delta, [revived], 'undo');
    expect(pixel(revived, 8, 8)).toEqual(RED);
  });
});
