/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { documentOrigin, panLimit } from '../engine/viewportRect';
import { MAX_ZOOM, MIN_ZOOM } from './viewSlice';

/**
 * 视图平移与缩放的边界。
 *
 * 盯的是两个曾经出过的问题：
 * 1. 锚点缩放漏了居中项，大文档在低缩放下一格滚轮就把视图甩出文档之外，
 *    表现为"缩放没反应"；
 * 2. pan 完全不设上限，滚出去就回不来。
 */

const store = () => useEditorStore.getState();

/** 用户那份长图的尺寸，也是暴露过 bug 的那组数 */
const TALL = { width: 790, height: 14235 };
const VIEW = { width: 800, height: 600 };

function tallDoc() {
  store().createDoc({ ...TALL, background: 'white', name: '长图' });
  store().setViewportSize(VIEW);
}

beforeEach(() => {
  store().closeDoc();
  store().setViewportSize({ width: 0, height: 0 });
});

describe('pan 边界', () => {
  it('纵向滚不出文档：夹在边缘对齐处', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 99999);
    expect(store().panY).toBeCloseTo(panLimit(VIEW.height, TALL.height, 1), 6);
  });

  it('反方向同样夹住', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, -99999);
    expect(store().panY).toBeCloseTo(-panLimit(VIEW.height, TALL.height, 1), 6);
  });

  it('文档比视口窄时横向锁死居中', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(500, 0);
    expect(store().panX).toBe(0);
  });

  it('范围内平移照常生效', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 200);
    expect(store().panY).toBe(200);
  });

  it('setPan 也走同一套边界', () => {
    tallDoc();
    store().setZoom(1);
    store().setPan(0, 99999);
    expect(store().panY).toBeLessThanOrEqual(panLimit(VIEW.height, TALL.height, 1) + 1e-6);
  });

  it('缩小后上限变小，原来合法的 pan 被重新夹住', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 6000);
    // 缩到文档整体比视口小，pan 必须归零
    store().setZoom(0.02);
    expect(store().panY).toBe(0);
  });

  it('视口变大后 pan 跟着重夹', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 6800);
    store().setViewportSize({ width: 800, height: 14000 });
    expect(store().panY).toBeCloseTo(panLimit(14000, TALL.height, 1), 6);
  });

  it('没有文档时不夹，也不报错', () => {
    store().setViewportSize(VIEW);
    expect(() => store().panBy(500, 500)).not.toThrow();
  });

  it('pan 不产出 NaN', () => {
    tallDoc();
    store().setZoom(0.08);
    store().panBy(0, 1234);
    expect(Number.isNaN(store().panX)).toBe(false);
    expect(Number.isNaN(store().panY)).toBe(false);
  });
});

/** 焦点处当前对应的文档点，读的是 store 的实时状态 */
function docPointUnder(focus: { x: number; y: number }) {
  const { zoom, panX, panY, doc } = store();
  const origin = documentOrigin({
    viewport: store().viewportSize,
    docWidth: doc!.width,
    docHeight: doc!.height,
    zoom,
    panX,
    panY,
  });
  return { x: (focus.x - origin.x) / zoom, y: (focus.y - origin.y) / zoom };
}

describe('以光标为基点缩放', () => {
  it('焦点下的文档点缩放后不动', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 300);
    const focus = { x: 400, y: 120 };
    const before = docPointUnder(focus);
    store().setZoom(store().zoom * 1.12, focus);
    const after = docPointUnder(focus);
    expect(after.y).toBeCloseTo(before.y, 4);
  });

  it('连续放大十格，锚点一直不漂', () => {
    tallDoc();
    store().setZoom(1);
    const focus = { x: 400, y: 500 };
    const target = docPointUnder(focus);
    for (let i = 0; i < 10; i++) {
      store().setZoom(store().zoom * 1.12, focus);
      expect(docPointUnder(focus).y).toBeCloseTo(target.y, 3);
    }
  });

  it('低缩放下放大不会把视图甩出文档', () => {
    tallDoc();
    store().setZoom(0.08);
    store().setZoom(store().zoom * 1.12, { x: 400, y: 300 });
    const point = docPointUnder({ x: 400, y: 300 });
    // 曾经的 bug：漏掉居中项，这里会算出七千多，落到文档另一半的空白处
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(TALL.height);
  });

  it('不给焦点时以视口中心为基点', () => {
    tallDoc();
    store().setZoom(1);
    store().panBy(0, 400);
    const center = { x: VIEW.width / 2, y: VIEW.height / 2 };
    const before = docPointUnder(center);
    store().zoomIn();
    expect(docPointUnder(center).y).toBeCloseTo(before.y, 3);
  });

  it('缩放仍夹在 MIN/MAX 之间', () => {
    tallDoc();
    store().setZoom(999);
    expect(store().zoom).toBeLessThanOrEqual(MAX_ZOOM);
    store().setZoom(0.0001);
    expect(store().zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it('没有文档时缩放只改比例，不碰 pan', () => {
    store().setViewportSize(VIEW);
    store().setZoom(2);
    expect(store().zoom).toBe(2);
  });
});
