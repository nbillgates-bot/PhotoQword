/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { BlendMode, Layer } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';
import { createMask } from './mask';
import { flatten } from './compositor';

/**
 * 偏移图层的合成等价性。
 *
 * paintNode 对「原生混合 + 无蒙版 + 无效果」的图层走零分配快速路径：
 * 直接按 bounds 偏移 drawImage，不先摊平成文档尺寸画布。长图文档里
 * 一张文档尺寸画布要几十 MB，几百个图层时这一次分配就是卡顿的来源。
 *
 * 这组用例盯的就是「省掉那次摊平之后画面还是一样的」，
 * 以及必须摊平的三条路径（蒙版/手写混合/效果）没被误判进快速路径。
 */

const W = 8;
const H = 8;

/** 造一个 size×size 的纯色块，摆在文档的 (x, y) 处 */
function block(
  id: string,
  color: string,
  x: number,
  y: number,
  size = 2,
  extra: Partial<Layer> = {},
): Layer {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: { x, y, width: size, height: size },
    parentId: null,
    ...extra,
  };
}

/** 读某点的 RGBA */
function at(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

describe('偏移图层的合成位置', () => {
  it('按 bounds 偏移落位，不落到原点', () => {
    const out = flatten([block('a', '#ff0000', 3, 5)], W, H);
    expect(at(out, 3, 5)).toEqual([255, 0, 0, 255]);
    expect(at(out, 4, 6)).toEqual([255, 0, 0, 255]);
    // 原点必须是空的：摊平路径写错偏移时内容会整体跑到左上角
    expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('bounds 之外不改动已有画面', () => {
    const out = flatten([block('base', '#0000ff', 0, 0, W), block('top', '#ff0000', 2, 2)], W, H);
    expect(at(out, 2, 2)).toEqual([255, 0, 0, 255]);
    // 覆盖块之外仍是底色，说明偏移绘制没有波及整幅
    expect(at(out, 6, 6)).toEqual([0, 0, 255, 255]);
  });

  it('不透明度作用在偏移图层上', () => {
    const out = flatten([block('a', '#ff0000', 1, 1, 2, { opacity: 50 })], W, H);
    const [r, g, b, alpha] = at(out, 1, 1);
    expect(r).toBe(255);
    expect(g).toBe(0);
    expect(b).toBe(0);
    // 50% 不透明度，允许一点取整误差
    expect(Math.abs(alpha - 128)).toBeLessThanOrEqual(2);
  });

  it('隐藏与 0 不透明度的偏移图层不出现', () => {
    expect(at(flatten([block('a', '#ff0000', 2, 2, 2, { visible: false })], W, H), 2, 2)).toEqual([
      0, 0, 0, 0,
    ]);
    expect(at(flatten([block('b', '#ff0000', 2, 2, 2, { opacity: 0 })], W, H), 2, 2)).toEqual([
      0, 0, 0, 0,
    ]);
  });
});

describe('必须摊平的路径仍然正确', () => {
  it('手写混合模式（差值）在偏移图层上结果正确', () => {
    // 差值不是原生混合，会走 getImageData 手写路径，要求尺寸与文档一致
    const out = flatten(
      [
        block('base', '#ffffff', 0, 0, W),
        block('top', '#ff0000', 2, 2, 2, { blendMode: 'difference' as BlendMode }),
      ],
      W,
      H,
    );
    // 白 - 红 = 青
    expect(at(out, 2, 2)).toEqual([0, 255, 255, 255]);
    // 混合区之外保持白色
    expect(at(out, 6, 6)).toEqual([255, 255, 255, 255]);
  });

  it('带蒙版的偏移图层，蒙版跟着 bounds 走', () => {
    /*
     * 蒙版跟图层画布同尺寸、对齐到 bounds（见 mask.ts 的 maskGeometry）。
     * 这条用例原先按「蒙版是文档尺寸、文档坐标」写，那个约定已经改掉了：
     * 它让 PSD 里 bounds 不在原点的图层整层消失，而且和变换路径的假设相反
     * （transformSlice 一直是把蒙版当图层局部坐标在转的）。
     * 跟 PS 也一致——PS 的图层蒙版默认与图层链接，移动图层蒙版跟着走。
     *
     * 2×2 的块配 2×2 的蒙版，左列白右列黑：不管块摆在哪，
     * 都是左列留下、右列被遮。
     */
    const mask = createMask(2, 2, false);
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillRect(0, 0, 1, 2);

    const out = flatten([block('a', '#ff0000', 4, 2, 2, { mask })], W, H);
    expect(at(out, 4, 2)).toEqual([255, 0, 0, 255]);
    expect(at(out, 5, 2)).toEqual([0, 0, 0, 0]);

    // 换个位置摆，结论不变——蒙版是跟着图层的，不是钉在文档上的
    const moved = flatten([block('b', '#ff0000', 1, 2, 2, { mask })], W, H);
    expect(at(moved, 1, 2)).toEqual([255, 0, 0, 255]);
    expect(at(moved, 2, 2)).toEqual([0, 0, 0, 0]);
  });

  it('maskEnabled 为 false 时蒙版不生效，回到快速路径', () => {
    const mask = createMask(W, H, false);
    const out = flatten([block('a', '#ff0000', 4, 2, 2, { mask, maskEnabled: false })], W, H);
    // 蒙版停用，全黑蒙版不该再遮住图层
    expect(at(out, 4, 2)).toEqual([255, 0, 0, 255]);
  });

  it('像素值不含 NaN', () => {
    const out = flatten(
      [block('base', '#123456', 0, 0, W), block('top', '#abcdef', 3, 3, 2, { opacity: 60 })],
      W,
      H,
    );
    const { data } = ctx2d(out).getImageData(0, 0, W, H);
    expect([...data].some((value) => Number.isNaN(value))).toBe(false);
  });
});

/*
 * 手写混合的读回范围被收窄到图层 bounds（见 drawPixels 的 dirty 参数）。
 * 收窄的前提是 blendImageData 对 source alpha 为 0 的像素完全不动 backdrop，
 * 所以框外结果必须与收窄前一致 —— 这组用例盯的就是这个等价性。
 */
describe('手写混合只处理图层范围', () => {
  const custom: Partial<Layer> = { blendMode: 'linear-light' as BlendMode };

  it('框内照常混合，框外底色一个字节都不变', () => {
    const base = block('base', '#808080', 0, 0, W);
    const top = block('top', '#ffffff', 4, 4, 2, custom);
    const out = flatten([base, top], W, H);

    // 框内：linear-light 用白色提亮，必须比底色亮
    expect(at(out, 4, 4)[0]).toBeGreaterThan(128);
    // 框外：必须严格等于底色，不能被读-混-写擦出偏差
    expect(at(out, 0, 0)).toEqual([128, 128, 128, 255]);
    expect(at(out, 7, 0)).toEqual([128, 128, 128, 255]);
    expect(at(out, 0, 7)).toEqual([128, 128, 128, 255]);
  });

  it('图层部分超出文档边界时不越界读写', () => {
    const base = block('base', '#808080', 0, 0, W);
    // bounds 右下角伸到文档外，clampRect 要把它夹回画布内
    const top = block('top', '#ffffff', W - 1, H - 1, 3, custom);
    const out = flatten([base, top], W, H);
    expect(at(out, W - 1, H - 1)[0]).toBeGreaterThan(128);
    expect(at(out, 0, 0)).toEqual([128, 128, 128, 255]);
  });

  it('图层整个落在文档外时什么都不混合', () => {
    const base = block('base', '#808080', 0, 0, W);
    const top = block('top', '#ffffff', W + 4, H + 4, 2, custom);
    const out = flatten([base, top], W, H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) expect(at(out, x, y)).toEqual([128, 128, 128, 255]);
    }
  });

  it('负偏移图层的框被夹到原点且结果不含 NaN', () => {
    const base = block('base', '#808080', 0, 0, W);
    const top = block('top', '#ffffff', -1, -1, 3, custom);
    const out = flatten([base, top], W, H);
    expect(at(out, 0, 0)[0]).toBeGreaterThan(128);
    const { data } = ctx2d(out).getImageData(0, 0, W, H);
    expect([...data].some((value) => Number.isNaN(value))).toBe(false);
  });
});

describe('边界尺寸', () => {
  it('1×1 图层落在文档最后一个像素上', () => {
    const out = flatten([block('a', '#ff0000', W - 1, H - 1, 1)], W, H);
    expect(at(out, W - 1, H - 1)).toEqual([255, 0, 0, 255]);
    expect(at(out, 0, 0)).toEqual([0, 0, 0, 0]);
  });

  it('部分超出文档右下角的图层只画进画布内的部分', () => {
    const out = flatten([block('a', '#ff0000', W - 1, H - 1, 3)], W, H);
    expect(at(out, W - 1, H - 1)).toEqual([255, 0, 0, 255]);
  });

  it('bounds 为负坐标时按负偏移落位', () => {
    // 图层被拖出画布左上角：只有右下那一部分还在文档里
    const out = flatten([block('a', '#ff0000', -1, -1, 2)], W, H);
    expect(at(out, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(at(out, 1, 1)).toEqual([0, 0, 0, 0]);
  });
});
