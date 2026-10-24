/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  canvasFromPixels,
  cutRegion,
  diffBounds,
  pasteRegion,
  readAll,
  regionRatio,
} from './pixelDiff';
import { createCanvas, ctx2d } from './canvasUtils';
import { recordContextOptions } from './testUtils';

/** 造一张纯色画布 */
function solid(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return canvas;
}

function withBlock(
  base: HTMLCanvasElement,
  color: string,
  rect: { x: number; y: number; width: number; height: number },
): HTMLCanvasElement {
  const context = ctx2d(base);
  context.fillStyle = color;
  context.fillRect(rect.x, rect.y, rect.width, rect.height);
  return base;
}

describe('diffBounds', () => {
  it('完全相同返回 null', () => {
    const a = readAll(solid(16, 16, '#ffffff'));
    const b = readAll(solid(16, 16, '#ffffff'));
    expect(diffBounds(a, b)).toBeNull();
  });

  it('单个像素的改动也能定位到 1x1', () => {
    const before = readAll(solid(16, 16, '#ffffff'));
    const canvas = solid(16, 16, '#ffffff');
    const context = ctx2d(canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(7, 5, 1, 1);
    expect(diffBounds(before, readAll(canvas))).toEqual({ x: 7, y: 5, width: 1, height: 1 });
  });

  it('矩形改动被精确框住（含边界像素）', () => {
    const before = readAll(solid(20, 20, '#ffffff'));
    const after = readAll(withBlock(solid(20, 20, '#ffffff'), '#ff0000', {
      x: 4,
      y: 6,
      width: 5,
      height: 3,
    }));
    expect(diffBounds(before, after)).toEqual({ x: 4, y: 6, width: 5, height: 3 });
  });

  it('贴着边缘的改动不会算漏', () => {
    const before = readAll(solid(12, 12, '#ffffff'));
    const after = readAll(withBlock(solid(12, 12, '#ffffff'), '#ff0000', {
      x: 0,
      y: 0,
      width: 12,
      height: 1,
    }));
    expect(diffBounds(before, after)).toEqual({ x: 0, y: 0, width: 12, height: 1 });
  });

  it('两处分离的改动被合并成一个外接矩形', () => {
    const before = readAll(solid(20, 20, '#ffffff'));
    const canvas = solid(20, 20, '#ffffff');
    withBlock(canvas, '#ff0000', { x: 2, y: 2, width: 2, height: 2 });
    withBlock(canvas, '#00ff00', { x: 15, y: 16, width: 2, height: 2 });
    // 外接矩形从 (2,2) 覆盖到 (16,17)
    expect(diffBounds(before, readAll(canvas))).toEqual({ x: 2, y: 2, width: 15, height: 16 });
  });

  it('只有 alpha 变化也能检出（不能只比 RGB）', () => {
    const before = readAll(solid(8, 8, 'rgba(255,0,0,1)'));
    const canvas = createCanvas(8, 8);
    const context = ctx2d(canvas);
    context.fillStyle = 'rgba(255,0,0,0.5)';
    context.fillRect(0, 0, 8, 8);
    expect(diffBounds(before, readAll(canvas))).not.toBeNull();
  });

  it('尺寸不同时退回全图', () => {
    const a = readAll(solid(8, 8, '#ffffff'));
    const b = readAll(solid(10, 10, '#ffffff'));
    expect(diffBounds(a, b)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('1x1 画布不会越界', () => {
    const before = readAll(solid(1, 1, '#ffffff'));
    const after = readAll(solid(1, 1, '#ff0000'));
    expect(diffBounds(before, after)).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });
});

describe('cutRegion / pasteRegion', () => {
  it('抠出再贴回同一位置，画面不变', () => {
    const canvas = withBlock(solid(16, 16, '#ffffff'), '#ff0000', {
      x: 4,
      y: 4,
      width: 4,
      height: 4,
    });
    const snapshot = readAll(canvas);
    const rect = { x: 4, y: 4, width: 4, height: 4 };
    const piece = cutRegion(canvas, rect);
    pasteRegion(canvas, rect, piece);
    expect([...readAll(canvas).data]).toEqual([...snapshot.data]);
  });

  it('贴回旧像素能撤销一次改动', () => {
    const canvas = solid(16, 16, '#ffffff');
    const rect = { x: 2, y: 2, width: 6, height: 6 };
    const original = cutRegion(canvas, rect);

    withBlock(canvas, '#ff0000', rect);
    expect([...cutRegion(canvas, rect).data.slice(0, 4)]).toEqual([255, 0, 0, 255]);

    pasteRegion(canvas, rect, original);
    expect([...cutRegion(canvas, rect).data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });

  it('只影响矩形内部，外部像素不动', () => {
    const canvas = solid(16, 16, '#ffffff');
    const rect = { x: 4, y: 4, width: 4, height: 4 };
    const red = cutRegion(withBlock(solid(16, 16, '#ff0000'), '#ff0000', rect), rect);
    pasteRegion(canvas, rect, red);
    const data = readAll(canvas);
    // 取 (0,0) 这个矩形外的像素，它必须仍是白的
    expect([...data.data.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });
});

describe('canvasFromPixels', () => {
  it('尺寸和像素都还原', () => {
    const source = withBlock(solid(10, 6, '#ffffff'), '#0000ff', {
      x: 1,
      y: 1,
      width: 3,
      height: 3,
    });
    const restored = canvasFromPixels(readAll(source));
    expect([restored.width, restored.height]).toEqual([10, 6]);
    expect([...readAll(restored).data]).toEqual([...readAll(source).data]);
  });
});

describe('regionRatio', () => {
  it('按面积算占比', () => {
    expect(regionRatio({ x: 0, y: 0, width: 5, height: 4 }, 10, 10)).toBeCloseTo(0.2);
    expect(regionRatio({ x: 0, y: 0, width: 10, height: 10 }, 10, 10)).toBe(1);
  });

  it('零尺寸画布返回 1，不产生除零', () => {
    const ratio = regionRatio({ x: 0, y: 0, width: 0, height: 0 }, 0, 0);
    expect(ratio).toBe(1);
    expect(Number.isNaN(ratio)).toBe(false);
  });
});

/**
 * 历史差分每压一步都要把图层像素整张读回来，这几个读点必须声明
 * willReadFrequently，否则 Blink 会刷一整屏 readback 警告。
 * 断言首次 getContext 的实参，因为 options 只有第一次生效。
 */
describe('读像素的入口声明 willReadFrequently', () => {
  /** 首次取 2D 上下文时是否声明了 willReadFrequently */
  function firstReadback(run: () => unknown): boolean | undefined {
    return recordContextOptions(run).options[0]?.willReadFrequently;
  }

  it('readAll 是空图层的第一次 getContext，声明生效', () => {
    const canvas = createCanvas(4, 4);
    expect(firstReadback(() => readAll(canvas))).toBe(true);
  });

  it('cutRegion 同样声明', () => {
    const canvas = createCanvas(4, 4);
    expect(firstReadback(() => cutRegion(canvas, { x: 0, y: 0, width: 2, height: 2 }))).toBe(true);
  });

  it('canvasFromPixels 造出来的画布在创建时就声明', () => {
    const pixels = readAll(solid(2, 2, '#ff0000'));
    expect(firstReadback(() => canvasFromPixels(pixels))).toBe(true);
  });
});
