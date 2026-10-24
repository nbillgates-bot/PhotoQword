/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { DEFAULT_DROP_SHADOW, DEFAULT_STROKE } from '../types/effects';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { flatten } from './compositor';

const W = 40;
const H = 40;

/** 中央 20x20 方块的图层 */
function squareLayer(id: string, color: string, extra: Partial<Layer> = {}): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(10, 10, 20, 20);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas),
    parentId: null,
    ...extra,
  };
}

function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

function hasNaN(canvas: HTMLCanvasElement): boolean {
  const image = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return [...image.data].some((value) => Number.isNaN(value));
}

describe('合成图层样式', () => {
  it('没有 effects 时合成结果与原来一致', () => {
    const layer = squareLayer('a', '#ff0000');
    const output = flatten([layer], W, H);
    // 方块内是红的，方块外全透明
    expect(px(output, 20, 20)).toEqual([255, 0, 0, 255]);
    expect(px(output, 2, 2)[3]).toBe(0);
  });

  it('描边效果画在图层形状之外', () => {
    const layer = squareLayer('a', '#ff0000', {
      effects: {
        stroke: { ...DEFAULT_STROKE, position: 'outside', size: 4, color: '#00ff00' },
      },
    });
    const output = flatten([layer], W, H);

    // 形状内部仍是红色，描边不该覆盖图层本身
    expect(px(output, 20, 20)[0]).toBeGreaterThan(200);
    expect(px(output, 20, 20)[1]).toBeLessThan(60);

    // 边界外 x=8 该是绿色描边
    const [r, g, , a] = px(output, 8, 20);
    expect(a).toBeGreaterThan(0);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
  });

  it('禁用的效果不参与合成', () => {
    const layer = squareLayer('a', '#ff0000', {
      effects: {
        stroke: { ...DEFAULT_STROKE, enabled: false, position: 'outside', size: 4, color: '#00ff00' },
      },
    });
    const output = flatten([layer], W, H);
    // enabled 为 false，边界外应当仍是空的
    expect(px(output, 8, 20)[3]).toBe(0);
  });

  it('投影画在图层下方而不是盖住图层', () => {
    const layer = squareLayer('a', '#ff0000', {
      effects: {
        dropShadow: {
          ...DEFAULT_DROP_SHADOW,
          angle: 0,
          distance: 8,
          size: 0,
          spread: 0,
          color: '#000000',
          opacity: 100,
          blendMode: 'normal',
        },
      },
    });
    const output = flatten([layer], W, H);

    // 图层本身仍然是红色（投影在它下面，没盖住）
    expect(px(output, 20, 20)[0]).toBeGreaterThan(200);
    // 方块 10-30，影子偏移 +8 => 覆盖 18-38，x=34 处只有影子
    const shadowOnly = px(output, 34, 20);
    expect(shadowOnly[3]).toBeGreaterThan(0);
    expect(shadowOnly[0]).toBeLessThan(60);
  });

  it('效果合成不产生 NaN', () => {
    const layer = squareLayer('a', '#ff0000', {
      effects: {
        dropShadow: DEFAULT_DROP_SHADOW,
        stroke: DEFAULT_STROKE,
      },
    });
    expect(hasNaN(flatten([layer], W, H))).toBe(false);
  });

  it('图层不可见时效果也不画', () => {
    const layer = squareLayer('a', '#ff0000', {
      visible: false,
      effects: { stroke: { ...DEFAULT_STROKE, position: 'outside', size: 4 } },
    });
    const output = flatten([layer], W, H);
    // 整幅应该全透明
    expect(px(output, 8, 20)[3]).toBe(0);
    expect(px(output, 20, 20)[3]).toBe(0);
  });

  it('效果跟随蒙版裁剪后的形状', () => {
    const mask = createCanvas(W, H);
    const maskCtx = ctx2d(mask);
    // 全黑=全隐藏，只在左半边开一个白窗
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, W, H);
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillRect(0, 0, 20, H);

    const layer = squareLayer('a', '#ff0000', {
      mask,
      effects: {
        stroke: { ...DEFAULT_STROKE, position: 'outside', size: 3, color: '#00ff00' },
      },
    });
    const output = flatten([layer], W, H);

    /*
     * 蒙版把方块右半边遮掉了，所以形状变成 10-20 的竖条。
     * 描边应该出现在 x=22 附近（新的右边界外），
     * 而原方块右边界 x=32 外侧不该有描边。
     */
    expect(px(output, 22, 20)[3]).toBeGreaterThan(0);
    expect(px(output, 34, 20)[3]).toBe(0);
  });
});
