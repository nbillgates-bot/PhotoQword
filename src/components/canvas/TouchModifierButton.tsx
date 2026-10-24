/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useRef } from 'react';
import styles from './CanvasArea.module.css';
import { useEditorStore } from '../../store';
import { TAP_MAX_MS, modifierLabel, type TouchModifierKey } from '../../engine/touchModifiers';
import { hintKeyFor } from '../../tools/modifierHintDefs';
import { useT } from '../../hooks/useT';

interface TouchModifierButtonProps {
  modifier: TouchModifierKey;
}

/**
 * 触摸快捷方式里的一个键（Alt 或 Shift）。
 *
 * 两段式判定都在这儿：压上去立刻按住生效，松手时按按压时长决定
 * 是「松开即失效」还是「转成锁定一次」。为什么不等松手才生效，
 * 见 engine/touchModifiers.ts 里 pressModifier 的注释。
 */
export default function TouchModifierButton({ modifier }: TouchModifierButtonProps) {
  // 订阅算好的档位而不是整个状态对象：两位布尔怎么变，界面只关心这三档
  const mode = useEditorStore((state) => modifierLabel(state.touchModifiers, modifier));
  const activeTool = useEditorStore((state) => state.activeTool);
  const press = useEditorStore((state) => state.pressTouchModifier);
  const release = useEditorStore((state) => state.releaseTouchModifier);
  const t = useT();

  /** 按下的时刻。0 表示当前没有配对的按下 */
  const downAtRef = useRef(0);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      /*
       * 拦掉默认行为：不然浏览器会把这次按下变成聚焦 + 合成 click，
       * 在 iOS 上还会连带弹出长按菜单。
       */
      event.preventDefault();
      /*
       * 必须捕获指针。手指压在这么小的按钮上难免滑出边界，
       * 不捕获的话 pointerup 落在别的元素上，这个键就永远卡在「按住」了。
       */
      event.currentTarget.setPointerCapture(event.pointerId);
      downAtRef.current = event.timeStamp;
      press(modifier);
    },
    [press, modifier],
  );

  /** 抬手与被系统取消走同一条路：都要把按下状态收干净 */
  const finish = useCallback(
    (event: React.PointerEvent) => {
      // 没有配对的按下就不管：pointercancel 有可能在 pointerup 之后再来一次
      if (downAtRef.current === 0) return;
      const tapped = event.timeStamp - downAtRef.current <= TAP_MAX_MS;
      downAtRef.current = 0;
      release(modifier, tapped);
    },
    [release, modifier],
  );

  /*
   * 键盘可达（规约 §5）。空格/回车走「单击」那一档 —— 键盘用户按不出
   * 「按住」的语义，而锁定一次正好等价于他们真正想要的：下一步操作带上这个键。
   * 外接键盘的 iPad 上更该有真 Alt 键可按，这里只是不把路堵死。
   */
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      press(modifier);
      release(modifier, true);
    },
    [press, release, modifier],
  );

  const keyName = t(`touchMod.${modifier}`);
  const hintKey = hintKeyFor(activeTool, modifier);
  const stateClass =
    mode === 'held' ? styles.touchKeyHeld : mode === 'latched' ? styles.touchKeyLatched : '';

  return (
    <button
      type="button"
      className={`${styles.touchKey} ${stateClass}`.trim()}
      // 按下即生效、可锁定，语义上是个开关
      aria-pressed={mode !== 'off'}
      aria-label={t('touchMod.state', { key: keyName, state: t(`touchMod.state.${mode}`) })}
      onPointerDown={onPointerDown}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={onKeyDown}
    >
      <span className={styles.touchKeyName}>{keyName}</span>
      {/* 没有对照条目的工具不显示提示，也不编一个出来（见 modifierHintDefs） */}
      {hintKey ? <span className={styles.touchKeyHint}>{t(hintKey)}</span> : null}
    </button>
  );
}
