/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback } from 'react';
import { useEditorStore } from '../store';
import { mergeModifiers } from '../engine/touchModifiers';

/** 一个事件上被认定为「按下了」的修饰键 */
export interface EffectiveModifiers {
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * 把触摸快捷方式控件的状态并进 DOM 事件的修饰键。
 *
 * 给**画布之外**的点击用（图层行的 Alt+点击单独显示、Shift+点击选一段、
 * Alt+点击行间建剪贴蒙版）。画布内的路径走 CanvasArea 的 makePointer，
 * 两边并进去的是同一份状态。
 *
 * 不这样做的后果不是「不方便」：触屏上没有 Alt 键也没有 hover，
 * 这些功能会彻底点不出来（规约第零节 —— 布局可以重排，功能不许删）。
 *
 * 用 getState() 现取而不是订阅：要的是**点击那一刻**的值，
 * 而且订阅会让返回的函数引用每次都变，把 memo 住的图层行全打回重渲染。
 */
export function useEffectiveModifiers() {
  /** 读某个事件的有效修饰键 */
  const modifiersOf = useCallback(
    (event: EffectiveModifiers): EffectiveModifiers =>
      mergeModifiers(event, useEditorStore.getState().touchModifiers),
    [],
  );

  /**
   * 操作做完了，用掉「单击锁定」的那一档。
   * 按住不放的不受影响，所以按住 Alt 连点几个眼睛是可以的。
   */
  const consume = useCallback(() => useEditorStore.getState().consumeTouchModifiers(), []);

  return { modifiersOf, consume };
}
