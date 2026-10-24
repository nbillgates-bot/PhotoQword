/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 移动工具的"浮动选区"路径：有选区时拖动搬走的是选区里的像素，不是整个图层。
 *
 * 单开一个文件而不是塞进 moveTool.test.ts，是因为那个文件已经接近 250 行上限（规约 1.2）。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from './moveTool';
import { drag, hasNaN, newDoc, pixelAt, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';
import { rectSelection } from '../engine/selection';

beforeEach(() => {
  reset(moveTool);
});

/** 在活动图层上画一个 4×4 红块，左上角在图层局部坐标 (2,2) */
function redBlock(): void {
  const context2d = ctx2d(store().activeLayer()!.canvas);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(2, 2, 4, 4);
  store().bumpRevision();
}

/** 按文档坐标判断合成结果是不是红的。不直接读图层画布，因为图层可能有偏移 */
function isRed(x: number, y: number): boolean {
  const doc = store().doc!;
  const [r, g, , a] = pixelAt(flatten(store().layers, doc.width, doc.height), x, y);
  return a > 200 && r > 200 && g < 80;
}

/** 同上，判断是不是蓝的。用来验证方块下面的背景没被连带剪走 */
function isBlue(x: number, y: number): boolean {
  const doc = store().doc!;
  const [r, , b, a] = pixelAt(flatten(store().layers, doc.width, doc.height), x, y);
  return a > 200 && b > 200 && r < 80;
}

/**
 * 16×16 文档 + 一个画了红块的栅格层。
 *
 * 画完压一条历史，让"红块在原处"成为可回退的状态点——真实绘制路径也是这样，
 * 否则撤销会一路退到空图层，测不出移动本身有没有被撤销。
 */
function docWithBlock(): void {
  newDoc();
  store().addLayer('raster', '内容');
  redBlock();
  store().pushHistory('画红块');
}

/** 设一个矩形选区，坐标是文档坐标 */
function select(x: number, y: number, width: number, height: number, feather = 0): void {
  store().setSelection(rectSelection(16, 16, { x, y, width, height }, { feather }));
}

describe('移动选区内的像素', () => {
  it('只搬选区里的像素，原处留空，选区外的部分不动', () => {
    docWithBlock();
    // 红块占 (2,2)-(5,5)，只选它左上的 2×2
    select(2, 2, 2, 2);

    drag(moveTool, pointer(2, 2), pointer(10, 10));

    // 选中的两个像素落到新位置
    expect(isRed(10, 10)).toBe(true);
    expect(isRed(11, 11)).toBe(true);
    // 原处被掏空，露出下面的白底
    expect(isRed(2, 2)).toBe(false);
    expect(isRed(3, 3)).toBe(false);
    // 选区外的红块残余不受影响
    expect(isRed(4, 4)).toBe(true);
    expect(isRed(5, 5)).toBe(true);
    // 没有多搬东西过去
    expect(isRed(12, 12)).toBe(false);
  });

  it('图层本身有偏移时，选区像素仍落在正确的文档坐标', () => {
    docWithBlock();
    // 先把整层往右下搬 3 像素：红块此时在文档 (5,5)-(8,8)
    drag(moveTool, pointer(3, 3), pointer(6, 6));
    expect(isRed(5, 5)).toBe(true);

    // 再选文档坐标下的 2×2 并搬走。选区是文档坐标，图层画布是局部坐标，
    // 差 layer.bounds 那个原点——早先漏了这次换算，像素会落错位置。
    select(5, 5, 2, 2);
    drag(moveTool, pointer(5, 5), pointer(11, 11));

    expect(isRed(11, 11)).toBe(true);
    expect(isRed(12, 12)).toBe(true);
    expect(isRed(5, 5)).toBe(false);
    expect(isRed(7, 7)).toBe(true);
  });

  it('羽化选区提取后不产生 NaN', () => {
    docWithBlock();
    select(2, 2, 4, 4, 1);

    drag(moveTool, pointer(3, 3), pointer(9, 9));

    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });

  it('连续拖动两次，第二次不会把方块下面的背景一起剪走', () => {
    newDoc();
    store().addLayer('raster', '内容');
    // 铺一层蓝底，再在左上画红块：这样"背景被吃掉"会表现为蓝色变透明
    const context2d = ctx2d(store().activeLayer()!.canvas);
    context2d.fillStyle = '#0000ff';
    context2d.fillRect(0, 0, 16, 16);
    context2d.fillStyle = '#ff0000';
    context2d.fillRect(2, 2, 2, 2);
    store().bumpRevision();
    select(2, 2, 2, 2);

    // 第一下：红块搬到 (6,6)
    drag(moveTool, pointer(2, 2), pointer(6, 6));
    expect(isRed(6, 6)).toBe(true);

    // 第二下：从 (6,6) 再搬到 (10,10)
    drag(moveTool, pointer(6, 6), pointer(10, 10));

    expect(isRed(10, 10)).toBe(true);
    // (6,6) 应该还是蓝底——第二次剪的是浮动块，不是"块 + 它压着的蓝底"
    expect(isBlue(6, 6)).toBe(true);
    expect(isBlue(7, 7)).toBe(true);
    // 只有最初的原位置留洞，且洞里也该是蓝的（红块是画在蓝底上的）
    expect(isRed(2, 2)).toBe(false);
  });

  it('搬完压一条历史，可以撤销', () => {
    docWithBlock();
    select(2, 2, 2, 2);
    const before = store().history.length;

    drag(moveTool, pointer(2, 2), pointer(10, 10));

    expect(store().history.length).toBe(before + 1);
    store().undo();
    expect(isRed(2, 2)).toBe(true);
    expect(isRed(10, 10)).toBe(false);
  });

  it('按在选区外拖动搬的是整个图层', () => {
    docWithBlock();
    // 选区在右下角，起手点落在它外面
    select(10, 10, 3, 3);

    drag(moveTool, pointer(3, 3), pointer(6, 6));

    // 整层平移：红块跟着走，且不留空洞
    expect(store().activeLayer()!.bounds).toMatchObject({ x: 3, y: 3 });
    expect(isRed(5, 5)).toBe(true);
    expect(isRed(8, 8)).toBe(true);
  });
});
