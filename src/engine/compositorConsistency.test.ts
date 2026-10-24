/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { createCanvas, ctx2d } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { flatten } from './compositor';
import { compositeInView } from './viewCompositor';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';

/**
 * 两套合成器的一致性测试。
 *
 * 项目里有两条渲染路径：屏幕（compositeInView，视口尺寸）和
 * 导出（flatten → composite → evaluateGraph，文档尺寸）。这两套实现必然发散：
 * 上次文字图层丢失就是因为 evaluator 的 resolverFrom 对 text/shape 返回 null。
 *
 * 不能靠「写功能→发现某种图层导出有问题→修一行」这样追症状，
 * 应该有一组测试明确断言「任意图层配置，两条路径输出必须逐像素相同」，
 * 在 CI 里把这类偏差挡住。
 *
 * 预期会有几个失败的用例（调整图层在 evaluator 里只实现了 brightness-contrast），
 * 那些用例上写明 .todo 或 .skip，标注已知偏离，不让套件整体变红。
 * 它们既是 TODO 清单，也是回归探测器——一旦哪天把那个功能补上，
 * 这些用例自动从失败变绿，无需手动维护。
 */

const W = 8;
const H = 8;

/** 造一个纯色填满的图层 */
function solid(id: string, color: string, type: Layer['type'] = 'raster'): Layer {
  const canvas = createCanvas(W, H);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, W, H);
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas),
    parentId: null,
  };
}

/** 读画布某点的 RGBA */
function pixel(canvas: HTMLCanvasElement, x = 0, y = 0): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

/**
 * 逐像素比较两张画布。
 *
 * 只要有任意一点不同就 throw，报错信息带坐标和具体值，便于定位。
 * 绝大多数情况应该完全相同，偶尔可能有混合模式的浮点舍入差（≤1），
 * 那种就放宽到 expectNear 而不是 toBe。
 */
function expectSamePixels(a: HTMLCanvasElement, b: HTMLCanvasElement) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  }
  const dataA = ctx2d(a).getImageData(0, 0, a.width, a.height).data;
  const dataB = ctx2d(b).getImageData(0, 0, b.width, b.height).data;
  for (let i = 0; i < dataA.length; i += 4) {
    const x = (i / 4) % a.width;
    const y = Math.floor(i / 4 / a.width);
    const rA = dataA[i];
    const gA = dataA[i + 1];
    const bA = dataA[i + 2];
    const aA = dataA[i + 3];
    const rB = dataB[i];
    const gB = dataB[i + 1];
    const bB = dataB[i + 2];
    const aB = dataB[i + 3];
    if (rA !== rB || gA !== gB || bA !== bB || aA !== aB) {
      throw new Error(
        `Pixel mismatch at (${x},${y}): ` +
          `flatten=[${rA},${gA},${bA},${aA}] vs compositeInView=[${rB},${gB},${bB},${aB}]`,
      );
    }
  }
}

/**
 * 对同一份图层跑两条路径，返回结果画布。
 *
 * flatten 是导出路径，compositeInView 是屏幕路径。
 * 视口取成与文档同尺寸、zoom=1、dpr=1，这样视口坐标就等于文档坐标，
 * 两张结果可以直接逐像素比。缩放下的差异属于重采样，不在这份契约里。
 */
function renderBothPaths(layers: Layer[]): {
  fromFlatten: HTMLCanvasElement;
  fromCache: HTMLCanvasElement;
} {
  const fromFlatten = flatten(layers, W, H);

  const view = makeViewportContext({
    viewportWidth: W,
    viewportHeight: H,
    docWidth: W,
    docHeight: H,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
  });
  const target = document.createElement('canvas');
  compositeInView(prepareViewportCanvas(target, view), layers, view);

  return { fromFlatten, fromCache: target };
}

describe('两套合成器一致性', () => {
  it('单个像素图层', () => {
    const layers = [solid('r1', '#ff0000')];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
  });

  it('文字图层（这是上次的 bug）', () => {
    const layers = [solid('t1', '#00ff00', 'text')];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
  });

  it('形状图层', () => {
    const layers = [solid('s1', '#0000ff', 'shape')];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
  });

  it('多个图层按栈顺序叠加', () => {
    const layers = [solid('r1', '#0000ff'), solid('t1', '#ff0000', 'text')];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
    // 上层应该盖住下层
    expect(pixel(fromFlatten)).toEqual([255, 0, 0, 255]);
  });

  it('隐藏图层不出现在输出里', () => {
    const layers = [{ ...solid('r1', '#ff0000'), visible: false }];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
    expect(pixel(fromFlatten)[3]).toBe(0); // 全透明
  });

  it('不透明度 50', () => {
    const layers = [solid('bg', '#000000'), { ...solid('top', '#ffffff'), opacity: 50 }];
    const { fromFlatten, fromCache } = renderBothPaths(layers);
    expectSamePixels(fromFlatten, fromCache);
    // 白色 50% 在黑色上 = 128 灰
    const [r] = pixel(fromFlatten);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
  });

  it('multiply 混合模式', () => {
    const red = solid('r', '#ff0000');
    const green = { ...solid('g', '#00ff00'), blendMode: 'multiply' as const };
    const { fromFlatten, fromCache } = renderBothPaths([red, green]);
    expectSamePixels(fromFlatten, fromCache);
    // 红 × 绿 = 黑（或接近黑）
    const [r, g, b] = pixel(fromFlatten);
    expect(r + g + b).toBeLessThan(30);
  });

  it('screen 混合模式', () => {
    const blue = solid('b', '#0000ff');
    const yellow = { ...solid('y', '#ffff00'), blendMode: 'screen' as const };
    const { fromFlatten, fromCache } = renderBothPaths([blue, yellow]);
    expectSamePixels(fromFlatten, fromCache);
  });

  it('overlay 混合模式', () => {
    const base = solid('base', '#808080');
    const top = { ...solid('top', '#ff0000'), blendMode: 'overlay' as const };
    const { fromFlatten, fromCache } = renderBothPaths([base, top]);
    expectSamePixels(fromFlatten, fromCache);
  });

  it('图层蒙版（显示所有）', () => {
    const mask = createCanvas(W, H);
    ctx2d(mask).fillStyle = '#ffffff';
    ctx2d(mask).fillRect(0, 0, W, H);
    const layer = { ...solid('r1', '#ff0000'), mask };
    const { fromFlatten, fromCache } = renderBothPaths([layer]);
    expectSamePixels(fromFlatten, fromCache);
    expect(pixel(fromFlatten)).toEqual([255, 0, 0, 255]);
  });

  it('图层蒙版（半透明）', () => {
    const mask = createCanvas(W, H);
    ctx2d(mask).fillStyle = '#808080';
    ctx2d(mask).fillRect(0, 0, W, H);
    const layer = { ...solid('r1', '#ff0000'), mask };
    const { fromFlatten, fromCache } = renderBothPaths([layer]);
    expectSamePixels(fromFlatten, fromCache);
    // 蒙版 128 灰 → 约 50% 透明
    expect(pixel(fromFlatten)[3]).toBeGreaterThan(120);
    expect(pixel(fromFlatten)[3]).toBeLessThan(135);
  });

  it('图层蒙版（隐藏所有）', () => {
    const mask = createCanvas(W, H);
    ctx2d(mask).fillStyle = '#000000';
    ctx2d(mask).fillRect(0, 0, W, H);
    const layer = { ...solid('r1', '#ff0000'), mask };
    const { fromFlatten, fromCache } = renderBothPaths([layer]);
    expectSamePixels(fromFlatten, fromCache);
    expect(pixel(fromFlatten)[3]).toBe(0);
  });

  it('剪贴蒙版：成员只在基底的不透明区域内显示', () => {
    // 基底只占左半边
    const base = createCanvas(W, H);
    ctx2d(base).fillStyle = '#0000ff';
    ctx2d(base).fillRect(0, 0, W / 2, H);
    const baseLayer: Layer = {
      ...solid('base', '#0000ff'),
      canvas: base,
      bounds: boundsFor(base),
    };
    // 成员铺满，但被剪贴
    const member = { ...solid('member', '#ff0000'), clipped: true };
    const { fromFlatten, fromCache } = renderBothPaths([baseLayer, member]);
    expectSamePixels(fromFlatten, fromCache);
    // 左边红色（成员被剪进基底），右边透明
    expect(pixel(fromFlatten, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(fromFlatten, W - 1, 0)[3]).toBe(0);
  });

  it('图层组（穿透模式）', () => {
    const groupCanvas = createCanvas(1, 1);
    const group: Layer = {
      id: 'g1',
      name: 'g1',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'pass-through',
      canvas: groupCanvas,
      bounds: boundsFor(groupCanvas),
      parentId: null,
    };
    const child1 = { ...solid('c1', '#ff0000'), parentId: 'g1' };
    const child2 = { ...solid('c2', '#00ff00'), parentId: 'g1' };
    const { fromFlatten, fromCache } = renderBothPaths([group, child1, child2]);
    expectSamePixels(fromFlatten, fromCache);
    // 子图层应该正常叠加
    expect(pixel(fromFlatten)).toEqual([0, 255, 0, 255]);
  });

  it('图层组（正常混合，组不透明度 50）', () => {
    const groupCanvas = createCanvas(1, 1);
    const group: Layer = {
      id: 'g1',
      name: 'g1',
      type: 'group',
      visible: true,
      locked: false,
      opacity: 50,
      blendMode: 'normal',
      canvas: groupCanvas,
      bounds: boundsFor(groupCanvas),
      parentId: null,
    };
    const child = { ...solid('c1', '#ffffff'), parentId: 'g1' };
    const bg = solid('bg', '#000000');
    const { fromFlatten, fromCache } = renderBothPaths([bg, group, child]);
    expectSamePixels(fromFlatten, fromCache);
    // 白色 50% 在黑色上 = 约 128 灰
    const [r] = pixel(fromFlatten);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
  });

  /*
   * 调整图层：已确认的不一致，方向与直觉相反。
   *
   * 实测（brightness +50 作用在 #808080 上）：
   *   flatten（导出）      = 178 —— 应用了调整
   *   旧屏幕路径          = 128 —— 没应用，还是原始灰
   *
   * 表现是**屏幕上看不见调整效果，导出后却生效了**，用户会发现导出的图更亮。
   * 根因：旧路径的 paintNode 完全没有 adjustment 分支，它把调整图层当普通图层画，
   * 而调整图层的 canvas 是 1×1 占位，等于什么都没画。
   * 新路径的 paintAdjustmentInView 补上了这一支，所以这里转成真用例守住它。
   */
  it('调整图层 brightness-contrast：两条路径都应用', () => {
    const bg = solid('bg', '#808080');
    const adjustCanvas = createCanvas(1, 1);
    const adjust: Layer = {
      id: 'a1',
      name: 'a1',
      type: 'adjustment',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      canvas: adjustCanvas,
      bounds: boundsFor(adjustCanvas),
      parentId: null,
      adjustmentData: { kind: 'brightness-contrast', params: { brightness: 50 } },
    };
    const { fromFlatten, fromCache } = renderBothPaths([bg, adjust]);
    expectSamePixels(fromFlatten, fromCache);
    // 提亮过了，不再是原始的 128
    expect(pixel(fromFlatten)[0]).toBeGreaterThan(140);
  });

  // curves / levels：求值器与屏幕路径都还没实现，两边一致地「不生效」。
  // 实现其中任一条时这两个 todo 就要转成真用例。
  it.todo('调整图层 curves：evaluator 未实现，屏幕路径也未实现');
  it.todo('调整图层 levels：evaluator 未实现，屏幕路径也未实现');
});
