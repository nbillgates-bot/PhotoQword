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
import { contentRect } from '../engine/layerBounds';

/**
 * 图层边缘（视图 > 显示 > 图层边缘）：画活动图层内容范围的那一圈线。
 * 这里测开关状态与它依赖的 contentRect 在 store 里取到的值，
 * 画线本身是 LayerEdges 组件的事。
 */

const store = () => useEditorStore.getState();

beforeEach(() => {
  store().closeDoc();
});

describe('showLayerEdges', () => {
  it('默认关着：与 PS 一致，要看边缘得自己去菜单里开', () => {
    expect(store().showLayerEdges).toBe(false);
  });

  it('toggleLayerEdges 来回切换', () => {
    const initial = store().showLayerEdges;
    store().toggleLayerEdges();
    expect(store().showLayerEdges).toBe(!initial);
    store().toggleLayerEdges();
    expect(store().showLayerEdges).toBe(initial);
  });

  it('开关状态不受新建文档影响', () => {
    store().toggleLayerEdges();
    const flag = store().showLayerEdges;
    store().createDoc({ width: 8, height: 8, background: 'white', name: '边缘' });
    expect(store().showLayerEdges).toBe(flag);
  });
});

describe('活动图层的边缘范围', () => {
  it('框的是内容范围而不是画布范围', () => {
    store().createDoc({ width: 16, height: 16, background: 'transparent', name: '边缘' });
    const layer = store().activeLayer()!;
    const context = ctx2d(layer.canvas);
    context.fillStyle = '#00ff00';
    context.fillRect(3, 5, 4, 2);

    // 画布是 16×16，内容只有 (3,5,4,2)，PS 框后者
    expect(contentRect(layer)).toEqual({ x: 3, y: 5, width: 4, height: 2 });
  });

  it('图层移动后边缘跟着走到文档坐标', () => {
    store().createDoc({ width: 16, height: 16, background: 'transparent', name: '边缘' });
    const layer = store().activeLayer()!;
    ctx2d(layer.canvas).fillRect(0, 0, 2, 2);
    layer.bounds = { ...layer.bounds, x: 20, y: -4 };

    expect(contentRect(layer)).toEqual({ x: 20, y: -4, width: 2, height: 2 });
  });

  it('空图层没有边缘可画', () => {
    store().createDoc({ width: 8, height: 8, background: 'transparent', name: '边缘' });
    expect(contentRect(store().activeLayer()!)).toBeNull();
  });
});
