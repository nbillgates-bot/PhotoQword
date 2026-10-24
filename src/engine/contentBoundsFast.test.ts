/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { contentBoundsFast } from './contentBoundsFast';
import { contentBounds } from './layerBounds';
import { createCanvas, ctx2d } from './canvasUtils';

/** 一张画布，在指定位置填一块不透明色 */
function withRect(
  width: number,
  height: number,
  rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  return canvas;
}

describe('contentBoundsFast', () => {
  it('全透明画布返回 null', () => {
    expect(contentBoundsFast(createCanvas(64, 64))).toBeNull();
  });

  it('宽或高为 0 返回 null', () => {
    expect(contentBoundsFast(createCanvas(0, 8))).toBeNull();
    expect(contentBoundsFast(createCanvas(8, 0))).toBeNull();
  });

  it('小画布不降采样，结果与精确版一致', () => {
    // 长边 ≤ PROBE(256) 时 factor 为 1，走的是原图，应当精确
    const canvas = withRect(100, 80, { x: 20, y: 10, w: 30, h: 40 });
    expect(contentBoundsFast(canvas)).toEqual(contentBounds(canvas));
  });

  it('1×1 全不透明画布', () => {
    expect(contentBoundsFast(withRect(1, 1, { x: 0, y: 0, w: 1, h: 1 }))).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('内容铺满时返回整幅', () => {
    expect(contentBoundsFast(withRect(40, 40, { x: 0, y: 0, w: 40, h: 40 }))).toEqual({
      x: 0,
      y: 0,
      width: 40,
      height: 40,
    });
  });

  /*
   * 降采样档的契约只有一条：**只会偏大，不会偏小**。
   * 不断言具体数值——探测图的重采样在各浏览器上有细微差异，
   * 写死数字等于把断言绑在某一家的实现上（规约 §9）。
   */
  describe('大画布降采样', () => {
    /** 长边 2048，远超 PROBE，必然走降采样 */
    const BIG = 2048;

    it('框住真实内容，且不小于真实内容', () => {
      const canvas = withRect(BIG, 512, { x: 800, y: 100, w: 400, h: 200 });
      const exact = contentBounds(canvas)!;
      const fast = contentBoundsFast(canvas)!;

      expect(fast.x).toBeLessThanOrEqual(exact.x);
      expect(fast.y).toBeLessThanOrEqual(exact.y);
      expect(fast.x + fast.width).toBeGreaterThanOrEqual(exact.x + exact.width);
      expect(fast.y + fast.height).toBeGreaterThanOrEqual(exact.y + exact.height);
    });

    it('不超出画布范围', () => {
      const canvas = withRect(BIG, 512, { x: 0, y: 0, w: BIG, h: 512 });
      const fast = contentBoundsFast(canvas)!;
      expect(fast.x).toBeGreaterThanOrEqual(0);
      expect(fast.y).toBeGreaterThanOrEqual(0);
      expect(fast.x + fast.width).toBeLessThanOrEqual(BIG);
      expect(fast.y + fast.height).toBeLessThanOrEqual(512);
    });

    it('细线不会被降采样吃掉', () => {
      // 1px 高的线在 8 倍降采样后 alpha 约 32，仍然 > 0
      const canvas = withRect(BIG, 512, { x: 100, y: 256, w: 1000, h: 1 });
      expect(contentBoundsFast(canvas)).not.toBeNull();
    });

    it('极扁画布也能算出非零宽高', () => {
      const canvas = withRect(BIG, 1, { x: 500, y: 0, w: 100, h: 1 });
      const fast = contentBoundsFast(canvas)!;
      expect(fast.width).toBeGreaterThan(0);
      expect(fast.height).toBeGreaterThan(0);
    });

    it('全透明的大画布仍然返回 null', () => {
      expect(contentBoundsFast(createCanvas(BIG, 512))).toBeNull();
    });
  });
});
