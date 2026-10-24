/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { transformSourceOf, transformSourceWithSelection } from './transformSource';
import { cloneCanvas, createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { rectSelection } from './selection';
import type { Rect } from '../types';

/** 造一张画布，在指定局部矩形里涂红，其余留透明 */
function withBlock(width: number, height: number, block?: Rect): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  if (block) {
    const context = ctx2d(canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(block.x, block.y, block.width, block.height);
  }
  return canvas;
}

const alphaAt = (canvas: HTMLCanvasElement, x: number, y: number) =>
  ctx2d(canvas).getImageData(x, y, 1, 1).data[3];

describe('transformSourceOf', () => {
  /*
   * 绘制前图层画布会被撑到覆盖整个文档，四周多出全透明的一圈。
   * 框必须贴着有像素的那一块，否则缩小确认之后再开一次变换，
   * 框又是整幅文档那么大——就是「框还停在上一次缩放前的位置」。
   */
  it('框贴着内容，不是整张画布', () => {
    const canvas = withBlock(32, 32, { x: 4, y: 8, width: 10, height: 6 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 32, height: 32 });

    expect(source.rect).toEqual({ x: 4, y: 8, width: 10, height: 6 });
    expect(source.origin.width).toBe(10);
    expect(source.origin.height).toBe(6);
  });

  it('rect 是文档坐标，要加上图层位置', () => {
    const canvas = withBlock(32, 32, { x: 4, y: 4, width: 8, height: 8 });

    const source = transformSourceOf(canvas, { x: 100, y: 50, width: 32, height: 32 });

    expect(source.rect).toEqual({ x: 104, y: 54, width: 8, height: 8 });
  });

  it('快照裁的就是内容那一块，边角对得上', () => {
    const canvas = withBlock(16, 16, { x: 4, y: 4, width: 4, height: 4 });

    const { origin } = transformSourceOf(canvas, { x: 0, y: 0, width: 16, height: 16 });

    // 裁出来的 4×4 全是实心，四个角都不透明
    expect(alphaAt(origin, 0, 0)).toBe(255);
    expect(alphaAt(origin, 3, 3)).toBe(255);
  });

  it('整幅都有内容时行为不变', () => {
    const canvas = withBlock(16, 16, { x: 0, y: 0, width: 16, height: 16 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 16, height: 16 });

    expect(source.rect).toEqual({ x: 0, y: 0, width: 16, height: 16 });
  });

  it('全透明图层退回整张画布，不至于开不出框', () => {
    const canvas = withBlock(16, 16);

    const source = transformSourceOf(canvas, { x: 2, y: 3, width: 16, height: 16 });

    expect(source.rect).toEqual({ x: 2, y: 3, width: 16, height: 16 });
    expect(source.origin.width).toBe(16);
  });

  it('宽高为 1 的画布也能处理', () => {
    const canvas = withBlock(1, 1, { x: 0, y: 0, width: 1, height: 1 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 1, height: 1 });

    expect(source.rect).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(source.origin.width).toBe(1);
  });

  it('给了期望框就贴期望框，不缩到墨迹上', () => {
    // 没写满的段落文本：框是拖出来的 20×20，墨迹只占左上角一小块
    const canvas = withBlock(20, 20, { x: 0, y: 0, width: 6, height: 4 });

    const source = transformSourceOf(canvas, { x: 5, y: 7, width: 20, height: 20 }, undefined, {
      x: 0,
      y: 0,
      width: 20,
      height: 20,
    });

    expect(source.rect).toEqual({ x: 5, y: 7, width: 20, height: 20 });
    expect(source.origin.width).toBe(20);
  });

  it('墨迹伸出期望框时取并集，伸出的部分不会被裁掉', () => {
    // 斜体/下划线会画到外框之外，框只贴外框就会把它裁没
    const canvas = withBlock(32, 32, { x: 8, y: 8, width: 16, height: 16 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 32, height: 32 }, undefined, {
      x: 4,
      y: 4,
      width: 8,
      height: 8,
    });

    expect(source.rect).toEqual({ x: 4, y: 4, width: 20, height: 20 });
  });

  it('期望框带小数时向外取整，不做半像素重采样', () => {
    const canvas = withBlock(20, 20, { x: 2, y: 2, width: 2, height: 2 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 20, height: 20 }, undefined, {
      x: 1.4,
      y: 1.6,
      width: 5.2,
      height: 5.1,
    });

    // x: 1.4 → 1，右边 6.6 → 7，宽 6；y: 1.6 → 1，下边 6.7 → 7，高 6
    expect(source.rect).toEqual({ x: 1, y: 1, width: 6, height: 6 });
  });

  it('期望框超出画布的部分被夹掉，框不会飘到没有像素的地方', () => {
    const canvas = withBlock(10, 10, { x: 0, y: 0, width: 4, height: 4 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 10, height: 10 }, undefined, {
      x: -5,
      y: -5,
      width: 40,
      height: 40,
    });

    expect(source.rect).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it('期望框完全落在画布外时退回墨迹', () => {
    const canvas = withBlock(10, 10, { x: 1, y: 1, width: 3, height: 3 });

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 10, height: 10 }, undefined, {
      x: 50,
      y: 50,
      width: 4,
      height: 4,
    });

    expect(source.rect).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  });

  it('全透明图层给了期望框就用期望框，不必退回整张画布', () => {
    // 刚建好还没打字的文字层：一个墨点都没有，但框应该是那个空定界框
    const canvas = withBlock(30, 30);

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 30, height: 30 }, undefined, {
      x: 4,
      y: 6,
      width: 10,
      height: 12,
    });

    expect(source.rect).toEqual({ x: 4, y: 6, width: 10, height: 12 });
    expect(source.origin.width).toBe(10);
    expect(source.origin.height).toBe(12);
  });

  it('没有蒙版时不造蒙版快照', () => {
    const canvas = withBlock(16, 16, { x: 0, y: 0, width: 8, height: 8 });

    expect(transformSourceOf(canvas, { x: 0, y: 0, width: 16, height: 16 }).originMask)
      .toBeUndefined();
  });

  /*
   * 源与蒙版必须同尺寸：boxMatrix 按各自尺寸算缩放，
   * 尺寸不一致就会把两者映射到不同大小的框上，蒙版整体跑偏。
   */
  it('蒙版按同一块裁，与源快照同尺寸', () => {
    const canvas = withBlock(32, 32, { x: 8, y: 8, width: 12, height: 12 });
    const mask = createCanvas(32, 32);
    fillCanvas(mask, '#ffffff');
    ctx2d(mask).fillStyle = '#000000';
    ctx2d(mask).fillRect(8, 8, 6, 12);

    const { origin, originMask } = transformSourceOf(
      canvas,
      { x: 0, y: 0, width: 32, height: 32 },
      mask,
    );

    expect(originMask!.width).toBe(origin.width);
    expect(originMask!.height).toBe(origin.height);
    // 黑白分界原来在画布 x=14，裁掉左边 8 之后应当在快照 x=6
    expect(ctx2d(originMask!).getImageData(2, 2, 1, 1).data[0]).toBeLessThan(60);
    expect(ctx2d(originMask!).getImageData(9, 2, 1, 1).data[0]).toBeGreaterThan(200);
  });

  /*
   * 蒙版与画布不同尺寸时，合成阶段是把蒙版拉伸到画布尺寸用的（见 applyMask），
   * 按画布坐标裁它会错位。这种情况退回整张画布，只是框大一圈，不会画错。
   */
  it('蒙版与画布尺寸不一致时退回整张画布', () => {
    const canvas = withBlock(32, 32, { x: 8, y: 8, width: 8, height: 8 });
    const mask = createCanvas(16, 16);
    fillCanvas(mask, '#ffffff');

    const source = transformSourceOf(canvas, { x: 0, y: 0, width: 32, height: 32 }, mask);

    expect(source.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(source.originMask!.width).toBe(16);
  });

  it('不改动入参画布', () => {
    const canvas = withBlock(16, 16, { x: 4, y: 4, width: 4, height: 4 });

    transformSourceOf(canvas, { x: 0, y: 0, width: 16, height: 16 });

    expect(canvas.width).toBe(16);
    expect(alphaAt(canvas, 4, 4)).toBe(255);
    expect(alphaAt(canvas, 0, 0)).toBe(0);
  });
});

describe('transformSourceWithSelection', () => {
  it('提取选区内的像素，背景挖空选区', () => {
    const canvas = withBlock(100, 100, { x: 0, y: 0, width: 100, height: 100 });
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    const selection = rectSelection(100, 100, { x: 20, y: 30, width: 40, height: 25 }, { feather: 0 })!;

    const result = transformSourceWithSelection(canvas, bounds, undefined, selection);

    expect(result.rect).toEqual({ x: 20, y: 30, width: 40, height: 25 });
    expect(result.origin.width).toBe(40);
    expect(result.origin.height).toBe(25);

    // origin 左上角该是红色不透明
    const originData = ctx2d(result.origin).getImageData(0, 0, 1, 1).data;
    expect(originData[0]).toBe(255);
    expect(originData[3]).toBe(255);

    // background 在选区内 (25, 35) 该是透明
    const bgData = ctx2d(result.background).getImageData(25, 35, 1, 1).data;
    expect(bgData[3]).toBe(0);

    // background 在选区外 (10, 10) 该仍是红色
    const bgOutside = ctx2d(result.background).getImageData(10, 10, 1, 1).data;
    expect(bgOutside[0]).toBe(255);
    expect(bgOutside[3]).toBe(255);
  });

  it('羽化选区的边缘按强度拆 alpha', () => {
    const canvas = withBlock(100, 100, { x: 0, y: 0, width: 100, height: 100 });
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    // 羽化 5px 的矩形选区，边缘会有渐变
    const selection = rectSelection(100, 100, { x: 20, y: 20, width: 60, height: 60 }, { feather: 5 })!;

    const result = transformSourceWithSelection(canvas, bounds, undefined, selection);

    // 中心点 alpha 应该是满的
    const cx = result.origin.width / 2;
    const cy = result.origin.height / 2;
    const center = ctx2d(result.origin).getImageData(cx, cy, 1, 1).data;
    expect(center[3]).toBeGreaterThan(250);

    // 边界点 alpha 应该是部分的
    const edge = ctx2d(result.origin).getImageData(0, cy, 1, 1).data;
    expect(edge[3]).toBeGreaterThan(0);
    expect(edge[3]).toBeLessThan(255);
  });

  it('不修改原画布', () => {
    const canvas = withBlock(50, 50, { x: 0, y: 0, width: 50, height: 50 });
    const bounds = { x: 0, y: 0, width: 50, height: 50 };
    const selection = rectSelection(50, 50, { x: 10, y: 10, width: 30, height: 30 }, { feather: 0 })!;

    transformSourceWithSelection(canvas, bounds, undefined, selection);

    // 原画布选区内 (20, 20) 仍该是红色不透明
    const data = ctx2d(canvas).getImageData(20, 20, 1, 1).data;
    expect(data[0]).toBe(255);
    expect(data[3]).toBe(255);
  });

  /*
   * 先用移动工具把选区内容挪走、再 Ctrl+T 的场景。
   * 移动工具落下方块时会盖掉新位置原有的像素，那份原始内容只存在 pristine 里。
   * 背景必须由 pristine 直接充当：pristine 的洞已经在原位置了，
   * 再按当前选区挖一遍会把新位置的背景也挖掉，表现就是「方块后面的背景变透明」。
   */
  it('传入 pristine 时，新位置底下的背景不被挖掉', () => {
    const bounds = { x: 0, y: 0, width: 100, height: 100 };
    // 移动前：整张蓝底，(10,10) 处一块红方块
    const beforeMove = createCanvas(100, 100);
    fillCanvas(beforeMove, '#0000ff');
    ctx2d(beforeMove).fillStyle = '#ff0000';
    ctx2d(beforeMove).fillRect(10, 10, 20, 20);

    // 移动工具第一步：把 (10,10) 那块剪走，剩下的就是 pristine（原位一个蓝底被挖成的洞）
    const pristine = cloneCanvas(beforeMove);
    ctx2d(pristine).clearRect(10, 10, 20, 20);

    // 移动工具落下：红方块贴到 (60,60)，盖掉那里原有的蓝底
    const afterMove = cloneCanvas(pristine);
    ctx2d(afterMove).fillStyle = '#ff0000';
    ctx2d(afterMove).fillRect(60, 60, 20, 20);

    // 蚂蚁线跟着像素走到新位置
    const selection = rectSelection(100, 100, { x: 60, y: 60, width: 20, height: 20 }, { feather: 0 })!;

    const result = transformSourceWithSelection(afterMove, bounds, undefined, selection, pristine);

    // 变换的源仍是那块红方块
    const originData = ctx2d(result.origin).getImageData(5, 5, 1, 1).data;
    expect(originData[0]).toBe(255);
    expect(originData[3]).toBe(255);

    // 关键断言：新位置 (65,65) 底下该露出原本的蓝底，不是透明
    const bg = ctx2d(result.background).getImageData(65, 65, 1, 1).data;
    expect(bg[3]).toBe(255);
    expect(bg[2]).toBe(255);
    expect(bg[0]).toBe(0);

    // 原位置 (15,15) 该是洞：方块是从那里被搬走的
    expect(alphaAt(result.background, 15, 15)).toBe(0);

    // 两处都没碰到的地方保持蓝底
    const untouched = ctx2d(result.background).getImageData(90, 5, 1, 1).data;
    expect(untouched[2]).toBe(255);
    expect(untouched[3]).toBe(255);
  });
});
