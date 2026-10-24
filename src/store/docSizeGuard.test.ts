/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { maxCanvasArea, maxCanvasSide } from '../engine/canvasLimits';

const store = () => useEditorStore.getState();

/**
 * 尺寸上限的守卫。
 *
 * 为什么必须有：浏览器对超限画布是静默失败——返回空白画布，不抛异常。
 * 没有守卫时用户看到的是一片空白加干净的控制台，属于规约第七节禁止的静默失败。
 */

/** 一个铁定超限的尺寸：单边就越界 */
function oversizeSide(): number {
  return maxCanvasSide() + 1;
}

describe('createDoc 尺寸守卫', () => {
  it('超限尺寸被拒绝，且不创建文档', () => {
    store().closeDoc();
    store().createDoc({ name: '过大', width: oversizeSide(), height: 100, background: 'white' });
    expect(store().doc).toBeNull();
  });

  it('超限时给出错误提示，不静默失败', () => {
    store().closeDoc();
    store().createDoc({ name: '过大', width: oversizeSide(), height: 100, background: 'white' });
    expect(store().toast?.kind).toBe('error');
    expect(store().toast?.message).toBe('error.doc.cannotCreate');
  });

  it('合法尺寸照常创建', () => {
    store().closeDoc();
    store().createDoc({ name: '正常', width: 16, height: 16, background: 'white' });
    expect(store().doc?.width).toBe(16);
    expect(store().layers).toHaveLength(1);
  });

  it('0 与负数被拒（边界值）', () => {
    for (const size of [0, -1]) {
      store().closeDoc();
      store().createDoc({ name: '非法', width: size, height: 10, background: 'white' });
      expect(store().doc).toBeNull();
    }
  });

  it('1×1 允许（边界值，合法的最小文档）', () => {
    store().closeDoc();
    store().createDoc({ name: '最小', width: 1, height: 1, background: 'white' });
    expect(store().doc?.width).toBe(1);
  });
});

describe('resizeCanvasTo 尺寸守卫', () => {
  it('超限时拒绝并保持原尺寸不变', () => {
    store().closeDoc();
    store().createDoc({ name: '测试', width: 16, height: 16, background: 'white' });
    store().resizeCanvasTo(oversizeSide(), 16, 'center');

    expect(store().doc?.width).toBe(16);
    expect(store().toast?.kind).toBe('error');
  });

  it('合法尺寸照常调整', () => {
    store().closeDoc();
    store().createDoc({ name: '测试', width: 16, height: 16, background: 'white' });
    store().resizeCanvasTo(32, 24, 'center');
    expect(store().doc?.width).toBe(32);
    expect(store().doc?.height).toBe(24);
  });
});

describe('resizeImage 尺寸守卫', () => {
  it('超限时拒绝并保持原尺寸不变', () => {
    store().closeDoc();
    store().createDoc({ name: '测试', width: 16, height: 16, background: 'white' });
    store().resizeImage(oversizeSide(), 16);

    expect(store().doc?.width).toBe(16);
    expect(store().toast?.kind).toBe('error');
  });

  it('面积超限时也被拒（不只看单边）', () => {
    store().closeDoc();
    store().createDoc({ name: '测试', width: 16, height: 16, background: 'white' });

    // 构造单边合法、面积越界的尺寸
    const side = maxCanvasSide();
    const height = Math.min(side, Math.ceil(maxCanvasArea() / side) + 1);
    store().resizeImage(side, height);

    if (side * height > maxCanvasArea()) {
      expect(store().doc?.width).toBe(16);
      expect(store().toast?.kind).toBe('error');
    } else {
      // 探测到的单边太小，凑不出超面积尺寸；此时调整成功同样是正确结论
      expect(store().doc?.width).toBe(side);
    }
  });
});
