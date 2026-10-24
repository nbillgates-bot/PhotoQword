/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  applyCurves,
  buildCurveLut,
  defaultCurve,
  defaultCurves,
  isIdentityCurve,
  normalizePoints,
  type CurvePoint,
} from './curves';
import { createCanvas, ctx2d } from './canvasUtils';

function solid(r: number, g: number, b: number, a = 255, size = 2): ImageData {
  const context = ctx2d(createCanvas(size, size));
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = r;
    image.data[i + 1] = g;
    image.data[i + 2] = b;
    image.data[i + 3] = a;
  }
  return image;
}

describe('isIdentityCurve', () => {
  it('默认对角线是恒等', () => {
    expect(isIdentityCurve(defaultCurve())).toBe(true);
  });

  it('加了中间点就不是恒等', () => {
    expect(isIdentityCurve([{ x: 0, y: 0 }, { x: 128, y: 160 }, { x: 255, y: 255 }])).toBe(false);
  });

  it('端点被挪动就不是恒等', () => {
    expect(isIdentityCurve([{ x: 0, y: 20 }, { x: 255, y: 255 }])).toBe(false);
  });
});

describe('normalizePoints', () => {
  it('按 x 排序', () => {
    const out = normalizePoints([
      { x: 200, y: 200 },
      { x: 50, y: 60 },
      { x: 128, y: 128 },
    ]);
    expect(out.map((p) => p.x)).toEqual([50, 128, 200]);
  });

  it('同一个 x 只留一个', () => {
    const out = normalizePoints([
      { x: 100, y: 50 },
      { x: 100, y: 200 },
    ]);
    expect(out.length).toBe(1);
  });

  it('空数组安全', () => {
    expect(normalizePoints([])).toEqual([]);
  });

  it('不改原数组', () => {
    const input: CurvePoint[] = [{ x: 200, y: 1 }, { x: 10, y: 2 }];
    normalizePoints(input);
    expect(input[0].x).toBe(200);
  });
});

describe('buildCurveLut', () => {
  it('对角线得到恒等表', () => {
    const lut = buildCurveLut(defaultCurve());
    for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i);
  });

  it('空点集退回恒等', () => {
    const lut = buildCurveLut([]);
    expect(lut[0]).toBe(0);
    expect(lut[128]).toBe(128);
    expect(lut[255]).toBe(255);
  });

  it('单个点得到常量表', () => {
    const lut = buildCurveLut([{ x: 128, y: 200 }]);
    for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(200);
  });

  it('端点值被精确命中', () => {
    const lut = buildCurveLut([
      { x: 0, y: 10 },
      { x: 255, y: 240 },
    ]);
    expect(lut[0]).toBe(10);
    expect(lut[255]).toBe(240);
  });

  it('中间控制点被精确命中', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ]);
    expect(lut[128]).toBe(200);
  });

  it('提亮曲线整体抬高', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 128, y: 180 },
      { x: 255, y: 255 },
    ]);
    expect(lut[64]).toBeGreaterThan(64);
    expect(lut[192]).toBeGreaterThan(192);
  });

  it('压暗曲线整体降低', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 128, y: 80 },
      { x: 255, y: 255 },
    ]);
    expect(lut[64]).toBeLessThan(64);
    expect(lut[128]).toBe(80);
  });

  it('反相曲线', () => {
    const lut = buildCurveLut([
      { x: 0, y: 255 },
      { x: 255, y: 0 },
    ]);
    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
    expect(lut[128]).toBeCloseTo(127, -1);
  });

  it('单调递增的控制点产生单调递增的表（不过冲）', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 32, y: 120 },
      { x: 64, y: 130 },
      { x: 255, y: 255 },
    ]);
    for (let i = 1; i < 256; i += 1) {
      expect(lut[i], `i=${i}`).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it('陡缓交界处不冲出控制点范围', () => {
    // 这组点用普通 Catmull-Rom 会在 x=64 之后先掉下去
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 64, y: 200 },
      { x: 128, y: 205 },
      { x: 255, y: 255 },
    ]);
    for (let i = 64; i <= 128; i += 1) {
      expect(lut[i], `i=${i} 掉出了 [200,205]`).toBeGreaterThanOrEqual(200);
      expect(lut[i]).toBeLessThanOrEqual(205);
    }
  });

  it('端点之外保持水平不外推', () => {
    const lut = buildCurveLut([
      { x: 50, y: 60 },
      { x: 200, y: 220 },
    ]);
    expect(lut[0]).toBe(60);
    expect(lut[49]).toBe(60);
    expect(lut[201]).toBe(220);
    expect(lut[255]).toBe(220);
  });

  it('结果全部落在 0..255', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 20, y: 250 },
      { x: 40, y: 5 },
      { x: 255, y: 255 },
    ]);
    for (let i = 0; i < 256; i += 1) {
      expect(lut[i]).toBeGreaterThanOrEqual(0);
      expect(lut[i]).toBeLessThanOrEqual(255);
    }
  });

  it('任意控制点组合都不产生 NaN', () => {
    const cases: CurvePoint[][] = [
      [{ x: 0, y: 0 }, { x: 0, y: 255 }],
      [{ x: 128, y: 128 }, { x: 128, y: 0 }],
      [{ x: 0, y: 0 }, { x: 1, y: 255 }, { x: 255, y: 255 }],
      [{ x: 0, y: 255 }, { x: 127, y: 0 }, { x: 128, y: 255 }, { x: 255, y: 0 }],
    ];
    for (const points of cases) {
      const lut = buildCurveLut(points);
      for (let i = 0; i < 256; i += 1) {
        expect(Number.isNaN(lut[i]), `${JSON.stringify(points)} i=${i}`).toBe(false);
      }
    }
  });

  it('相邻点 x 差 1 时不崩', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 127, y: 100 },
      { x: 128, y: 200 },
      { x: 255, y: 255 },
    ]);
    expect(Number.isFinite(lut[127])).toBe(true);
    expect(lut[127]).toBe(100);
    expect(lut[128]).toBe(200);
  });

  it('水平段保持常量', () => {
    const lut = buildCurveLut([
      { x: 0, y: 0 },
      { x: 64, y: 128 },
      { x: 192, y: 128 },
      { x: 255, y: 255 },
    ]);
    for (let i = 64; i <= 192; i += 1) expect(lut[i]).toBe(128);
  });
});

describe('applyCurves', () => {
  it('默认曲线不改像素', () => {
    const image = solid(100, 150, 200);
    applyCurves(image, defaultCurves());
    expect(Array.from(image.data).slice(0, 3)).toEqual([100, 150, 200]);
  });

  it('复合通道作用在三个通道', () => {
    const image = solid(128, 128, 128);
    const params = defaultCurves();
    params.rgb = [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    expect(Array.from(image.data).slice(0, 3)).toEqual([200, 200, 200]);
  });

  it('单通道只影响自己', () => {
    const image = solid(128, 128, 128);
    const params = defaultCurves();
    params.g = [{ x: 0, y: 0 }, { x: 128, y: 60 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    const [r, g, b] = Array.from(image.data);
    expect(r).toBe(128);
    expect(g).toBe(60);
    expect(b).toBe(128);
  });

  it('单通道与复合通道按顺序叠加', () => {
    const image = solid(128, 128, 128);
    const params = defaultCurves();
    // 单通道先把 128 打到 64，复合通道再把 64 打到 100
    params.r = [{ x: 0, y: 0 }, { x: 128, y: 64 }, { x: 255, y: 255 }];
    params.rgb = [{ x: 0, y: 0 }, { x: 64, y: 100 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    expect(image.data[0]).toBe(100);
  });

  it('不碰 alpha', () => {
    const image = solid(128, 128, 128, 77);
    const params = defaultCurves();
    params.rgb = [{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    expect(image.data[3]).toBe(77);
  });

  it('全透明像素跳过', () => {
    const image = solid(0, 0, 0, 0);
    const params = defaultCurves();
    params.rgb = [{ x: 0, y: 200 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    // solid() 默认 2×2，所以是 16 字节全 0
    expect(Array.from(image.data)).toEqual(Array(16).fill(0));
  });

  it('结果不含 NaN', () => {
    const image = solid(37, 128, 233);
    const params = defaultCurves();
    params.rgb = [{ x: 0, y: 10 }, { x: 90, y: 200 }, { x: 91, y: 30 }, { x: 255, y: 250 }];
    applyCurves(image, params);
    for (const v of image.data) expect(Number.isNaN(v)).toBe(false);
  });

  it('1×1 画布能处理', () => {
    const image = solid(128, 128, 128, 255, 1);
    const params = defaultCurves();
    params.rgb = [{ x: 0, y: 0 }, { x: 128, y: 64 }, { x: 255, y: 255 }];
    applyCurves(image, params);
    expect(image.data[0]).toBe(64);
  });
});
