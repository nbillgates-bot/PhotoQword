/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  LOUPE_GAP,
  LOUPE_MAGNIFICATION,
  LOUPE_SIZE,
  loupePlacement,
  loupeSourceRect,
} from './loupe';

describe('源矩形', () => {
  it('以指尖为中心，边长 = 直径 / 倍率', () => {
    const rect = loupeSourceRect({ center: { x: 200, y: 150 }, dpr: 1 });
    const expected = LOUPE_SIZE / LOUPE_MAGNIFICATION;
    expect(rect.width).toBe(expected);
    expect(rect.height).toBe(expected);
    expect(rect.x + rect.width / 2).toBe(200);
    expect(rect.y + rect.height / 2).toBe(150);
  });

  it('2x 屏上源矩形按 dpr 放大（画布背衬也是 dpr 倍）', () => {
    const one = loupeSourceRect({ center: { x: 100, y: 100 }, dpr: 1 });
    const two = loupeSourceRect({ center: { x: 100, y: 100 }, dpr: 2 });
    expect(two.width).toBe(one.width * 2);
    // 中心也要跟着换算，否则放大镜里看到的不是指尖那一点
    expect(two.x + two.width / 2).toBe(200);
  });

  it('倍率越高看到的范围越小', () => {
    const low = loupeSourceRect({ center: { x: 50, y: 50 }, dpr: 1, magnification: 2 });
    const high = loupeSourceRect({ center: { x: 50, y: 50 }, dpr: 1, magnification: 4 });
    expect(high.width).toBeLessThan(low.width);
  });

  it('贴边时不夹源矩形：夹了倍率就会悄悄变大，指尖和镜内位置对不上', () => {
    const rect = loupeSourceRect({ center: { x: 0, y: 0 }, dpr: 1 });
    expect(rect.x).toBeLessThan(0);
    expect(rect.width).toBe(LOUPE_SIZE / LOUPE_MAGNIFICATION);
  });

  it('边界值不产出 NaN', () => {
    for (const dpr of [1, 2, 3]) {
      for (const point of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 }]) {
        const rect = loupeSourceRect({ center: point, dpr });
        for (const value of [rect.x, rect.y, rect.width, rect.height]) {
          expect(Number.isNaN(value)).toBe(false);
        }
        expect(rect.width).toBeGreaterThan(0);
      }
    }
  });
});

describe('摆放位置', () => {
  const viewport = { width: 1024, height: 768 };

  it('默认摆在指尖正上方，且水平居中对齐指尖', () => {
    const at = loupePlacement({ center: { x: 500, y: 400 }, viewport });
    expect(at.y).toBe(400 - LOUPE_GAP - LOUPE_SIZE);
    expect(at.x + LOUPE_SIZE / 2).toBe(500);
  });

  it('留出的间隙足够让手指不挡住镜子', () => {
    const at = loupePlacement({ center: { x: 500, y: 400 }, viewport });
    expect(400 - (at.y + LOUPE_SIZE)).toBe(LOUPE_GAP);
  });

  it('顶部放不下就翻到下方', () => {
    const at = loupePlacement({ center: { x: 500, y: 20 }, viewport });
    expect(at.y).toBe(20 + LOUPE_GAP);
  });

  it('左右都不会出视口', () => {
    expect(loupePlacement({ center: { x: 2, y: 400 }, viewport }).x).toBe(0);
    expect(loupePlacement({ center: { x: 1020, y: 400 }, viewport }).x).toBe(
      viewport.width - LOUPE_SIZE,
    );
  });

  it('视口比放大镜还小时夹到 0，不跑到屏幕外', () => {
    const tiny = { width: 60, height: 60 };
    const at = loupePlacement({ center: { x: 30, y: 30 }, viewport: tiny });
    expect(at.x).toBe(0);
    expect(at.y).toBe(0);
  });

  it('任何指尖位置都落在视口内', () => {
    for (const x of [0, 1, 512, 1023, 1024]) {
      for (const y of [0, 1, 384, 767, 768]) {
        const at = loupePlacement({ center: { x, y }, viewport });
        expect(at.x).toBeGreaterThanOrEqual(0);
        expect(at.y).toBeGreaterThanOrEqual(0);
        expect(at.x + LOUPE_SIZE).toBeLessThanOrEqual(viewport.width);
        expect(at.y + LOUPE_SIZE).toBeLessThanOrEqual(viewport.height);
      }
    }
  });
});
