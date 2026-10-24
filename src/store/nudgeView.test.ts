/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { MAX_ZOOM, MIN_ZOOM } from './viewSlice';

/**
 * nudgeView 的契约：把一帧攒下的视图变化一次写完，结果必须与
 * 「逐个调 setZoom / panBy」等价——合并只该省掉中间的重渲染，不该改变落点。
 */

const store = () => useEditorStore.getState();

beforeEach(() => {
  store().closeDoc();
  store().createDoc({ name: '测试', width: 800, height: 600, background: 'white' });
  store().setViewportSize({ width: 400, height: 300 });
});

describe('nudgeView', () => {
  it('倍率为 1、平移为 0 时什么都不变', () => {
    const before = { zoom: store().zoom, panX: store().panX, panY: store().panY };
    store().nudgeView({ zoomFactor: 1, panX: 0, panY: 0, focus: null });
    expect(store().zoom).toBe(before.zoom);
    expect(store().panX).toBe(before.panX);
    expect(store().panY).toBe(before.panY);
  });

  it('纯缩放：累乘倍率等于直接设到目标 zoom', () => {
    const start = store().zoom;
    store().nudgeView({ zoomFactor: 2, panX: 0, panY: 0, focus: null });
    expect(store().zoom).toBeCloseTo(start * 2, 6);
  });

  it('一次合并倍率 与 分两次同焦点缩放 落点一致', () => {
    const focus = { x: 120, y: 90 };

    store().nudgeView({ zoomFactor: 1.12, panX: 0, panY: 0, focus });
    store().nudgeView({ zoomFactor: 1.12, panX: 0, panY: 0, focus });
    const stepwise = { zoom: store().zoom, panX: store().panX, panY: store().panY };

    // 回到初始态，用合并后的倍率走一次
    store().setZoom(1);
    store().setPan(0, 0);
    store().nudgeView({ zoomFactor: 1.12 * 1.12, panX: 0, panY: 0, focus });

    expect(store().zoom).toBeCloseTo(stepwise.zoom, 6);
    expect(store().panX).toBeCloseTo(stepwise.panX, 6);
    expect(store().panY).toBeCloseTo(stepwise.panY, 6);
  });

  it('纯平移与 panBy 等价', () => {
    store().setZoom(4); // 放大到文档比视口大，pan 才有活动范围
    const viaPanBy = (() => {
      store().setPan(0, 0);
      store().panBy(-30, -20);
      return { x: store().panX, y: store().panY };
    })();

    store().setPan(0, 0);
    store().nudgeView({ zoomFactor: 1, panX: -30, panY: -20, focus: null });
    expect(store().panX).toBeCloseTo(viaPanBy.x, 6);
    expect(store().panY).toBeCloseTo(viaPanBy.y, 6);
  });

  it('zoom 被夹在合法区间内', () => {
    store().nudgeView({ zoomFactor: 1e6, panX: 0, panY: 0, focus: null });
    expect(store().zoom).toBe(MAX_ZOOM);
    store().nudgeView({ zoomFactor: 1e-9, panX: 0, panY: 0, focus: null });
    expect(store().zoom).toBe(MIN_ZOOM);
  });

  it('pan 被夹在合法范围内，不会把内容拖出视口', () => {
    store().setZoom(1); // 文档 800×600 在 400×300 视口里，zoom=1 时 pan 上限有限
    store().nudgeView({ zoomFactor: 1, panX: 99999, panY: 99999, focus: null });
    // 上限 = (docLen*zoom - viewportLen)/2，这里是 (800-400)/2 = 200
    expect(store().panX).toBeLessThanOrEqual(200);
    expect(store().panY).toBeLessThanOrEqual(150);
  });

  it('缩放与平移同帧时，平移叠在缩放之后（结果不出 NaN）', () => {
    store().nudgeView({ zoomFactor: 2, panX: 15, panY: -10, focus: { x: 200, y: 150 } });
    expect(Number.isNaN(store().zoom)).toBe(false);
    expect(Number.isNaN(store().panX)).toBe(false);
    expect(Number.isNaN(store().panY)).toBe(false);
  });

  it('没有文档时不动状态', () => {
    store().closeDoc();
    store().nudgeView({ zoomFactor: 2, panX: 10, panY: 10, focus: null });
    expect(store().doc).toBeNull();
  });
});

describe('setViewInteracting', () => {
  it('默认不在交互中', () => {
    expect(store().viewInteracting).toBe(false);
  });

  it('能置位与复位', () => {
    store().setViewInteracting(true);
    expect(store().viewInteracting).toBe(true);
    store().setViewInteracting(false);
    expect(store().viewInteracting).toBe(false);
  });

  it('重复设成同一个值不产生新状态对象（避免白重渲染）', () => {
    store().setViewInteracting(true);
    const snapshot = useEditorStore.getState();
    store().setViewInteracting(true);
    expect(useEditorStore.getState()).toBe(snapshot);
  });
});
