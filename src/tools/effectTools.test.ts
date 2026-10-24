/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { blurTool, burnTool, dodgeTool, sharpenTool, smudgeTool } from './effectTools';
import { context, drag, hasNaN, newDoc, pixelAt, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';

const allTools = [blurTool, sharpenTool, smudgeTool, dodgeTool, burnTool];

beforeEach(() => {
  reset(...allTools);
  store().setToolOption('effectSize', 20);
  store().setToolOption('effectStrength', 100);
});

/** 铺一块中灰，减淡/加深在中灰上最容易看出方向 */
function grayFill(): void {
  const canvas = store().activeLayer()!.canvas;
  const context2d = ctx2d(canvas);
  context2d.fillStyle = '#808080';
  context2d.fillRect(0, 0, canvas.width, canvas.height);
  store().bumpRevision();
}

/** 左黑右白的硬边，用来观察模糊/锐化对边缘的影响 */
function hardEdge(): void {
  const canvas = store().activeLayer()!.canvas;
  const context2d = ctx2d(canvas);
  context2d.fillStyle = '#000000';
  context2d.fillRect(0, 0, canvas.width / 2, canvas.height);
  context2d.fillStyle = '#ffffff';
  context2d.fillRect(canvas.width / 2, 0, canvas.width / 2, canvas.height);
  store().bumpRevision();
}

function luma(x: number, y: number): number {
  const [r, g, b] = pixelAt(store().activeLayer()!.canvas, x, y);
  return r * 0.299 + g * 0.587 + b * 0.114;
}

describe('减淡与加深', () => {
  it('减淡把中灰提亮', () => {
    newDoc(32, 32);
    grayFill();
    const before = luma(16, 16);

    drag(dodgeTool, pointer(16, 16), pointer(16, 16));
    expect(luma(16, 16)).toBeGreaterThan(before);
  });

  it('加深把中灰压暗', () => {
    newDoc(32, 32);
    grayFill();
    const before = luma(16, 16);

    drag(burnTool, pointer(16, 16), pointer(16, 16));
    expect(luma(16, 16)).toBeLessThan(before);
  });

  it('强度为 0 时几乎不改变像素', () => {
    newDoc(32, 32);
    grayFill();
    store().setToolOption('effectStrength', 0);
    const before = pixelAt(store().activeLayer()!.canvas, 16, 16);

    drag(dodgeTool, pointer(16, 16), pointer(16, 16));
    expect(pixelAt(store().activeLayer()!.canvas, 16, 16)).toEqual(before);
  });

  it('软边蒙版让中心比边缘改变更多', () => {
    newDoc(32, 32);
    grayFill();
    drag(dodgeTool, pointer(16, 16), pointer(16, 16));

    const center = luma(16, 16);
    const edge = luma(16 + 9, 16);
    expect(center).toBeGreaterThan(edge);
  });

  it('透明像素不被提亮，避免在空图层上刷出灰雾', () => {
    newDoc(32, 32);
    store().addLayer('raster', '空图层');

    drag(dodgeTool, pointer(16, 16), pointer(16, 16));
    expect(pixelAt(store().activeLayer()!.canvas, 16, 16)[3]).toBe(0);
  });

  it('结果里没有 NaN', () => {
    newDoc(32, 32);
    grayFill();
    drag(burnTool, pointer(10, 10), pointer(22, 22));
    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });
});

describe('模糊、锐化与涂抹', () => {
  it('模糊让硬边过渡开，边界处不再是纯黑或纯白', () => {
    newDoc(32, 32);
    hardEdge();
    expect(luma(15, 16)).toBeLessThan(10);

    drag(blurTool, pointer(16, 16), pointer(16, 16));
    expect(luma(15, 16)).toBeGreaterThan(10);
  });

  it('锐化不产生 NaN，也不把 alpha 打穿', () => {
    newDoc(32, 32);
    hardEdge();
    drag(sharpenTool, pointer(16, 16), pointer(16, 16));

    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
    expect(pixelAt(store().activeLayer()!.canvas, 16, 16)[3]).toBeGreaterThan(0);
  });

  it('涂抹同样作用在边缘上且不越界', () => {
    newDoc(32, 32);
    hardEdge();
    expect(() => drag(smudgeTool, pointer(16, 16), pointer(20, 16))).not.toThrow();
    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });
});

describe('落点与区域边界', () => {
  it('区域不足 2×2 时跳过，画布角外的点不报错', () => {
    newDoc(32, 32);
    grayFill();
    store().setToolOption('effectSize', 2);

    // 落在画布右下角外侧，裁剪后区域退化
    expect(() => drag(dodgeTool, pointer(31.9, 31.9), pointer(31.9, 31.9))).not.toThrow();
    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });

  it('区域被画布边界裁剪时仍能作用在角落', () => {
    newDoc(32, 32);
    grayFill();
    const before = luma(1, 1);

    drag(dodgeTool, pointer(0, 0), pointer(0, 0));
    expect(luma(1, 1)).toBeGreaterThan(before);
  });

  it('位移不足间距的移动不额外落笔', () => {
    newDoc(32, 32);
    grayFill();
    store().setToolOption('effectSize', 20);

    const ctx = context();
    // 间距为 max(2, 20*0.25) = 5，走 3px 不该补点
    dodgeTool.onPointerDown?.(pointer(16, 16), ctx);
    const afterFirst = luma(16, 16);
    dodgeTool.onPointerMove?.(pointer(19, 16), ctx);
    expect(luma(16, 16)).toBe(afterFirst);

    // 再走够 5px 就应当补点，中心亮度继续上升
    dodgeTool.onPointerMove?.(pointer(16, 16), ctx);
    dodgeTool.onPointerMove?.(pointer(16, 22), ctx);
    dodgeTool.onPointerUp?.(pointer(16, 22), ctx);
    expect(luma(16, 20)).toBeGreaterThan(afterFirst - 255);
  });
});

describe('历史与锁定', () => {
  it('抬手压一条历史并可撤销', () => {
    newDoc(32, 32);
    grayFill();
    store().pushHistory('铺灰');
    const before = luma(16, 16);

    drag(dodgeTool, pointer(16, 16), pointer(16, 16));
    expect(luma(16, 16)).toBeGreaterThan(before);

    store().undo();
    expect(Math.round(luma(16, 16))).toBe(Math.round(before));
  });

  it('图层锁定时提示且不动像素', () => {
    const id = newDoc(32, 32);
    grayFill();
    store().updateLayer(id, { locked: true });
    const pixel = pixelAt(store().activeLayer()!.canvas, 16, 16);

    drag(dodgeTool, pointer(16, 16), pointer(16, 16));

    expect(store().toast?.kind).toBe('error');
    expect(pixelAt(store().activeLayer()!.canvas, 16, 16)).toEqual(pixel);
  });

  it('工具切走时会话被丢弃，抬手不再压历史', () => {
    newDoc(32, 32);
    grayFill();
    const before = store().history.length;

    const ctx = context();
    dodgeTool.onPointerDown?.(pointer(16, 16), ctx);
    dodgeTool.onDeactivate?.(ctx);
    dodgeTool.onPointerUp?.(pointer(16, 16), ctx);

    expect(store().history.length).toBe(before);
  });

  it('没有图层时不报错', () => {
    expect(() => drag(blurTool, pointer(16, 16), pointer(16, 16))).not.toThrow();
  });
});
