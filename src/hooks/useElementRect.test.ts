/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createRef } from 'react';
import { renderHookWithValue } from './testHookKit';
import { useElementRect } from './useElementRect';

/*
 * jsdom 里所有元素的 getBoundingClientRect 恒为全 0，也没有 ResizeObserver。
 * 两个都要自己造：前者用 spy 换掉，后者存下回调，测的时候手动触发。
 */
let observers: (() => void)[] = [];

function stubResizeObserver() {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      // 不用构造函数参数属性：tsconfig 开了 erasableSyntaxOnly，那是运行时语法
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        observers.push(this.cb);
      }
      disconnect() {
        observers = observers.filter((fn) => fn !== this.cb);
      }
    },
  );
}

/** 造一个能报出指定盒子的元素；改 box 再触发观察者就等于「尺寸变了」 */
function makeElement(box: { top: number; bottom: number; left: number; right: number }) {
  const element = document.createElement('div');
  element.getBoundingClientRect = () => ({ ...box, width: 0, height: 0, x: 0, y: 0, toJSON: () => box }) as DOMRect;
  return element;
}

beforeEach(() => {
  observers = [];
  stubResizeObserver();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const BOX = { top: 96, bottom: 818, left: 346, right: 390 };

describe('useElementRect', () => {
  it('挂载时就量一次，不用等尺寸变化', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = makeElement(BOX);
    const probe = renderHookWithValue(() => useElementRect(ref));
    expect(probe.last()).toEqual(BOX);
    probe.unmount();
  });

  it('没有元素时给 null，不抛异常', () => {
    const ref = createRef<HTMLElement>();
    const probe = renderHookWithValue(() => useElementRect(ref));
    expect(probe.last()).toBeNull();
    probe.unmount();
  });

  it('enabled 为 false 时不量也不订阅', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = makeElement(BOX);
    const probe = renderHookWithValue(() => useElementRect(ref, false));
    expect(probe.last()).toBeNull();
    expect(observers).toHaveLength(0);
    probe.unmount();
  });

  it('尺寸变了要跟着变', () => {
    const ref = createRef<HTMLElement>();
    const box = { ...BOX };
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ ...box }) as DOMRect;
    (ref as { current: HTMLElement | null }).current = element;
    const probe = renderHookWithValue(() => useElementRect(ref));

    // 转横屏：视口变矮，轨也变矮
    box.bottom = 300;
    act(() => {
      for (const fn of observers) fn();
    });
    expect(probe.last()?.bottom).toBe(300);
    probe.unmount();
  });

  /*
   * 这一条是这个 hook 最容易写错的地方。
   *
   * ResizeObserver 的回调里无条件 setState，而 setState 又可能改变被观察元素的
   * 尺寸，就会自己喂自己转起来（浏览器只会打一句 loop limit exceeded，不报错）。
   * 所以值没变时必须返回同一个引用。
   */
  it('值没变时返回同一个对象引用，不会自己喂自己', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = makeElement(BOX);
    const probe = renderHookWithValue(() => useElementRect(ref));
    const first = probe.last();

    // 触发三次「尺寸没变」的通知
    act(() => {
      for (let i = 0; i < 3; i += 1) {
        for (const fn of observers) fn();
      }
    });
    expect(probe.last()).toBe(first);
    probe.unmount();
  });

  it('卸载时摘掉观察者和 resize 监听', () => {
    const ref = createRef<HTMLElement>();
    (ref as { current: HTMLElement | null }).current = makeElement(BOX);
    const remove = vi.spyOn(window, 'removeEventListener');
    const probe = renderHookWithValue(() => useElementRect(ref));
    expect(observers).toHaveLength(1);

    probe.unmount();
    expect(observers).toHaveLength(0);
    expect(remove).toHaveBeenCalledWith('resize', expect.any(Function));
    remove.mockRestore();
  });
});
