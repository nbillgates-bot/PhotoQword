/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 组可见性：点组的眼睛图标应该影响整棵子树的显示。
 *
 * PS 的行为：组的 visible = false 时，组内所有图层都不显示，
 * 即使子图层自己的 visible = true。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { createCanvas, ctx2d } from '../engine/canvasUtils';
import { composite } from '../engine/compositor';

function store() {
  return useEditorStore.getState();
}

describe('组可见性', () => {
  afterEach(() => {
    store().closeDoc();
  });

  it('组的 visible 属性能正常切换', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '组' });
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');
    expect(group.visible).toBe(true);

    store().updateLayer(group.id, { visible: false });
    expect(store().layers.find((l) => l.id === group.id)?.visible).toBe(false);

    store().updateLayer(group.id, { visible: true });
    expect(store().layers.find((l) => l.id === group.id)?.visible).toBe(true);
  });

  it('切换组可见性会自增 revision', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '组' });
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');
    const before = store().revision;

    store().updateLayer(group.id, { visible: false });
    expect(store().revision).toBeGreaterThan(before);
  });

  /**
   * 核心场景：组隐藏时，组内的子图层虽然自己 visible = true，
   * 但不应该出现在最终合成里。
   */
  it('组隐藏时子图层不显示，即使子图层自己 visible = true', () => {
    // 白底文档
    store().createDoc({ width: 16, height: 16, background: 'white', name: '组' });

    // 加个组，组里放一个黑色图层
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');
    const child = store().insertLayer('raster', '黑块');
    if (!child) throw new Error('子图层创建失败');

    // 把子图层移进组
    store().moveLayerTo(child.id, group.id, 0);
    expect(store().layers.find((l) => l.id === child.id)?.parentId).toBe(group.id);

    // 给子图层画满黑色
    const ctx = ctx2d(child.canvas);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 16, 16);
    store().bumpRevision();

    // 此时合成结果应该是全黑（黑色图层盖住白底）
    const doc = store().doc!;
    const result1Canvas = createCanvas(doc.width, doc.height);
    composite(ctx2d(result1Canvas), store().layers, doc.width, doc.height);
    const result1 = ctx2d(result1Canvas).getImageData(8, 8, 1, 1).data;
    expect(result1[0]).toBe(0); // R
    expect(result1[1]).toBe(0); // G
    expect(result1[2]).toBe(0); // B

    // 把组隐藏
    store().updateLayer(group.id, { visible: false });

    // 合成结果应该恢复成白底（子图层虽然自己 visible = true 但因为父组隐藏了所以不显示）
    const result2Canvas = createCanvas(doc.width, doc.height);
    composite(ctx2d(result2Canvas), store().layers, doc.width, doc.height);
    const result2 = ctx2d(result2Canvas).getImageData(8, 8, 1, 1).data;
    expect(result2[0]).toBe(255); // R
    expect(result2[1]).toBe(255); // G
    expect(result2[2]).toBe(255); // B
  });

  it('组显示时子图层正常显示', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '组' });
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');
    const child = store().insertLayer('raster', '黑块');
    if (!child) throw new Error('子图层创建失败');

    store().moveLayerTo(child.id, group.id, 0);
    const ctx = ctx2d(child.canvas);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 16, 16);
    store().bumpRevision();

    // 组和子图层都是 visible = true
    expect(group.visible).toBe(true);
    expect(store().layers.find((l) => l.id === child.id)?.visible).toBe(true);

    // 合成结果应该是全黑
    const doc = store().doc!;
    const resultCanvas = createCanvas(doc.width, doc.height);
    composite(ctx2d(resultCanvas), store().layers, doc.width, doc.height);
    const result = ctx2d(resultCanvas).getImageData(8, 8, 1, 1).data;
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
    expect(result[2]).toBe(0);
  });

  /**
   * 嵌套组：外层组隐藏时，整棵子树都不显示，
   * 即使内层组和孙子图层都是 visible = true。
   */
  it('嵌套组：外层组隐藏时整棵子树都不显示', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '嵌套' });
    const outer = store().addGroup('外层');
    const inner = store().addGroup('内层');
    if (!outer || !inner) throw new Error('组创建失败');
    const child = store().insertLayer('raster', '黑块');
    if (!child) throw new Error('子图层创建失败');

    // 内层组放进外层组
    store().moveLayerTo(inner.id, outer.id, 0);
    // 子图层放进内层组
    store().moveLayerTo(child.id, inner.id, 0);

    const ctx = ctx2d(child.canvas);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 16, 16);
    store().bumpRevision();

    // 所有图层都可见时应该是全黑
    const doc = store().doc!;
    const r1Canvas = createCanvas(doc.width, doc.height);
    composite(ctx2d(r1Canvas), store().layers, doc.width, doc.height);
    const r1 = ctx2d(r1Canvas).getImageData(8, 8, 1, 1).data;
    expect(r1[0]).toBe(0);

    // 隐藏外层组
    store().updateLayer(outer.id, { visible: false });

    // 合成结果应该恢复成白底
    const r2Canvas = createCanvas(doc.width, doc.height);
    composite(ctx2d(r2Canvas), store().layers, doc.width, doc.height);
    const r2 = ctx2d(r2Canvas).getImageData(8, 8, 1, 1).data;
    expect(r2[0]).toBe(255);
    expect(r2[1]).toBe(255);
    expect(r2[2]).toBe(255);
  });
});
