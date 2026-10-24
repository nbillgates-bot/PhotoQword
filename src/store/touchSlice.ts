/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, TouchSlice } from './types';
import {
  MODIFIER_KEYS,
  NO_TOUCH_MODIFIERS,
  clearModifiers,
  consumeLatched,
  hasActiveModifier,
  pressModifier,
  releaseModifier,
} from '../engine/touchModifiers';
import { otherSide, readDockSide, storeDockSide } from '../engine/touchPrefs';

/**
 * 触摸快捷方式的状态。
 *
 * 转换规则全在 engine/touchModifiers.ts（纯函数、可单测），这里只做两件事：
 * 存住当前状态、把停靠边写进 localStorage。
 */
export const createTouchSlice: StateCreator<EditorStore, [], [], TouchSlice> = (set, get) => ({
  touchModifiers: NO_TOUCH_MODIFIERS,
  // 读存过的边。桌面端也会读，只是控件不渲染，值放着不用
  touchDockSide: readDockSide(),

  pressTouchModifier: (key) =>
    set((state) => ({ touchModifiers: pressModifier(state.touchModifiers, key) })),

  releaseTouchModifier: (key, tapped) =>
    set((state) => ({
      touchModifiers: releaseModifier(state.touchModifiers, key, { tapped }),
    })),

  consumeTouchModifiers: () => {
    const current = get().touchModifiers;
    const next = consumeLatched(current);
    // 没有锁定的键时什么都不做：抬手时每次都会调，白 set 一轮会触发无谓的重渲染
    if (MODIFIER_KEYS.every((key) => next[key] === current[key])) return;
    set({ touchModifiers: next });
  },

  clearTouchModifiers: () => {
    if (!hasActiveModifier(get().touchModifiers)) return;
    set({ touchModifiers: clearModifiers() });
  },

  toggleTouchDockSide: () => {
    const side = otherSide(get().touchDockSide);
    set({ touchDockSide: side });
    storeDockSide(side);
  },
});
