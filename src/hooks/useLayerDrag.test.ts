/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useLayerDrag } from './useLayerDrag';
import { renderHookWithValue } from './testHookKit';
import { useEditorStore } from '../store';

const store = () => useEditorStore.getState();
type Drag = ReturnType<typeof useLayerDrag>;

function newDoc(): string {
  store().createDoc({ name: '测试', width: 4, height: 4, background: 'white' });
  return store().layers[0].id;
}

function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

/** 自下而上的图层 id，等同于图层栈顺序 */
const ids = () => store().layers.map((layer) => layer.id);

beforeEach(() => {
  store().closeDoc();
});

describe('useLayerDrag', () => {
  it('开始拖时把 id 写进 store，垃圾桶那边才看得到', () => {
    newDoc();
    const a = addLayer();
    const probe = renderHookWithValue<Drag>(() => useLayerDrag());

    probe.last().handlers.onDragStart(a);
    probe.rerender();

    expect(store().draggingLayerId).toBe(a);
    expect(probe.last().draggingId).toBe(a);
    probe.unmount();
  });

  it('这一组回调要恒定，否则每行的 memo 全废', () => {
    newDoc();
    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    const first = probe.last().handlers;

    probe.rerender();

    expect(probe.last().handlers).toBe(first);
    probe.unmount();
  });

  /*
   * 面板是倒序显示的：视觉上「放到 A 上方」等于栈里排到 A 之后。
   * 这个换算错了会表现成拖动方向和结果相反，必须有测试守住。
   */
  it('拖到某层上方 = 栈里排到它之后', () => {
    const bg = newDoc();
    const a = addLayer();
    const b = addLayer();
    expect(ids()).toEqual([bg, a, b]);

    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(bg);
    probe.rerender();
    probe.last().handlers.onDragOver(a, 'before');
    probe.rerender();
    probe.last().applyDrop();

    expect(ids()).toEqual([a, bg, b]);
    probe.unmount();
  });

  it('拖到某层下方 = 栈里排到它之前', () => {
    const bg = newDoc();
    const a = addLayer();
    const b = addLayer();

    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(b);
    probe.rerender();
    probe.last().handlers.onDragOver(a, 'after');
    probe.rerender();
    probe.last().applyDrop();

    expect(ids()).toEqual([bg, b, a]);
    probe.unmount();
  });

  it('拖到自己身上什么都不做，并收掉拖拽状态', () => {
    const bg = newDoc();
    const a = addLayer();

    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(a);
    probe.rerender();
    probe.last().handlers.onDragOver(a, 'before');
    probe.rerender();
    probe.last().applyDrop();

    expect(ids()).toEqual([bg, a]);
    expect(store().draggingLayerId).toBeNull();
    probe.unmount();
  });

  it('没有落点时松手：只收状态，不动顺序', () => {
    const bg = newDoc();
    const a = addLayer();

    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(a);
    probe.rerender();
    probe.last().applyDrop();

    expect(ids()).toEqual([bg, a]);
    expect(store().draggingLayerId).toBeNull();
    probe.unmount();
  });
});

/*
 * PS 里按住 Alt 拖动 = 复制一份落过去，原图层留在原处。
 * 是否复制看松手那一刻的 Alt，所以这里由 applyDrop 的参数传入。
 */
describe('useLayerDrag 的 Alt 复制', () => {
  /** 拖 from、落在 to 的 position 侧，copy 决定是否复制 */
  function drag(from: string, to: string, position: 'before' | 'after', copy: boolean) {
    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(from);
    probe.rerender();
    probe.last().handlers.onDragOver(to, position);
    probe.rerender();
    probe.last().applyDrop(copy);
    probe.unmount();
  }

  it('Alt 拖动留下原图层，副本落到落点上', () => {
    const bg = newDoc();
    const a = addLayer();

    drag(bg, a, 'before', true);

    // 原来的 bg 还在最底，副本插到 a 之后（视觉上是 a 上方）
    const after = ids();
    expect(after).toHaveLength(3);
    expect(after[0]).toBe(bg);
    expect(after[1]).toBe(a);
    expect(after[2]).not.toBe(bg);
  });

  it('Alt 复制只记一条历史', () => {
    const bg = newDoc();
    const a = addLayer();
    const before = ids();

    drag(bg, a, 'before', true);
    store().undo();

    expect(ids()).toEqual(before);
  });

  it('Alt 拖到自己身上也复制一份（普通拖动才是空操作）', () => {
    newDoc();
    const a = addLayer();

    drag(a, a, 'before', true);

    expect(ids()).toHaveLength(3);
    expect(store().draggingLayerId).toBeNull();
  });

  it('不按 Alt 还是移动，图层总数不变', () => {
    const bg = newDoc();
    const a = addLayer();

    drag(bg, a, 'before', false);

    expect(ids()).toEqual([a, bg]);
  });

  it('拖到末尾空白处按住 Alt 也复制', () => {
    const bg = newDoc();
    const a = addLayer();

    const probe = renderHookWithValue<Drag>(() => useLayerDrag());
    probe.last().handlers.onDragStart(a);
    probe.rerender();
    probe.last().dropToRoot(true);
    probe.unmount();

    const after = ids();
    expect(after).toHaveLength(3);
    // 落到最外层最底 = 数组下标 0
    expect(after[1]).toBe(bg);
    expect(after[2]).toBe(a);
  });
});
