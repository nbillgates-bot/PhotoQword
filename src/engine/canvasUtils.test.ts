/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clamp,
  clearCanvas,
  cloneCanvas,
  createCanvas,
  createImageData,
  createReadbackCanvas,
  cropCanvas,
  ctx2d,
  ctx2dReadback,
  fillCanvas,
  recanvas,
  resizeCanvas,
  uid,
} from './canvasUtils';
import { recordContextOptions } from './testUtils';

/** 跑一段代码，返回首次取 2D 上下文时是否声明了 willReadFrequently */
function firstReadback(run: () => unknown): boolean | undefined {
  return recordContextOptions(run).options[0]?.willReadFrequently;
}

/** 读某点像素，返回 [r,g,b,a] */
function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

describe('createReadbackCanvas', () => {
  it('创建时就把 willReadFrequently 定下来，且是第一次 getContext', () => {
    const { options } = recordContextOptions(() => createReadbackCanvas(4, 4));
    expect(options.length).toBeGreaterThan(0);
    expect(options[0]?.willReadFrequently).toBe(true);
  });

  it('尺寸按传入值设置', () => {
    const canvas = createReadbackCanvas(7, 3);
    expect([canvas.width, canvas.height]).toEqual([7, 3]);
  });

  it('宽高为 1 的画布也能建出来并读回像素', () => {
    const canvas = createReadbackCanvas(1, 1);
    fillCanvas(canvas, '#ff0000');
    expect(px(canvas, 0, 0)).toEqual([255, 0, 0, 255]);
  });
});

describe('createCanvas', () => {
  it('不预先建上下文，留给调用方决定选项', () => {
    const { options } = recordContextOptions(() => createCanvas(4, 4));
    // 屏幕主画布之外的普通离屏画布不该被强制加 readback 标记
    expect(options).toEqual([]);
  });
});

describe('ctx2dReadback', () => {
  it('把 willReadFrequently 传给 getContext', () => {
    const canvas = createCanvas(2, 2);
    expect(firstReadback(() => ctx2dReadback(canvas))).toBe(true);
  });

  it('返回的上下文可用', () => {
    const canvas = createCanvas(2, 2);
    expect(ctx2dReadback(canvas).canvas).toBe(canvas);
  });
});

describe('ctx2d', () => {
  it('拿不到上下文时抛错而不是返回 null', () => {
    const canvas = createCanvas(2, 2);
    vi.spyOn(canvas, 'getContext').mockReturnValue(null);
    expect(() => ctx2d(canvas)).toThrow('无法获取 2D 绘图上下文');
  });
});

/**
 * 这四个都是「先 drawImage 填内容，之后才被历史差分读回」的派生画布。
 * 它们必须在创建时就声明 readback：等 getImageData 时再补声明是无效的。
 */
describe('派生画布在创建时声明 readback', () => {
  const source = () => {
    const canvas = createCanvas(4, 4);
    fillCanvas(canvas, '#00ff00');
    return canvas;
  };

  it('cloneCanvas', () => {
    const from = source();
    const { result, options } = recordContextOptions(() => cloneCanvas(from));
    expect(options[0]?.willReadFrequently).toBe(true);
    expect([result.width, result.height]).toEqual([4, 4]);
    expect(px(result, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it('resizeCanvas', () => {
    const from = source();
    const { result, options } = recordContextOptions(() => resizeCanvas(from, 2, 2));
    expect(options[0]?.willReadFrequently).toBe(true);
    expect([result.width, result.height]).toEqual([2, 2]);
  });

  it('recanvas', () => {
    const from = source();
    const { result, options } = recordContextOptions(() => recanvas(from, 8, 8, 2, 2));
    expect(options[0]?.willReadFrequently).toBe(true);
    expect([result.width, result.height]).toEqual([8, 8]);
  });

  it('cropCanvas', () => {
    const from = source();
    const { result, options } = recordContextOptions(() =>
      cropCanvas(from, { x: 1, y: 1, width: 2, height: 2 }),
    );
    expect(options[0]?.willReadFrequently).toBe(true);
    expect([result.width, result.height]).toEqual([2, 2]);
  });
});

describe('fillCanvas / clearCanvas', () => {
  it('fillCanvas 铺满整张画布', () => {
    const canvas = createCanvas(3, 3);
    fillCanvas(canvas, '#0000ff');
    expect(px(canvas, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(px(canvas, 2, 2)).toEqual([0, 0, 255, 255]);
  });

  it('clearCanvas 清成全透明', () => {
    const canvas = createCanvas(3, 3);
    fillCanvas(canvas, '#0000ff');
    clearCanvas(canvas);
    expect(px(canvas, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});

describe('createImageData', () => {
  it('全透明，且不含 NaN', () => {
    const data = createImageData(2, 2);
    expect([data.width, data.height]).toEqual([2, 2]);
    expect(data.data.length).toBe(16);
    expect([...data.data].every((value) => Number.isFinite(value) && value === 0)).toBe(true);
  });

  it('1x1 也成立', () => {
    expect(createImageData(1, 1).data.length).toBe(4);
  });
});

describe('clamp', () => {
  it('夹在区间内', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });

  it('边界与小数', () => {
    expect(clamp(0, 0, 1)).toBe(0);
    expect(clamp(1, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
    expect(clamp(0.001, 0, 1)).toBe(0.001);
  });
});

describe('uid', () => {
  it('带前缀且不重复', () => {
    const a = uid('layer');
    const b = uid('layer');
    expect(a.startsWith('layer')).toBe(true);
    expect(a).not.toBe(b);
  });
});
