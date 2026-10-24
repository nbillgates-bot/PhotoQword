/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from '../tools/moveTool';
import { context, pointer, reset, store } from '../tools/testKit';
import { ctx2d } from '../engine/canvasUtils';
import { createTransformState } from '../engine/transformBox';
import { rectSelection } from '../engine/selection';
import type { Rect } from '../types';

/**
 * 「先用移动工具挪选区、再自由变换」这条链路。
 *
 * 用户实际操作是连着做的：拖走方块 → Ctrl+T → 拖变换框 → 回车 → 再拖。
 * 每一步都可能把方块底下的原始背景弄丢，所以按整条链路测，
 * 只测单个函数抓不到跨步骤的状态交接问题。
 */

/** 蓝底文档 + 原位一块红方块，红方块就是待搬运的目标 */
function docWithRedBlock(block: Rect): void {
  store().createDoc({ name: '测试', width: 64, height: 64, background: 'white' });
  const canvas = store().activeLayer()!.canvas;
  const context2d = ctx2d(canvas);
  context2d.fillStyle = '#0000ff';
  context2d.fillRect(0, 0, 64, 64);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(block.x, block.y, block.width, block.height);
  store().bumpRevision();
  store().pushHistory('绘制');
}

function selectRect(rect: Rect): void {
  store().setSelection(rectSelection(64, 64, rect, { feather: 0 }));
}

/** 按文档坐标读活动图层像素，自动换算图层偏移 */
function docPixel(x: number, y: number): number[] {
  const layer = store().activeLayer()!;
  const lx = x - layer.bounds.x;
  const ly = y - layer.bounds.y;
  if (lx < 0 || ly < 0 || lx >= layer.canvas.width || ly >= layer.canvas.height) {
    return [0, 0, 0, 0];
  }
  return [...ctx2d(layer.canvas).getImageData(lx, ly, 1, 1).data];
}

const isRed = (x: number, y: number) => docPixel(x, y)[0] > 200 && docPixel(x, y)[3] > 200;
const isBlue = (x: number, y: number) => docPixel(x, y)[2] > 200 && docPixel(x, y)[3] > 200;
const isClear = (x: number, y: number) => docPixel(x, y)[3] < 20;

/** 用移动工具把选区内容从 from 拖到 to（走完按下-移动-抬起） */
function dragSelection(from: { x: number; y: number }, to: { x: number; y: number }): void {
  const ctx = context();
  moveTool.onPointerDown?.(pointer(from.x, from.y), ctx);
  moveTool.onPointerMove?.(pointer(to.x, to.y), ctx);
  moveTool.onPointerUp?.(pointer(to.x, to.y), ctx);
}

beforeEach(() => {
  reset(moveTool);
  store().cancelTransform();
});

describe('移动选区后自由变换', () => {
  /*
   * 方块搬到新位置时会盖掉那里原有的蓝底，那份蓝底只剩 pristine 一个备份。
   * 变换预览若再按当前选区挖一次，备份也被挖穿，表现就是「方块后面的背景变透明」。
   */
  it('变换预览时，方块原来盖住的地方露出原始背景', () => {
    docWithRedBlock({ x: 8, y: 8, width: 12, height: 12 });
    selectRect({ x: 8, y: 8, width: 12, height: 12 });

    // 把红方块从 (8,8) 拖到 (32,32)，盖掉那里的蓝底
    dragSelection({ x: 14, y: 14 }, { x: 38, y: 38 });
    expect(isRed(38, 38)).toBe(true);

    // Ctrl+T 后把框拖到 (48,8)
    store().beginTransform();
    store().updateTransform(createTransformState({ x: 48, y: 8, width: 12, height: 12 }));

    // 方块走了，(32,32) 该露出原本的蓝底而不是透明
    expect(isBlue(38, 38)).toBe(true);
    // 最初的位置是洞：方块本来就是从那儿搬走的
    expect(isClear(14, 14)).toBe(true);
    // 方块落在新框里
    expect(isRed(54, 14)).toBe(true);
  });

  /*
   * 确认之后像素已经画进图层，浮动状态若就此丢掉，
   * 用户再拖动会重新 extractSelection，把方块连同它底下刚保住的蓝底一起剪走
   * —— 背景第二次被挖空。确认时要把结果交回浮动选区。
   */
  it('确认变换后再移动，方块底下仍是原始背景', () => {
    docWithRedBlock({ x: 8, y: 8, width: 12, height: 12 });
    selectRect({ x: 8, y: 8, width: 12, height: 12 });

    dragSelection({ x: 14, y: 14 }, { x: 38, y: 38 });
    store().beginTransform();
    store().updateTransform(createTransformState({ x: 32, y: 32, width: 12, height: 12 }));
    store().commitTransform();

    // 确认后方块在 (32,32)
    expect(isRed(38, 38)).toBe(true);

    // 接着把它拖到 (48,48)
    dragSelection({ x: 38, y: 38 }, { x: 54, y: 54 });

    // 关键断言：(32,32) 该露出蓝底，不是被挖空
    expect(isBlue(38, 38)).toBe(true);
    expect(isRed(54, 54)).toBe(true);
  });

  it('确认变换后再移动，不会把整层位置带偏', () => {
    docWithRedBlock({ x: 8, y: 8, width: 12, height: 12 });
    selectRect({ x: 8, y: 8, width: 12, height: 12 });

    dragSelection({ x: 14, y: 14 }, { x: 38, y: 38 });
    store().beginTransform();
    store().updateTransform(createTransformState({ x: 32, y: 32, width: 12, height: 12 }));
    store().commitTransform();

    dragSelection({ x: 38, y: 38 }, { x: 54, y: 54 });

    // 远处没被任何一步碰过的角落必须还是蓝底，位置没整体平移
    expect(isBlue(2, 60)).toBe(true);
    expect(isBlue(60, 2)).toBe(true);
  });
});
