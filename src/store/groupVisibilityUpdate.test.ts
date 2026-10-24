/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 验证组可见性切换是否触发了正确的状态更新链路。
 */
import { describe, expect, it, afterEach } from 'vitest';
import { useEditorStore } from './index';

function store() {
  return useEditorStore.getState();
}

describe('组可见性的状态更新链路', () => {
  afterEach(() => {
    store().closeDoc();
  });

  it('updateLayer 确实修改了 layers 数组的引用', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '测试' });
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');

    const layersBefore = store().layers;
    store().updateLayer(group.id, { visible: false });
    const layersAfter = store().layers;

    // updateLayer 应该返回新数组，不是原地修改
    expect(layersAfter).not.toBe(layersBefore);
    // 但内容确实变了
    expect(layersAfter.find((l) => l.id === group.id)?.visible).toBe(false);
  });

  it('切换组可见性同时自增 revision 和修改 layers', () => {
    store().createDoc({ width: 16, height: 16, background: 'white', name: '测试' });
    const group = store().addGroup('组');
    if (!group) throw new Error('组创建失败');

    const revisionBefore = store().revision;
    const layersBefore = store().layers;

    store().updateLayer(group.id, { visible: false });

    // 两个都应该变
    expect(store().revision).toBeGreaterThan(revisionBefore);
    expect(store().layers).not.toBe(layersBefore);
  });
});
