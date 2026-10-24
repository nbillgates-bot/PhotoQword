/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';
import { createTransformState } from '../engine/transformBox';
import { rectSelection } from '../engine/selection';
import type { Rect } from '../types';

/**
 * 有选区时的自由变换。PS 的行为：Ctrl+T 只变换选区内的像素，
 * 框贴着选区外接矩形，选区外的背景不动，确认后选区跟着变换结果走。
 */
const store = () => useEditorStore.getState();

const setRect = (rect: Rect) => store().updateTransform(createTransformState(rect));

function newDoc(width = 64, height = 64) {
  store().createDoc({ width, height, background: 'transparent', name: '测试' });
}

/** 整层铺红，方便观察哪块被挖走、哪块留着 */
function fillRed() {
  const layer = store().activeLayer()!;
  const context = ctx2d(layer.canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
  store().bumpRevision();
}

/** 在指定位置画蓝块，用于区分背景与变换的像素 */
function paintBlue(x: number, y: number, w: number, h: number) {
  const layer = store().activeLayer()!;
  const context = ctx2d(layer.canvas);
  context.fillStyle = '#0000ff';
  context.fillRect(x, y, w, h);
  store().bumpRevision();
}

/** 记一条历史，让撤销能回到当前状态 */
function commitPaint() {
  store().pushHistory('绘制');
}

/** 按文档坐标取活动图层的像素，自动换算图层偏移 */
function docPixel(x: number, y: number): number[] {
  const layer = store().activeLayer()!;
  const lx = x - layer.bounds.x;
  const ly = y - layer.bounds.y;
  if (lx < 0 || ly < 0 || lx >= layer.canvas.width || ly >= layer.canvas.height) {
    return [0, 0, 0, 0];
  }
  return Array.from(ctx2d(layer.canvas).getImageData(lx, ly, 1, 1).data);
}

const isRed = (x: number, y: number) => docPixel(x, y)[0] > 200 && docPixel(x, y)[3] > 200;
const isBlue = (x: number, y: number) => docPixel(x, y)[2] > 200 && docPixel(x, y)[3] > 200;
const isClear = (x: number, y: number) => docPixel(x, y)[3] < 20;

function selectRect(rect: Rect, feather = 0) {
  const { doc } = store();
  store().setSelection(rectSelection(doc!.width, doc!.height, rect, { feather }));
}

beforeEach(() => {
  store().closeDoc();
  store().cancelTransform();
});

describe('beginTransform 有选区时', () => {
  it('变换框贴着选区外接矩形，不是整层内容', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 20, height: 12 });
    store().beginTransform();

    const session = store().transformSession!;
    // 整层都是红的，若不认选区框就会是整幅 64×64
    expect(session.originalRect).toEqual({ x: 16, y: 16, width: 20, height: 12 });
    expect(session.state.rect).toEqual({ x: 16, y: 16, width: 20, height: 12 });
  });

  it('快照只装选区内的像素', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 20, height: 12 });
    store().beginTransform();

    const { origin } = store().transformSession!;
    expect(origin.width).toBe(20);
    expect(origin.height).toBe(12);
    expect(ctx2d(origin).getImageData(2, 2, 1, 1).data[0]).toBeGreaterThan(200);
  });

  it('存了背景快照，且背景在选区处挖空', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 20, height: 12 });
    store().beginTransform();

    const { background } = store().transformSession!;
    expect(background).toBeDefined();
    const bg = ctx2d(background!);
    // 选区内该是透明
    expect(bg.getImageData(20, 20, 1, 1).data[3]).toBeLessThan(20);
    // 选区外该还是红的
    expect(bg.getImageData(4, 4, 1, 1).data[3]).toBeGreaterThan(200);
  });

  /*
   * PS 里对文字/形状层做局部变换要先栅格化。我们不替用户做这个不可逆的决定，
   * 退回整层变换——所以矢量层即使有选区也不该走选区分支。
   */
  it('文字层忽略选区，退回整层变换', () => {
    newDoc();
    const layer = store().activeLayer()!;
    store().updateLayer(layer.id, {
      textData: {
        content: '字',
        x: 0,
        y: 10,
        fontSize: 12,
        fontFamily: 'sans-serif',
        fontWeight: 400,
        color: '#000',
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    });
    fillRed();
    selectRect({ x: 16, y: 16, width: 20, height: 12 });
    store().beginTransform();

    const session = store().transformSession!;
    expect(session.background).toBeUndefined();
    // 整层都是红的，框该贴着整幅内容
    expect(session.originalRect).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });

  it('无选区时行为不变，不走选区分支', () => {
    newDoc();
    fillRed();
    store().beginTransform();

    expect(store().transformSession!.background).toBeUndefined();
  });
});

describe('预览：背景不跟着动', () => {
  /*
   * 这一条是这次改动的核心。原来预览调 renderTransformed 会先清空整张画布，
   * 表现就是拖动选区时整个图层只剩被变换的那一块，其余全没了。
   */
  it('拖动选区时选区外的像素原地不动', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    // 把选区那块整体右移 24
    setRect({ x: 40, y: 16, width: 16, height: 16 });

    // 选区外远处仍是红的
    expect(isRed(4, 4)).toBe(true);
    expect(isRed(60, 60)).toBe(true);
    // 原选区位置被挖空了
    expect(isClear(20, 20)).toBe(true);
    // 新位置有像素
    expect(isRed(44, 20)).toBe(true);
  });

  /*
   * 背景铺红、选区内涂蓝，这样才分得清「背景」和「被搬走的像素」。
   * 整层同色的话中间站残影和背景一个颜色，断言看不出区别。
   */
  it('反复拖动不累积，最终位置只由当前矩形决定', () => {
    newDoc();
    fillRed();
    paintBlue(16, 16, 16, 16);
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    setRect({ x: 30, y: 16, width: 16, height: 16 });
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    setRect({ x: 40, y: 16, width: 16, height: 16 });

    // 中间那一站不该留下蓝色残影
    expect(isBlue(34, 20)).toBe(false);
    // 最终位置是蓝的
    expect(isBlue(44, 20)).toBe(true);
    // 原位置被挖空了
    expect(isClear(20, 20)).toBe(true);
  });
});

describe('commitTransform 有选区时', () => {
  it('确认后背景与变换结果都在', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    store().commitTransform();

    expect(isRed(4, 4)).toBe(true);
    expect(isRed(44, 20)).toBe(true);
    expect(isClear(20, 20)).toBe(true);
  });

  it('缩小选区内容后，选区跟着缩到结果上', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 32, height: 32 });
    store().beginTransform();
    // 缩到一半，落在 16,16 - 32,32
    setRect({ x: 16, y: 16, width: 16, height: 16 });
    store().commitTransform();

    const selection = store().selection!;
    expect(selection).not.toBeNull();
    // 允许插值带来 1px 的误差，但不能还停在 32×32
    expect(selection.bounds.width).toBeLessThanOrEqual(17);
    expect(selection.bounds.height).toBeLessThanOrEqual(17);
    expect(selection.bounds.width).toBeGreaterThanOrEqual(15);
    expect(selection.bounds.x).toBeGreaterThanOrEqual(15);
    expect(selection.bounds.x).toBeLessThanOrEqual(17);
  });

  it('移动选区内容后，选区跟到新位置', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    store().commitTransform();

    const { bounds } = store().selection!;
    expect(bounds.x).toBeGreaterThanOrEqual(39);
    expect(bounds.x).toBeLessThanOrEqual(41);
    expect(bounds.y).toBeGreaterThanOrEqual(15);
    expect(bounds.y).toBeLessThanOrEqual(17);
  });

  it('把选区变换到文档外时选区清空', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    // 整块推到文档右边界之外
    setRect({ x: 200, y: 200, width: 16, height: 16 });
    store().commitTransform();

    expect(store().selection).toBeNull();
  });

  it('放大到出界时画布长大装下结果，不丢像素', () => {
    newDoc(32, 32);
    fillRed();
    selectRect({ x: 8, y: 8, width: 16, height: 16 });
    store().beginTransform();
    // 往右下放大出画布
    setRect({ x: 8, y: 8, width: 48, height: 48 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    // 结果右下角在 56,56，画布必须覆盖到那里
    expect(layer.bounds.x + layer.canvas.width).toBeGreaterThanOrEqual(56);
    expect(layer.bounds.y + layer.canvas.height).toBeGreaterThanOrEqual(56);
    expect(isRed(50, 50)).toBe(true);
    // 背景也还在
    expect(isRed(2, 2)).toBe(true);
  });

  it('确认后写了一条历史，可以撤销回去', () => {
    newDoc();
    fillRed();
    paintBlue(16, 16, 16, 16);
    commitPaint(); // 记一条历史，撤销才有快照可回
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    store().commitTransform();

    // commit 后新位置有蓝块，原位置被挖空（背景已清除选区）
    expect(isBlue(44, 20)).toBe(true);
    expect(isClear(20, 20)).toBe(true);

    expect(store().canUndo()).toBe(true);
    store().undo();
    // 撤销后原位置的蓝色回来了，新位置回到红背景
    expect(isBlue(20, 20)).toBe(true);
    expect(isRed(44, 20)).toBe(true);
  });

  it('像素运算不产生 NaN', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 }, 3);
    store().beginTransform();
    setRect({ x: 30, y: 20, width: 24, height: 10 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    const { data } = ctx2d(layer.canvas).getImageData(
      0,
      0,
      layer.canvas.width,
      layer.canvas.height,
    );
    expect(Array.from(data).some((value) => Number.isNaN(value))).toBe(false);
  });
});

describe('cancelTransform 有选区时', () => {
  it('取消后像素完全还原', () => {
    newDoc();
    fillRed();
    paintBlue(16, 16, 16, 16);
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    store().beginTransform();
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    // 此时原位置已经空了
    expect(isClear(20, 20)).toBe(true);

    store().cancelTransform();

    // 原位置的蓝色必须回来，新位置不该留东西
    expect(isBlue(20, 20)).toBe(true);
    expect(isRed(4, 4)).toBe(true);
    expect(isBlue(44, 20)).toBe(false);
  });

  /*
   * 羽化选区提取时按强度拆过 alpha，靠「背景 + origin」重合成会有舍入误差。
   * 所以 session 存了整张画布的快照，取消必须一模一样地还原。
   */
  it('羽化选区取消后 alpha 精确还原', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 24, height: 24 }, 4);
    const layer = store().activeLayer()!;
    const before = Array.from(
      ctx2d(layer.canvas).getImageData(0, 0, layer.canvas.width, layer.canvas.height).data,
    );

    store().beginTransform();
    setRect({ x: 40, y: 20, width: 12, height: 30 });
    store().cancelTransform();

    const after = Array.from(
      ctx2d(store().activeLayer()!.canvas).getImageData(
        0,
        0,
        layer.canvas.width,
        layer.canvas.height,
      ).data,
    );
    expect(after).toEqual(before);
  });

  it('取消不动选区', () => {
    newDoc();
    fillRed();
    selectRect({ x: 16, y: 16, width: 16, height: 16 });
    const before = store().selection!.bounds;
    store().beginTransform();
    setRect({ x: 40, y: 16, width: 16, height: 16 });
    store().cancelTransform();

    expect(store().selection!.bounds).toEqual(before);
  });
});
