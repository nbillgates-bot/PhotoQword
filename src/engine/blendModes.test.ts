/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  blendCanvas,
  blendImageData,
  isNativeBlend,
  isSupportedBlend,
  nativeOperation,
} from './blendModes';
import { createCanvas, ctx2d } from './canvasUtils';
import { BLEND_MODES, type BlendMode } from '../types';

/**
 * 造一张单像素 ImageData，颜色用 0..255。
 * 走 createImageData 而不是 new ImageData()：带参构造在部分环境
 * （含本项目的测试环境）拿不到，规约第三节也点了这个坑。
 */
function px(r: number, g: number, b: number, a = 255): ImageData {
  const image = ctx2d(createCanvas(1, 1)).createImageData(1, 1);
  image.data[0] = r;
  image.data[1] = g;
  image.data[2] = b;
  image.data[3] = a;
  return image;
}

/** 混一次并读回底色的 RGBA */
function mix(
  backdrop: [number, number, number, number?],
  source: [number, number, number, number?],
  mode: BlendMode,
  opacity = 1,
): number[] {
  const back = px(...backdrop);
  blendImageData(back, px(...source), mode, opacity);
  return Array.from(back.data);
}

describe('模式表', () => {
  it('BLEND_MODES 里的每个模式都有实现', () => {
    for (const { value, label } of BLEND_MODES) {
      expect(isSupportedBlend(value), `${label}(${value}) 没有实现`).toBe(true);
    }
  });

  it('6 个 PS 特有模式走手写路径', () => {
    const custom: BlendMode[] = [
      'linear-burn',
      'linear-dodge',
      'vivid-light',
      'linear-light',
      'pin-light',
      'hard-mix',
    ];
    for (const mode of custom) {
      expect(isNativeBlend(mode), `${mode} 不该走原生`).toBe(false);
      expect(isSupportedBlend(mode)).toBe(true);
    }
  });

  it('canvas 原生模式不走手写路径', () => {
    const native: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'luminosity'];
    for (const mode of native) {
      expect(isNativeBlend(mode), `${mode} 该走原生`).toBe(true);
    }
  });

  it('normal 映射成 source-over', () => {
    expect(nativeOperation('normal')).toBe('source-over');
  });

  it('原生模式的映射值与自身同名', () => {
    expect(nativeOperation('multiply')).toBe('multiply');
    expect(nativeOperation('color-dodge')).toBe('color-dodge');
  });

  it('每个模式都有中文标签且不重复', () => {
    const labels = BLEND_MODES.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.length).toBeGreaterThan(0);
  });
});

describe('线性加深', () => {
  it('公式是 b + s - 1', () => {
    // 200/255 + 100/255 - 1 ≈ 0.176 → 45
    expect(mix([200, 200, 200], [100, 100, 100], 'linear-burn')[0]).toBe(45);
  });

  it('白色上色不改底色', () => {
    expect(mix([128, 64, 200], [255, 255, 255], 'linear-burn').slice(0, 3))
      .toEqual([128, 64, 200]);
  });

  it('黑色上色压成全黑', () => {
    expect(mix([200, 200, 200], [0, 0, 0], 'linear-burn').slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('加起来不足 1 时夹到 0，不出负值', () => {
    const out = mix([40, 40, 40], [40, 40, 40], 'linear-burn');
    expect(out[0]).toBe(0);
    expect(out[0]).toBeGreaterThanOrEqual(0);
  });
});

describe('线性减淡', () => {
  it('公式是 b + s', () => {
    expect(mix([100, 100, 100], [50, 50, 50], 'linear-dodge')[0]).toBe(150);
  });

  it('黑色上色不改底色', () => {
    expect(mix([128, 64, 200], [0, 0, 0], 'linear-dodge').slice(0, 3))
      .toEqual([128, 64, 200]);
  });

  it('超过 1 时夹到白，不溢出', () => {
    const out = mix([200, 200, 200], [200, 200, 200], 'linear-dodge');
    expect(out[0]).toBe(255);
    expect(out[0]).toBeLessThanOrEqual(255);
  });

  it('与线性加深互补：dodge(b,s) = 1 - burn(1-b,1-s)', () => {
    const dodge = mix([128, 128, 128], [64, 64, 64], 'linear-dodge')[0];
    const burn = mix([127, 127, 127], [191, 191, 191], 'linear-burn')[0];
    expect(dodge).toBe(255 - burn);
  });
});

describe('亮光', () => {
  it('中灰上色基本不改底色', () => {
    // s = 0.5 是分界点，两侧公式在此汇合
    const out = mix([128, 128, 128], [128, 128, 128], 'vivid-light')[0];
    expect(out).toBeGreaterThan(120);
    expect(out).toBeLessThan(136);
  });

  it('暗于中灰时加深', () => {
    const out = mix([128, 128, 128], [64, 64, 64], 'vivid-light')[0];
    expect(out).toBeLessThan(128);
  });

  it('亮于中灰时减淡', () => {
    const out = mix([128, 128, 128], [192, 192, 192], 'vivid-light')[0];
    expect(out).toBeGreaterThan(128);
  });

  it('纯黑上色得全黑，不出 NaN', () => {
    const out = mix([128, 128, 128], [0, 0, 0], 'vivid-light');
    expect(out[0]).toBe(0);
    expect(Number.isNaN(out[0])).toBe(false);
  });

  it('纯白上色得全白，不出 NaN（除零边界）', () => {
    const out = mix([128, 128, 128], [255, 255, 255], 'vivid-light');
    expect(out[0]).toBe(255);
    expect(Number.isNaN(out[0])).toBe(false);
  });
});

describe('线性光', () => {
  it('公式是 b + 2s - 1', () => {
    // 128/255 + 2*(160/255) - 1 ≈ 0.757 → 193
    expect(mix([128, 128, 128], [160, 160, 160], 'linear-light')[0]).toBe(193);
  });

  it('中灰上色不改底色', () => {
    const out = mix([100, 100, 100], [128, 128, 128], 'linear-light')[0];
    expect(Math.abs(out - 100)).toBeLessThanOrEqual(1);
  });

  it('两端都夹住', () => {
    expect(mix([200, 200, 200], [255, 255, 255], 'linear-light')[0]).toBe(255);
    expect(mix([50, 50, 50], [0, 0, 0], 'linear-light')[0]).toBe(0);
  });
});

describe('点光', () => {
  it('上色偏暗时取较小值', () => {
    // s=0.25 → 2s=0.5(128)，底色 200 更大，取 128
    expect(mix([200, 200, 200], [64, 64, 64], 'pin-light')[0]).toBe(128);
  });

  it('上色偏亮时取较大值', () => {
    // s=191/255 → 2s-1≈0.498(127)，底色 50 更小，取 127
    expect(mix([50, 50, 50], [191, 191, 191], 'pin-light')[0]).toBe(127);
  });

  it('中灰上色不改底色', () => {
    const out = mix([90, 90, 90], [128, 128, 128], 'pin-light')[0];
    expect(Math.abs(out - 90)).toBeLessThanOrEqual(2);
  });
});

describe('实色混合', () => {
  it('结果只有 0 和 255', () => {
    const samples = [0, 40, 100, 128, 180, 255];
    for (const b of samples) {
      for (const s of samples) {
        const out = mix([b, b, b], [s, s, s], 'hard-mix')[0];
        expect([0, 255], `b=${b} s=${s} 得到 ${out}`).toContain(out);
      }
    }
  });

  it('亮色组合出白', () => {
    expect(mix([200, 200, 200], [200, 200, 200], 'hard-mix')[0]).toBe(255);
  });

  it('暗色组合出黑', () => {
    expect(mix([40, 40, 40], [40, 40, 40], 'hard-mix')[0]).toBe(0);
  });

  it('逐通道独立判定，能出纯色', () => {
    const out = mix([255, 0, 128], [200, 40, 200], 'hard-mix');
    expect(out[0]).toBe(255);
    expect(out[1]).toBe(0);
  });
});

describe('alpha 与不透明度', () => {
  it('上层全透明时底色不变', () => {
    expect(mix([128, 64, 32, 255], [255, 255, 255, 0], 'linear-dodge').slice(0, 3))
      .toEqual([128, 64, 32]);
  });

  it('opacity 为 0 等于不混', () => {
    expect(mix([128, 64, 32], [255, 255, 255], 'linear-dodge', 0).slice(0, 3))
      .toEqual([128, 64, 32]);
  });

  it('opacity 为 1 是全量混合', () => {
    expect(mix([100, 100, 100], [50, 50, 50], 'linear-dodge', 1)[0]).toBe(150);
  });

  it('opacity 居中时结果落在两端之间', () => {
    const half = mix([100, 100, 100], [50, 50, 50], 'linear-dodge', 0.5)[0];
    expect(half).toBeGreaterThan(100);
    expect(half).toBeLessThan(150);
  });

  it('底色透明时结果 alpha 取上层', () => {
    const out = mix([0, 0, 0, 0], [200, 200, 200, 255], 'linear-dodge');
    expect(out[3]).toBe(255);
  });

  it('半透明上层混出中间 alpha', () => {
    const out = mix([0, 0, 0, 0], [200, 200, 200, 128], 'linear-dodge');
    expect(out[3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(255);
  });

  it('双方全透明时结果仍是全透明', () => {
    const out = mix([0, 0, 0, 0], [0, 0, 0, 0], 'linear-dodge');
    expect(out[3]).toBe(0);
  });
});

describe('原生模式不被手写路径处理', () => {
  it('传原生模式时 blendImageData 是空操作', () => {
    const back = px(100, 100, 100);
    blendImageData(back, px(200, 200, 200), 'multiply');
    // multiply 走原生，这里不该动像素
    expect(Array.from(back.data).slice(0, 3)).toEqual([100, 100, 100]);
  });
});

describe('像素完整性', () => {
  it('所有手写模式都不产生 NaN', () => {
    const modes: BlendMode[] = [
      'linear-burn',
      'linear-dodge',
      'vivid-light',
      'linear-light',
      'pin-light',
      'hard-mix',
    ];
    const samples = [0, 1, 127, 128, 254, 255];

    for (const mode of modes) {
      for (const b of samples) {
        for (const s of samples) {
          const out = mix([b, b, b], [s, s, s], mode);
          for (const channel of out) {
            expect(Number.isNaN(channel), `${mode} b=${b} s=${s} 出现 NaN`).toBe(false);
          }
        }
      }
    }
  });

  it('结果始终在 0..255', () => {
    const modes: BlendMode[] = ['linear-burn', 'linear-dodge', 'linear-light', 'vivid-light'];
    for (const mode of modes) {
      for (const b of [0, 128, 255]) {
        for (const s of [0, 128, 255]) {
          for (const channel of mix([b, b, b], [s, s, s], mode)) {
            expect(channel).toBeGreaterThanOrEqual(0);
            expect(channel).toBeLessThanOrEqual(255);
          }
        }
      }
    }
  });
});

describe('blendCanvas', () => {
  it('返回新画布，不改原底图', () => {
    const backdrop = createCanvas(4, 4);
    const bc = ctx2d(backdrop);
    bc.fillStyle = '#646464';
    bc.fillRect(0, 0, 4, 4);

    const source = createCanvas(4, 4);
    const sc = ctx2d(source);
    sc.fillStyle = '#323232';
    sc.fillRect(0, 0, 4, 4);

    const out = blendCanvas(backdrop, source, 'linear-dodge');
    expect(out).not.toBe(backdrop);
    // 原底图保持 0x64
    expect(ctx2d(backdrop).getImageData(0, 0, 1, 1).data[0]).toBe(0x64);
    // 结果是 0x64 + 0x32
    expect(ctx2d(out).getImageData(0, 0, 1, 1).data[0]).toBe(0x96);
  });

  it('尺寸与底图一致', () => {
    const out = blendCanvas(createCanvas(7, 3), createCanvas(7, 3), 'linear-dodge');
    expect(out.width).toBe(7);
    expect(out.height).toBe(3);
  });

  it('1×1 画布能处理', () => {
    const backdrop = createCanvas(1, 1);
    ctx2d(backdrop).fillStyle = '#ffffff';
    ctx2d(backdrop).fillRect(0, 0, 1, 1);
    const out = blendCanvas(backdrop, createCanvas(1, 1), 'linear-burn');
    expect(out.width).toBe(1);
  });
});

