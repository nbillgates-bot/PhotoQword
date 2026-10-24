/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useLayerRowHandlers, type LayerRowHandlers } from './useLayerRowHandlers';
import { renderHookWithValue } from './testHookKit';
import { useEditorStore } from '../store';

const store = () => useEditorStore.getState();

function newDoc(): string {
  store().createDoc({ name: '测试', width: 4, height: 4, background: 'white' });
  return store().layers[0].id;
}

beforeEach(() => {
  store().closeDoc();
});

describe('useLayerRowHandlers', () => {
  /*
   * 这一条是 LayerItem 上 memo 的前提：回调只要每次渲染都是新函数，
   * memo 就永远拦不住，选一下图层还是要重渲染全部行。
   */
  it('重渲染后整套回调的引用不变', () => {
    newDoc();
    const probe = renderHookWithValue<LayerRowHandlers>(() => useLayerRowHandlers());
    const first = probe.last();

    probe.rerender();
    probe.rerender();

    expect(probe.renders.length).toBeGreaterThan(1);
    expect(probe.last()).toBe(first);
    probe.unmount();
  });

  it('切换可见性作用在指定图层上', () => {
    const id = newDoc();
    const probe = renderHookWithValue<LayerRowHandlers>(() => useLayerRowHandlers());

    probe.last().onToggleVisible(id);

    expect(store().layers[0].visible).toBe(false);
    probe.unmount();
  });

  /*
   * 回调内部靠 getState() 现取状态，所以拿着旧引用调用也必须看到最新的图层。
   * 这是「引用恒定」这条设计的代价，必须有测试守住。
   */
  it('旧引用也读得到最新状态，不会停在挂载时的快照上', () => {
    const id = newDoc();
    const probe = renderHookWithValue<LayerRowHandlers>(() => useLayerRowHandlers());
    const handlers = probe.last();

    handlers.onToggleVisible(id);
    handlers.onToggleVisible(id);

    // 连按两次要回到可见，而不是两次都读到「原本可见」再都设成隐藏
    expect(store().layers[0].visible).toBe(true);
    probe.unmount();
  });

  it('图层已经被删掉时调用不抛错', () => {
    newDoc();
    const probe = renderHookWithValue<LayerRowHandlers>(() => useLayerRowHandlers());

    expect(() => probe.last().onToggleVisible('nope')).not.toThrow();
    expect(() => probe.last().onToggleLocked('nope')).not.toThrow();
    probe.unmount();
  });
});
