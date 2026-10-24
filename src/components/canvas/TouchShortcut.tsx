/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './CanvasArea.module.css';
import { useEditorStore } from '../../store';
import { COARSE_POINTER_QUERY } from '../../engine/inputCapability';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useT } from '../../hooks/useT';
import TouchModifierButton from './TouchModifierButton';

/**
 * 触摸快捷方式：屏幕上的 Alt / Shift。做法取自 PS on iPad。
 *
 * 为什么需要它，见 engine/touchModifiers.ts 的头注释（一句话：触屏没有
 * 修饰键，而 PS 的一大半交互挂在修饰键上，缺了等于这些功能在 iPad 上没有）。
 *
 * **只在主要指针是粗指针时渲染。** 有鼠标或触控板就不出现 —— 那种设备上
 * 有真的 Alt 键可按，屏幕上再摆一个只是占地方。判定与各 css 模块里的
 * `@media (pointer: coarse)` 用的是同一条查询，两边不会错位。
 */
export default function TouchShortcut() {
  const coarse = useMediaQuery(COARSE_POINTER_QUERY);
  const side = useEditorStore((state) => state.touchDockSide);
  const toggleSide = useEditorStore((state) => state.toggleTouchDockSide);
  const t = useT();

  /*
   * 窗口失焦、或设备翻成有精确指针（插上触控板）时把状态清干净。
   *
   * 与 useModifierKeys 里监听 blur 是同一个坑：手指还压着控件时切走应用，
   * pointerup 落在别处，这个键会一直卡在「按住」。切回来之后每一笔都带 Alt，
   * 而用户完全不知道为什么。
   */
  useEffect(() => {
    const clear = () => useEditorStore.getState().clearTouchModifiers();
    window.addEventListener('blur', clear);
    // 卸载时也清：coarse 翻成 false 会让整个控件消失，按住状态得跟着走
    return () => {
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [coarse]);

  if (!coarse) return null;

  const dockClass = side === 'left' ? styles.touchDockLeft : styles.touchDockRight;

  return (
    <div className={`${styles.touchShortcut} ${dockClass}`} role="group" aria-label={t('touchMod.label')}>
      <TouchModifierButton modifier="alt" />
      <TouchModifierButton modifier="shift" />
      {/*
        * 换边：右手持笔的人靠左，左手持笔的人靠右。
        * 图标指向要去的那一边，不是当前在的那一边。
        */}
      <button
        type="button"
        className={styles.touchSide}
        title={t('touchMod.switchSide')}
        aria-label={t('touchMod.switchSide')}
        onClick={toggleSide}
      >
        {side === 'left' ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </div>
  );
}
