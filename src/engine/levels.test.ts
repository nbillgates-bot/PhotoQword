/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  applyLevels,
  autoLevels,
  buildLut,
  DEFAULT_CHANNEL,
  defaultLevels,
  histogram,
  isIdentity,
  type LevelsChannel,
} from './levels';
import { createCanvas, ctx2d } from './canvasUtils';

/** 造一张纯色图，边长可指定 */
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

/** 造一张灰阶渐变，像素值就是索引 */
function ramp(): ImageData {
  const context = ctx2d(createCanvas(256, 1));
  const image = context.createImageData(256, 1);
  for (let i = 0; i < 256; i += 1) {
    const o = i * 4;
    image.data[o] = i;
    image.data[o + 1] = i;
    image.data[o + 2] = i;
    image.data[o + 3] = 255;
  }
  return image;
}

function channel(over: Partial<LevelsChannel> = {}): LevelsChannel {
  return { ...DEFAULT_CHANNEL, ...over };
}

describe('isIdentity', () => {
  it('默认值是恒等', () => {
    expect(isIdentity(DEFAULT_CHANNEL)).toBe(true);
  });

  it('任一项变了就不是恒等', () => {
    expect(isIdentity(channel({ inBlack: 10 }))).toBe(false);
    expect(isIdentity(channel({ inWhite: 200 }))).toBe(false);
    expect(isIdentity(channel({ gamma: 1.2 }))).toBe(false);
    expect(isIdentity(channel({ outBlack: 5 }))).toBe(false);
    expect(isIdentity(channel({ outWhite: 250 }))).toBe(false);
  });
});

describe('buildLut', () => {
  it('默认参数得到恒等表', () => {
    const lut = buildLut(DEFAULT_CHANNEL);
    for (let i = 0; i < 256; i += 1) expect(lut[i]).toBe(i);
  });

  it('输入黑场把暗部压到 0', () => {
    const lut = buildLut(channel({ inBlack: 50 }));
    expect(lut[0]).toBe(0);
    expect(lut[50]).toBe(0);
    expect(lut[51]).toBeGreaterThan(0);
  });

  it('输入白场把亮部提到 255', () => {
    const lut = buildLut(channel({ inWhite: 200 }));
    expect(lut[200]).toBe(255);
    expect(lut[255]).toBe(255);
    expect(lut[199]).toBeLessThan(255);
  });

  it('输入范围收窄后对比增强', () => {
    const lut = buildLut(channel({ inBlack: 64, inWhite: 192 }));
    expect(lut[64]).toBe(0);
    expect(lut[192]).toBe(255);
    // 中点仍在中间
    expect(lut[128]).toBeGreaterThan(120);
    expect(lut[128]).toBeLessThan(136);
  });

  it('gamma 大于 1 提亮中间调', () => {
    const lut = buildLut(channel({ gamma: 2 }));
    expect(lut[128]).toBeGreaterThan(128);
    // 端点不动
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it('gamma 小于 1 压暗中间调', () => {
    const lut = buildLut(channel({ gamma: 0.5 }));
    expect(lut[128]).toBeLessThan(128);
    expect(lut[0]).toBe(0);
    expect(lut[255]).toBe(255);
  });

  it('输出范围限制结果的上下限', () => {
    const lut = buildLut(channel({ outBlack: 30, outWhite: 220 }));
    expect(lut[0]).toBe(30);
    expect(lut[255]).toBe(220);
  });

  it('输出反转（黑白场对调）得到反相', () => {
    const lut = buildLut(channel({ outBlack: 255, outWhite: 0 }));
    expect(lut[0]).toBe(255);
    expect(lut[255]).toBe(0);
  });

  it('查找表单调不递减', () => {
    const lut = buildLut(channel({ inBlack: 20, inWhite: 230, gamma: 1.4 }));
    for (let i = 1; i < 256; i += 1) {
      expect(lut[i]).toBeGreaterThanOrEqual(lut[i - 1]);
    }
  });

  it('输入黑白场相等时不产生 NaN（除零边界）', () => {
    const lut = buildLut(channel({ inBlack: 128, inWhite: 128 }));
    for (let i = 0; i < 256; i += 1) {
      expect(Number.isNaN(lut[i])).toBe(false);
    }
    expect(lut[100]).toBe(0);
    expect(lut[200]).toBe(255);
  });

  it('白场小于黑场时也不崩', () => {
    const lut = buildLut(channel({ inBlack: 200, inWhite: 50 }));
    expect(Number.isNaN(lut[128])).toBe(false);
  });

  it('gamma 为 0 时退化成 1，不产生 Infinity', () => {
    const lut = buildLut(channel({ gamma: 0 }));
    for (let i = 0; i < 256; i += 1) {
      expect(Number.isFinite(lut[i])).toBe(true);
    }
    expect(lut[128]).toBe(128);
  });
});

describe('applyLevels', () => {
  it('默认参数不改像素', () => {
    const image = solid(100, 150, 200);
    applyLevels(image, defaultLevels());
    expect(Array.from(image.data).slice(0, 3)).toEqual([100, 150, 200]);
  });

  it('复合通道作用在三个通道上', () => {
    const image = solid(100, 100, 100);
    const params = defaultLevels();
    params.rgb = channel({ gamma: 2 });
    applyLevels(image, params);
    const [r, g, b] = Array.from(image.data);
    expect(r).toBeGreaterThan(100);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('单通道只影响自己', () => {
    const image = solid(100, 100, 100);
    const params = defaultLevels();
    params.r = channel({ gamma: 2 });
    applyLevels(image, params);
    const [r, g, b] = Array.from(image.data);
    expect(r).toBeGreaterThan(100);
    expect(g).toBe(100);
    expect(b).toBe(100);
  });

  it('单通道与复合通道叠加', () => {
    const onlyR = solid(100, 100, 100);
    const paramsR = defaultLevels();
    paramsR.r = channel({ gamma: 2 });
    applyLevels(onlyR, paramsR);

    const both = solid(100, 100, 100);
    const paramsBoth = defaultLevels();
    paramsBoth.r = channel({ gamma: 2 });
    paramsBoth.rgb = channel({ gamma: 2 });
    applyLevels(both, paramsBoth);

    // 叠加后 R 应当比只调单通道更亮
    expect(both.data[0]).toBeGreaterThan(onlyR.data[0]);
  });

  it('不碰 alpha 通道', () => {
    const image = solid(100, 100, 100, 128);
    const params = defaultLevels();
    params.rgb = channel({ gamma: 2 });
    applyLevels(image, params);
    expect(image.data[3]).toBe(128);
  });

  it('全透明像素跳过,不给透明区染色', () => {
    const image = solid(0, 0, 0, 0);
    const params = defaultLevels();
    params.rgb = channel({ outBlack: 200 });
    applyLevels(image, params);
    // solid() 默认 2×2，所以是 16 字节全 0
    expect(Array.from(image.data)).toEqual(Array(16).fill(0));
  });

  it('结果不含 NaN', () => {
    const image = ramp();
    const params = defaultLevels();
    params.rgb = channel({ inBlack: 30, inWhite: 220, gamma: 1.5 });
    params.r = channel({ gamma: 0.8 });
    applyLevels(image, params);
    for (const v of image.data) expect(Number.isNaN(v)).toBe(false);
  });

  it('1×1 画布能处理', () => {
    const image = solid(128, 128, 128, 255, 1);
    const params = defaultLevels();
    params.rgb = channel({ gamma: 2 });
    expect(() => applyLevels(image, params)).not.toThrow();
    expect(image.data[0]).toBeGreaterThan(128);
  });
});

describe('histogram', () => {
  it('纯色图只在一个格子里计数', () => {
    const hist = histogram(solid(100, 100, 100, 255, 4));
    expect(hist.r[100]).toBe(16);
    expect(hist.r[99]).toBe(0);
  });

  it('三个通道分别统计', () => {
    const hist = histogram(solid(10, 20, 30, 255, 2));
    expect(hist.r[10]).toBe(4);
    expect(hist.g[20]).toBe(4);
    expect(hist.b[30]).toBe(4);
  });

  it('渐变图每级各一个', () => {
    const hist = histogram(ramp());
    for (let i = 0; i < 256; i += 1) expect(hist.r[i]).toBe(1);
  });

  it('明度用与灰度一致的权重', () => {
    const hist = histogram(solid(255, 0, 0, 255, 1));
    // 0.299 * 255 ≈ 76
    expect(hist.luma[76]).toBe(1);
  });

  it('透明像素不计入', () => {
    const hist = histogram(solid(100, 100, 100, 0, 4));
    expect(hist.r.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('总数等于不透明像素数', () => {
    const hist = histogram(solid(50, 50, 50, 255, 3));
    expect(hist.r.reduce((a, b) => a + b, 0)).toBe(9);
  });
});

describe('autoLevels', () => {
  it('把实际范围拉满', () => {
    // 造一张只用了 64..192 的图
    const context = ctx2d(createCanvas(129, 1));
    const image = context.createImageData(129, 1);
    for (let i = 0; i <= 128; i += 1) {
      const o = i * 4;
      const v = 64 + i;
      image.data[o] = v;
      image.data[o + 1] = v;
      image.data[o + 2] = v;
      image.data[o + 3] = 255;
    }
    const params = autoLevels(image, 0);
    expect(params.r.inBlack).toBe(64);
    expect(params.r.inWhite).toBe(192);
  });

  it('裁剪比例会往里收范围', () => {
    const loose = autoLevels(ramp(), 0);
    const tight = autoLevels(ramp(), 10);
    expect(tight.r.inBlack).toBeGreaterThan(loose.r.inBlack);
    expect(tight.r.inWhite).toBeLessThan(loose.r.inWhite);
  });

  it('复合通道保持默认，只动单通道', () => {
    const params = autoLevels(ramp(), 0);
    expect(isIdentity(params.rgb)).toBe(true);
  });

  it('纯色图不产生反常范围', () => {
    const params = autoLevels(solid(128, 128, 128, 255, 4), 0);
    expect(params.r.inWhite).toBeGreaterThan(params.r.inBlack);
  });

  it('全透明图退回满量程', () => {
    const params = autoLevels(solid(0, 0, 0, 0, 4), 0);
    expect(params.r.inBlack).toBe(0);
    expect(params.r.inWhite).toBe(255);
  });

  it('结果可直接用于 applyLevels 且不产生 NaN', () => {
    const image = ramp();
    const params = autoLevels(image, 0.1);
    applyLevels(image, params);
    for (const v of image.data) expect(Number.isNaN(v)).toBe(false);
  });
});
