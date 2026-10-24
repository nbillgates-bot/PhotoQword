/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { brushRingFor } from './brushRing';

describe('brushRingFor', () => {
  it('半径是直径的一半', () => {
    expect(brushRingFor(20, 1, 'round')?.radius).toBe(10);
  });

  it('方形笔刷画方框，圆形和柔边画圆', () => {
    expect(brushRingFor(20, 1, 'square')?.square).toBe(true);
    expect(brushRingFor(20, 1, 'round')?.square).toBe(false);
    expect(brushRingFor(20, 1, 'soft')?.square).toBe(false);
  });

  it('半径是文档坐标，不随缩放变', () => {
    // 覆盖层按 zoom 缩放显示，所以这里不该再乘一遍
    expect(brushRingFor(20, 4, 'round')?.radius).toBe(10);
    expect(brushRingFor(20, 0.25, 'round')?.radius).toBe(10);
  });

  it('缩得太小画不出有意义的环，退回十字', () => {
    // 直径 2 缩到 0.5 倍，屏幕半径 0.5px
    expect(brushRingFor(2, 0.5, 'round')).toBeNull();
  });

  it('屏幕半径刚好到阈值时给环', () => {
    // 直径 4、zoom 1 -> 屏幕半径 2，正好等于下限
    expect(brushRingFor(4, 1, 'round')).not.toBeNull();
  });

  it('小笔刷放大后仍然给环', () => {
    // 直径 1 本身太小，但放大 8 倍后屏幕半径 4px，画得出来
    expect(brushRingFor(1, 8, 'round')).not.toBeNull();
  });

  it('尺寸为 1 的极小笔刷在 100% 下退回十字', () => {
    expect(brushRingFor(1, 1, 'round')).toBeNull();
  });

  it('尺寸或缩放非正时返回 null', () => {
    expect(brushRingFor(0, 1, 'round')).toBeNull();
    expect(brushRingFor(-10, 1, 'round')).toBeNull();
    expect(brushRingFor(20, 0, 'round')).toBeNull();
    expect(brushRingFor(20, -1, 'round')).toBeNull();
  });

  it('NaN 和 Infinity 返回 null，不产生画不出来的路径', () => {
    expect(brushRingFor(NaN, 1, 'round')).toBeNull();
    expect(brushRingFor(20, NaN, 'round')).toBeNull();
    expect(brushRingFor(Infinity, 1, 'round')).toBeNull();
    expect(brushRingFor(20, Infinity, 'round')).toBeNull();
  });

  it('大笔刷不设上限，PS 也一直画', () => {
    expect(brushRingFor(5000, 1, 'round')?.radius).toBe(2500);
  });

  it('半径永远不是 NaN', () => {
    const sizes = [1, 2, 4, 7, 20, 300, 0.5];
    const zooms = [0.1, 0.5, 1, 3, 16];
    sizes.forEach((size) => {
      zooms.forEach((zoom) => {
        const ring = brushRingFor(size, zoom, 'round');
        if (ring) expect(Number.isNaN(ring.radius)).toBe(false);
      });
    });
  });
});
