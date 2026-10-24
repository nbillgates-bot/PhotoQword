/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { currentShapeDraft, draftShapeData, shapeTool } from './shapeTool';
import { context, drag, newDoc, pixelAt, pointer, reset, store } from './testKit';
import { DEFAULT_TOOL_OPTIONS } from '../store/toolSlice';

beforeEach(() => {
  reset(shapeTool);
  store().setToolOption('shapeKind', 'rect');
  store().setToolOption('shapeFilled', true);
  store().setToolOption('shapeStrokeWidth', 0);
});

describe('形状工具建图层', () => {
  it('正常拖拽新建一个形状图层并记录 shapeData', () => {
    newDoc();
    const before = store().layers.length;
    store().setForeground('#ff0000');
    drag(shapeTool, pointer(2, 2), pointer(12, 10));

    expect(store().layers).toHaveLength(before + 1);
    const layer = store().activeLayer()!;
    expect(layer.type).toBe('shape');
    expect(layer.shapeData).toMatchObject({
      kind: 'rect',
      fill: '#ff0000',
      rect: { x: 2, y: 2, width: 10, height: 8 },
    });
  });

  it('像素被真的画出来了，不只是记了数据', () => {
    newDoc();
    store().setForeground('#ff0000');
    drag(shapeTool, pointer(2, 2), pointer(12, 10));

    const [r, g, , a] = pixelAt(store().activeLayer()!.canvas, 6, 6);
    expect(a).toBeGreaterThan(200);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeLessThan(80);
  });

  it('拖拽范围不足 2×2 时不建图层，避免误点留下空形状', () => {
    newDoc();
    const before = store().layers.length;
    drag(shapeTool, pointer(5, 5), pointer(6, 6));

    expect(store().layers).toHaveLength(before);
  });

  it('单边够长就算有效，只有两边都不足才放弃', () => {
    newDoc();
    const before = store().layers.length;
    // 宽 10、高 1：细长线也是合法形状
    drag(shapeTool, pointer(2, 5), pointer(12, 6));

    expect(store().layers).toHaveLength(before + 1);
  });

  it('抬手后压一条历史，可以撤销掉整个图层', () => {
    newDoc();
    const before = store().layers.length;
    drag(shapeTool, pointer(2, 2), pointer(12, 10));
    expect(store().layers).toHaveLength(before + 1);

    store().undo();
    expect(store().layers).toHaveLength(before);
  });

  it('没有文档时不起草稿也不建图层', () => {
    drag(shapeTool, pointer(2, 2), pointer(12, 10));
    expect(currentShapeDraft()).toBeNull();
    expect(store().layers).toHaveLength(0);
  });

  it('工具切走时草稿被丢弃，不留下半成品图层', () => {
    newDoc();
    const before = store().layers.length;
    const ctx = context();
    shapeTool.onPointerDown?.(pointer(2, 2), ctx);
    shapeTool.onPointerMove?.(pointer(12, 12), ctx);
    shapeTool.onDeactivate?.(ctx);

    expect(currentShapeDraft()).toBeNull();
    expect(store().layers).toHaveLength(before);
  });
});

describe('rectFrom 的方向与 shift 约束', () => {
  const options = DEFAULT_TOOL_OPTIONS;

  it('宽高保留符号，供渲染层判断方向', () => {
    const data = draftShapeData({ x: 10, y: 10 }, { x: 4, y: 6 }, false, options, '#000', '#fff');
    expect(data.rect).toMatchObject({ x: 10, y: 10, width: -6, height: -4 });
  });

  it('shift 取长边并保持各自方向', () => {
    const data = draftShapeData({ x: 10, y: 10 }, { x: 4, y: 18 }, true, options, '#000', '#fff');
    expect(data.rect.width).toBe(-8);
    expect(data.rect.height).toBe(8);
  });

  it('未开描边时描边色回落为填充色', () => {
    const data = draftShapeData(
      { x: 0, y: 0 },
      { x: 8, y: 8 },
      false,
      { ...options, shapeStrokeWidth: 0 },
      '#ff0000',
      '#ff0000',
    );
    expect(data.stroke).toBe('#ff0000');
  });

  it('起止点重合时宽高为 0，不产生 NaN', () => {
    const data = draftShapeData({ x: 5, y: 5 }, { x: 5, y: 5 }, true, options, '#000', '#fff');
    expect(data.rect.width).toBe(0);
    expect(data.rect.height).toBe(0);
    expect(Number.isNaN(data.rect.width)).toBe(false);
  });
});

describe('形状种类', () => {
  it('椭圆形状的四角是空的，中心是实的', () => {
    newDoc();
    store().setToolOption('shapeKind', 'ellipse');
    store().setForeground('#ff0000');
    drag(shapeTool, pointer(0, 0), pointer(16, 16));

    const canvas = store().activeLayer()!.canvas;
    expect(pixelAt(canvas, 8, 8)[3]).toBeGreaterThan(200);
    expect(pixelAt(canvas, 0, 0)[3]).toBe(0);
  });

  it('shapeKind 被写进 shapeData，属性面板可继续改', () => {
    newDoc();
    store().setToolOption('shapeKind', 'star');
    store().setToolOption('shapePoints', 6);
    drag(shapeTool, pointer(1, 1), pointer(15, 15));

    expect(store().activeLayer()!.shapeData).toMatchObject({ kind: 'star', points: 6 });
  });
});
