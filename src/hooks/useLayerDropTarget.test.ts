/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { DragEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayerDropTarget } from './useLayerDropTarget';
import { renderHookWithValue } from './testHookKit';
import { useEditorStore } from '../store';

const store = () => useEditorStore.getState();
type Target = ReturnType<typeof useLayerDropTarget>;

/** 造一个够用的假 DragEvent：只有 dataTransfer 和 preventDefault 被读到 */
function fakeEvent() {
  const dataTransfer = { dropEffect: '' as string };
  return {
    dataTransfer,
    preventDefault: vi.fn(),
  } as unknown as DragEvent<HTMLElement> & { dataTransfer: typeof dataTransfer };
}

function newDoc(): string {
  store().createDoc({ name: '测试', width: 4, height: 4, background: 'white' });
  return store().layers[0].id;
}

beforeEach(() => {
  store().closeDoc();
});

describe('useLayerDropTarget', () => {
  it('没有图层在拖时不接受落点', () => {
    newDoc();
    const action = vi.fn();
    const probe = renderHookWithValue<Target>(() => useLayerDropTarget(action));
    const event = fakeEvent();

    probe.last().props.onDragOver(event);

    // 不 preventDefault 就等于告诉浏览器「这里不是落点」
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(probe.last().hot).toBe(false);
    probe.unmount();
  });

  it('拖拽中悬停会接受落点并高亮', () => {
    const bg = newDoc();
    const probe = renderHookWithValue<Target>(() => useLayerDropTarget(vi.fn()));
    store().beginLayerDrag(bg);
    probe.rerender();

    const event = fakeEvent();
    probe.last().props.onDragOver(event);
    probe.rerender();

    expect(event.preventDefault).toHaveBeenCalled();
    expect(probe.last().hot).toBe(true);
    expect(probe.last().dragging).toBe(true);
    probe.unmount();
  });

  /*
   * dropEffect 决定浏览器画哪种光标，是拖拽反馈唯一的来源。
   * 不设的话 Safari 会显示禁止光标，让人以为放不下去。
   */
  it('光标样式按落点语义走：默认移动，指定复制就是复制', () => {
    const bg = newDoc();
    const move = renderHookWithValue<Target>(() => useLayerDropTarget(vi.fn()));
    const copy = renderHookWithValue<Target>(() => useLayerDropTarget(vi.fn(), 'copy'));
    store().beginLayerDrag(bg);
    move.rerender();
    copy.rerender();

    const moveEvent = fakeEvent();
    const copyEvent = fakeEvent();
    move.last().props.onDragOver(moveEvent);
    copy.last().props.onDragOver(copyEvent);

    expect(moveEvent.dataTransfer.dropEffect).toBe('move');
    expect(copyEvent.dataTransfer.dropEffect).toBe('copy');
    move.unmount();
    copy.unmount();
  });

  it('松手时执行动作并撤掉高亮', () => {
    const bg = newDoc();
    const action = vi.fn();
    const probe = renderHookWithValue<Target>(() => useLayerDropTarget(action));
    store().beginLayerDrag(bg);
    probe.rerender();
    probe.last().props.onDragOver(fakeEvent());
    probe.rerender();

    probe.last().props.onDrop(fakeEvent());
    probe.rerender();

    expect(action).toHaveBeenCalledTimes(1);
    expect(probe.last().hot).toBe(false);
    probe.unmount();
  });

  it('指针移开就撤掉高亮', () => {
    const bg = newDoc();
    const probe = renderHookWithValue<Target>(() => useLayerDropTarget(vi.fn()));
    store().beginLayerDrag(bg);
    probe.rerender();
    probe.last().props.onDragOver(fakeEvent());
    probe.rerender();
    expect(probe.last().hot).toBe(true);

    probe.last().props.onDragLeave();
    probe.rerender();

    expect(probe.last().hot).toBe(false);
    probe.unmount();
  });
});
