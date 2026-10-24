/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { moveTool } from './moveTool';
import { drag, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';

/**
 * 复现用户报的问题：图层被拖出画布后拖不回来。
 * 与 moveOffCanvas.test.ts 的区别是这里每次移动之间都有历史提交，
 * 且做连续多次拖动 —— 用户的实际操作路径就是这样。
 */

beforeEach(() => {
  reset(moveTool);
});

function isRed(x: number, y: number): boolean {
  const doc = store().doc!;
  const out = flatten(store().layers, doc.width, doc.height);
  const [r, g, , a] = [...ctx2d(out).getImageData(x, y, 1, 1).data];
  return a > 200 && r > 200 && g < 80;
}

function setup(): void {
  newDoc();
  store().addLayer('raster', '内容');
  const context2d = ctx2d(store().activeLayer()!.canvas);
  context2d.fillStyle = '#ff0000';
  context2d.fillRect(2, 2, 4, 4);
  store().bumpRevision();
  store().pushHistory('基线');
}

describe('拖出画布后拖回来', () => {
  it('完全拖出画布之后还能拖回来', () => {
    setup();
    // 16×16 文档，往右下推 40 格，图层整体远在画布之外
    drag(moveTool, pointer(3, 3), pointer(43, 43));
    expect(isRed(3, 3)).toBe(false);

    // 用户在画布上任意位置按下并往左上拖，图层应该跟着回来
    drag(moveTool, pointer(43, 43), pointer(3, 3));
    expect(isRed(3, 3)).toBe(true);
  });

  it('连续多次小步拖动，每次都生效', () => {
    setup();
    for (let i = 0; i < 4; i += 1) {
      drag(moveTool, pointer(3, 3), pointer(8, 3));
    }
    // 每次右移 5，共 20
    expect(store().activeLayer()!.bounds.x).toBe(20);
  });

  it('拖出去、提交历史、再拖回来，bounds 回到原点', () => {
    setup();
    drag(moveTool, pointer(3, 3), pointer(43, 43));
    expect(store().activeLayer()!.bounds.x).toBe(40);

    drag(moveTool, pointer(0, 0), pointer(-40, -40));
    expect(store().activeLayer()!.bounds.x).toBe(0);
    expect(isRed(3, 3)).toBe(true);
  });

  it('移动后图层对象仍是同一张画布，没有被历史重建掉', () => {
    setup();
    const before = store().activeLayer()!.canvas;
    drag(moveTool, pointer(3, 3), pointer(43, 43));
    expect(store().activeLayer()!.canvas).toBe(before);
  });
});
