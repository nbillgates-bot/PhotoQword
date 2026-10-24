/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import {
  NO_TOUCH_MODIFIERS,
  modifierLabel,
  type TouchModifierKey,
} from '../engine/touchModifiers';
import { DEFAULT_DOCK_SIDE } from '../engine/touchPrefs';

/**
 * 状态机本身在 engine/touchModifiers.test.ts 里测过了，
 * 这里只测 slice 自己的活儿：空操作不触发 set、停靠边落盘。
 */
const state = () => useEditorStore.getState();
const label = (key: TouchModifierKey) => modifierLabel(state().touchModifiers, key);

beforeEach(() => {
  state().clearTouchModifiers();
});

describe('修饰键状态', () => {
  it('初始全部未按下', () => {
    expect(state().touchModifiers).toEqual(NO_TOUCH_MODIFIERS);
  });

  it('按下 → 松开（短按）走到锁定', () => {
    state().pressTouchModifier('alt');
    expect(label('alt')).toBe('held');
    state().releaseTouchModifier('alt', true);
    expect(label('alt')).toBe('latched');
  });

  it('按下 → 松开（长按）回到未按下', () => {
    state().pressTouchModifier('shift');
    state().releaseTouchModifier('shift', false);
    expect(label('shift')).toBe('off');
  });

  it('已锁定后再单击一次会取消', () => {
    state().pressTouchModifier('alt');
    state().releaseTouchModifier('alt', true);
    expect(label('alt')).toBe('latched');
    state().pressTouchModifier('alt');
    state().releaseTouchModifier('alt', true);
    expect(label('alt')).toBe('off');
  });

  it('一次操作做完用掉锁定，按住的保留', () => {
    state().pressTouchModifier('alt');
    state().releaseTouchModifier('alt', true);
    state().pressTouchModifier('shift');
    state().consumeTouchModifiers();
    expect(label('alt')).toBe('off');
    expect(label('shift')).toBe('held');
  });

  it('没有锁定的键时 consume 不改变对象引用（抬手每次都调，不能白触发渲染）', () => {
    const before = state().touchModifiers;
    state().consumeTouchModifiers();
    expect(state().touchModifiers).toBe(before);
  });

  it('本来就空时 clear 不改变对象引用', () => {
    const before = state().touchModifiers;
    state().clearTouchModifiers();
    expect(state().touchModifiers).toBe(before);
  });

  it('clear 会把按住的也清掉（切工具、窗口失焦）', () => {
    state().pressTouchModifier('alt');
    state().pressTouchModifier('shift');
    state().clearTouchModifiers();
    expect(state().touchModifiers).toEqual(NO_TOUCH_MODIFIERS);
  });
});

describe('停靠边', () => {
  it('初始取存过的值，没存过给默认', () => {
    expect(['left', 'right']).toContain(state().touchDockSide);
  });

  it('换边并落盘，换两次回到原处', () => {
    const first = state().touchDockSide;
    state().toggleTouchDockSide();
    const flipped = state().touchDockSide;
    expect(flipped).not.toBe(first);
    expect(localStorage.getItem('qword.touchDockSide')).toBe(flipped);
    state().toggleTouchDockSide();
    expect(state().touchDockSide).toBe(first);
  });

  it('默认值是左边（右手持笔的人用左拇指按）', () => {
    expect(DEFAULT_DOCK_SIDE).toBe('left');
  });
});
