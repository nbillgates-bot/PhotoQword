/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { DragEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { layerRowDragProps } from './layerRowDrag';

/** 造一个够用的假 DragEvent：只有 dataTransfer、altKey 和行几何被读到 */
function fakeEvent(options: { altKey?: boolean; offsetY?: number; height?: number } = {}) {
  const { altKey = false, offsetY = 0, height = 40 } = options;
  const dataTransfer = {
    dropEffect: '' as string,
    effectAllowed: '' as string,
    setData: vi.fn(),
  };
  return {
    altKey,
    dataTransfer,
    preventDefault: vi.fn(),
    clientY: offsetY,
    currentTarget: { getBoundingClientRect: () => ({ top: 0, height }) },
  } as unknown as DragEvent<HTMLElement> & { dataTransfer: typeof dataTransfer };
}

function setup(overrides: { isGroup?: boolean; draggable?: boolean } = {}) {
  const handlers = {
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDragEnd: vi.fn(),
  };
  const onDrop = vi.fn();
  const props = layerRowDragProps({
    id: 'L1',
    isGroup: overrides.isGroup ?? false,
    draggable: overrides.draggable ?? true,
    handlers,
    onDrop,
  });
  return { props, handlers, onDrop };
}

describe('layerRowDragProps', () => {
  /*
   * Firefox 对没带数据的 dragstart 直接不启动拖拽，表现是拖了半天列表毫无反应。
   * effectAllowed 必须是 copyMove，否则按 Alt 时浏览器不给复制光标。
   */
  it('dragstart 要带数据，并允许复制与移动两种效果', () => {
    const { props, handlers } = setup();
    const event = fakeEvent();

    props.onDragStart(event);

    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'L1');
    expect(event.dataTransfer.effectAllowed).toBe('copyMove');
    expect(handlers.onDragStart).toHaveBeenCalledWith('L1');
  });

  it('按住 Alt 时光标是复制，松开是移动', () => {
    const { props } = setup();

    const alt = fakeEvent({ altKey: true });
    props.onDragOver(alt);
    expect(alt.dataTransfer.dropEffect).toBe('copy');

    const plain = fakeEvent({ altKey: false });
    props.onDragOver(plain);
    expect(plain.dataTransfer.dropEffect).toBe('move');
  });

  it('drop 把 Alt 状态交出去，由上层决定复制还是移动', () => {
    const { props, onDrop } = setup();

    props.onDrop(fakeEvent({ altKey: true }));
    expect(onDrop).toHaveBeenCalledWith(true);

    props.onDrop(fakeEvent({ altKey: false }));
    expect(onDrop).toHaveBeenLastCalledWith(false);
  });

  it('行上半是插到前面，下半是插到后面', () => {
    const { props, handlers } = setup();

    props.onDragOver(fakeEvent({ offsetY: 5 }));
    expect(handlers.onDragOver).toHaveBeenLastCalledWith('L1', 'before');

    props.onDragOver(fakeEvent({ offsetY: 35 }));
    expect(handlers.onDragOver).toHaveBeenLastCalledWith('L1', 'after');
  });

  it('组行中间那一半是放进组里', () => {
    const { props, handlers } = setup({ isGroup: true });

    props.onDragOver(fakeEvent({ offsetY: 20 }));
    expect(handlers.onDragOver).toHaveBeenLastCalledWith('L1', 'inside');

    // 上下各 1/4 仍然是前后，不是放进组里
    props.onDragOver(fakeEvent({ offsetY: 4 }));
    expect(handlers.onDragOver).toHaveBeenLastCalledWith('L1', 'before');
  });

  it('不可拖的行不给落点提示，免得画出假的插入线', () => {
    const { props, handlers } = setup({ draggable: false });
    const event = fakeEvent({ offsetY: 5 });

    props.onDragOver(event);

    expect(handlers.onDragOver).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
