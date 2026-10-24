/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect } from 'react';
import { useEditorStore } from '../store';

/**
 * 把 Alt 键的按下状态同步进 store，供光标读取。
 *
 * 为什么需要它：光标是在渲染期算出来的，只有 store 变化才会重算。
 * 指针事件里的 altKey 只在鼠标动的时候才到手，用户按下 Alt 不动鼠标时
 * 光标不会变——而缩放工具正是"按住 Alt 变成缩小"，光标必须立刻反映。
 *
 * 用 event.altKey 而不是判断 key === 'Alt'：任意按键事件都带着修饰键的
 * 当前状态，这样即便 Alt 的 keydown 被别的处理器吞掉，后续任何按键
 * 都能把状态纠正回来。
 *
 * 必须监听 blur：Alt+Tab 切走窗口时 keyup 落在别的窗口里，我们收不到，
 * Alt 会一直卡在"按下"。切回来光标就永远是缩小，这是实际会遇到的。
 * 同理监听 contextmenu——右键菜单弹出时也会丢 keyup。
 */
export function useModifierKeys(): void {
  useEffect(() => {
    const setAltPressed = useEditorStore.getState().setAltPressed;
    const sync = (event: KeyboardEvent) => setAltPressed(event.altKey);
    const clear = () => setAltPressed(false);

    window.addEventListener('keydown', sync);
    window.addEventListener('keyup', sync);
    window.addEventListener('blur', clear);
    window.addEventListener('contextmenu', clear);
    return () => {
      window.removeEventListener('keydown', sync);
      window.removeEventListener('keyup', sync);
      window.removeEventListener('blur', clear);
      window.removeEventListener('contextmenu', clear);
      clear();
    };
  }, []);
}
