/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useModifierKeys } from './useModifierKeys';
import { renderHook } from './testHookKit';
import { useEditorStore } from '../store';

const store = () => useEditorStore.getState();

let cleanup: (() => void) | null = null;

beforeEach(() => {
  cleanup?.();
  store().setAltPressed(false);
  cleanup = renderHook(() => useModifierKeys());
});

afterEach(() => {
  cleanup?.();
  cleanup = null;
});

/** 派发一个带修饰键状态的按键事件 */
function key(type: 'keydown' | 'keyup', altKey: boolean, k = 'Alt'): void {
  window.dispatchEvent(new KeyboardEvent(type, { key: k, altKey, bubbles: true }));
}

describe('useModifierKeys', () => {
  it('初始为未按下', () => {
    expect(store().altPressed).toBe(false);
  });

  it('按下 Alt 后记录为已按下', () => {
    key('keydown', true);
    expect(store().altPressed).toBe(true);
  });

  it('松开 Alt 后清掉', () => {
    key('keydown', true);
    key('keyup', false);
    expect(store().altPressed).toBe(false);
  });

  it('任何按键都能纠正状态，不依赖 Alt 自己的事件', () => {
    // Alt 的 keydown 若被别的处理器吞掉，后续按键仍要把状态修回来
    key('keydown', true, 'b');
    expect(store().altPressed).toBe(true);
    key('keydown', false, 'b');
    expect(store().altPressed).toBe(false);
  });

  it('窗口失焦时清掉，否则 Alt+Tab 走了会一直卡在按下', () => {
    key('keydown', true);
    window.dispatchEvent(new Event('blur'));
    expect(store().altPressed).toBe(false);
  });

  it('右键菜单弹出时清掉，那时也收不到 keyup', () => {
    key('keydown', true);
    window.dispatchEvent(new Event('contextmenu'));
    expect(store().altPressed).toBe(false);
  });

  it('卸载后不再响应按键，且状态复位', () => {
    key('keydown', true);
    cleanup?.();
    cleanup = null;
    expect(store().altPressed).toBe(false);

    key('keydown', true);
    expect(store().altPressed).toBe(false);
  });
});
