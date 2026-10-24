/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderHookWithValue } from './testHookKit';
import { useMediaQuery } from './useMediaQuery';

const QUERY = '(pointer: coarse)';

/** 造一个可控的 MediaQueryList，listeners 里存着注册进来的回调 */
function stubMatchMedia(initial: boolean, { legacy = false } = {}) {
  const listeners = new Set<() => void>();
  const list: Record<string, unknown> = {
    matches: initial,
    media: QUERY,
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
  };
  // 老 Safari 的 MediaQueryList 上没有这两个方法，legacy 模式就是模拟它
  if (!legacy) {
    list.addEventListener = (_: string, fn: () => void) => listeners.add(fn);
    list.removeEventListener = (_: string, fn: () => void) => listeners.delete(fn);
  }
  vi.stubGlobal('matchMedia', () => list);
  return {
    listeners,
    /** 模拟能力翻转：插上触控板、翻成平板模式 */
    flip(next: boolean) {
      list.matches = next;
      act(() => {
        for (const fn of listeners) fn();
      });
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('返回查询的当前结果', () => {
    stubMatchMedia(true);
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    expect(probe.last()).toBe(true);
    probe.unmount();
  });

  it('不匹配时为 false', () => {
    stubMatchMedia(false);
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    expect(probe.last()).toBe(false);
    probe.unmount();
  });

  it('能力翻转时跟着变（插上触控板、翻成平板模式）', () => {
    const stub = stubMatchMedia(false);
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    expect(probe.last()).toBe(false);
    stub.flip(true);
    expect(probe.last()).toBe(true);
    probe.unmount();
  });

  it('卸载后注销监听，不留悬挂回调', () => {
    const stub = stubMatchMedia(true);
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    expect(stub.listeners.size).toBe(1);
    probe.unmount();
    expect(stub.listeners.size).toBe(0);
  });

  it('老 Safari 只有 addListener 时照样能用', () => {
    const stub = stubMatchMedia(false, { legacy: true });
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    stub.flip(true);
    expect(probe.last()).toBe(true);
    probe.unmount();
    expect(stub.listeners.size).toBe(0);
  });

  it('环境里没有 matchMedia 时返回 false，而不是抛错', () => {
    vi.stubGlobal('matchMedia', undefined);
    const probe = renderHookWithValue(() => useMediaQuery(QUERY));
    expect(probe.last()).toBe(false);
    probe.unmount();
  });
});
