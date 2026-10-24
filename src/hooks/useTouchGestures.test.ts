/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTouchGestures } from './useTouchGestures';
import { renderHookWithValue } from './testHookKit';
import { useEditorStore } from '../store';
import { LONG_PRESS_MS } from '../engine/touchGestures';
import type { Point } from '../types';

const store = () => useEditorStore.getState();
type Gestures = ReturnType<typeof useTouchGestures>;

/** 视口就是客户端坐标系（无偏移），换算不掺进被测逻辑 */
const toViewport = (clientX: number, clientY: number): Point => ({ x: clientX, y: clientY });

/** 造一个够用的 PointerEvent 替身，只带被测代码真正读的字段 */
function touch(id: number, x: number, y: number, timeStamp = 0, pointerType = 'touch') {
  return { pointerId: id, clientX: x, clientY: y, timeStamp, pointerType } as React.PointerEvent;
}

interface Probe {
  gestures: () => Gestures;
  longPresses: Point[];
  aborts: () => number;
  unmount: () => void;
}

function probeGestures(): Probe {
  const longPresses: Point[] = [];
  let aborts = 0;
  const probe = renderHookWithValue<Gestures>(() =>
    useTouchGestures({
      toViewport,
      onLongPress: (point) => longPresses.push(point),
      onAbortStroke: () => {
        aborts += 1;
      },
    }),
  );
  return {
    gestures: () => probe.last(),
    longPresses,
    aborts: () => aborts,
    unmount: probe.unmount,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  store().closeDoc();
  store().createDoc({ name: '测试', width: 400, height: 300, background: 'white' });
  store().setViewportSize({ width: 400, height: 300 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTouchGestures 只吃手指', () => {
  it('鼠标事件一律不接管，桌面端走原路径', () => {
    const probe = probeGestures();
    expect(probe.gestures().onPointerDown(touch(1, 10, 10, 0, 'mouse'))).toBe(false);
    expect(probe.gestures().onPointerDown(touch(2, 90, 10, 0, 'mouse'))).toBe(false);
    expect(probe.aborts()).toBe(0);
    probe.unmount();
  });

  it('手写笔不接管：笔尖精确，走单指路径就对了', () => {
    const probe = probeGestures();
    expect(probe.gestures().onPointerDown(touch(1, 10, 10, 0, 'pen'))).toBe(false);
    probe.unmount();
  });

  it('第一根手指交给工具，第二根开始接管', () => {
    const probe = probeGestures();
    expect(probe.gestures().onPointerDown(touch(1, 100, 100))).toBe(false);
    expect(probe.gestures().onPointerDown(touch(2, 300, 100))).toBe(true);
    probe.unmount();
  });

  it('第二根手指落下时作废进行中的那一笔', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 100, 100));
    probe.gestures().onPointerDown(touch(2, 300, 100));
    expect(probe.aborts()).toBe(1);
    probe.unmount();
  });

  it('抬到只剩一根手指时，那一根的抬手也不回到工具', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 100, 100));
    probe.gestures().onPointerDown(touch(2, 300, 100));
    probe.gestures().onPointerUp(touch(2, 300, 100, 900));
    // 仍在多指阶段，最后这根手指的 up 不该交给工具（工具没有配对的 down）
    expect(probe.gestures().onPointerUp(touch(1, 100, 100, 950))).toBe(true);
    probe.unmount();
  });
});

describe('双指/三指单击映射到撤销与重做', () => {
  /** 造两步历史，让撤销与重做都有的可走 */
  function twoSteps() {
    store().pushHistory('第一笔');
    store().pushHistory('第二笔');
  }

  it('双指轻点 = 撤销', () => {
    twoSteps();
    const before = store().historyIndex;
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 100, 100, 0));
    probe.gestures().onPointerDown(touch(2, 200, 100, 5));
    probe.gestures().onPointerUp(touch(1, 100, 100, 120));

    expect(store().historyIndex).toBe(before - 1);
    probe.unmount();
  });

  it('三指轻点 = 重做', () => {
    twoSteps();
    store().undo();
    const before = store().historyIndex;
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 100, 100, 0));
    probe.gestures().onPointerDown(touch(2, 200, 100, 5));
    probe.gestures().onPointerDown(touch(3, 300, 100, 10));
    probe.gestures().onPointerUp(touch(2, 200, 100, 120));

    expect(store().historyIndex).toBe(before + 1);
    probe.unmount();
  });

  it('双指拖过之后抬手不误撤销', () => {
    twoSteps();
    const before = store().historyIndex;
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 100, 100, 0));
    probe.gestures().onPointerDown(touch(2, 300, 100, 0));
    probe.gestures().onPointerMove(touch(1, 200, 100, 20));
    probe.gestures().onPointerMove(touch(2, 400, 100, 30));
    probe.gestures().onPointerUp(touch(1, 200, 100, 60));

    expect(store().historyIndex).toBe(before);
    probe.unmount();
  });
});

describe('长按', () => {
  it('按住不动到时回调，位置是落点', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(probe.longPresses).toEqual([{ x: 88, y: 44 }]);
    probe.unmount();
  });

  it('时间没到不回调', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    vi.advanceTimersByTime(LONG_PRESS_MS - 50);

    expect(probe.longPresses).toEqual([]);
    probe.unmount();
  });

  it('移动打断长按', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    probe.gestures().onPointerMove(touch(1, 200, 44, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(probe.longPresses).toEqual([]);
    probe.unmount();
  });

  it('抬手打断长按', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    probe.gestures().onPointerUp(touch(1, 88, 44, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(probe.longPresses).toEqual([]);
    probe.unmount();
  });

  it('第二根手指落下打断长按', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    probe.gestures().onPointerDown(touch(2, 288, 44, 100));
    vi.advanceTimersByTime(LONG_PRESS_MS);

    expect(probe.longPresses).toEqual([]);
    probe.unmount();
  });

  it('卸载后定时器不再回调（组件已经没了）', () => {
    const probe = probeGestures();
    probe.gestures().onPointerDown(touch(1, 88, 44));
    probe.unmount();
    vi.advanceTimersByTime(LONG_PRESS_MS * 2);

    expect(probe.longPresses).toEqual([]);
  });
});
