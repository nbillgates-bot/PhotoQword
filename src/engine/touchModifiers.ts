/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 触摸快捷方式的修饰键状态机。
 *
 * 触屏没有 Alt / Shift 键，但一大半 PS 交互都挂在它们上面（Alt 减选、
 * Alt 设仿制源、Shift 加选、Shift 约束比例）。缺了它们不是「不方便」，
 * 是这些功能在 iPad 上根本用不了。所以按规约第零节的触屏例外：
 * 概念不动（还是 Alt 和 Shift，语义与桌面一字不差），只把**输入方式**
 * 重新映射成屏幕上一个可按的控件。做法取自 PS on iPad 的触摸快捷方式。
 *
 * 两段式（docs/TODO_MOBILE.md 的已定决策）：
 * - 按住不放 = 相当于一直按着那个键，松手即失效。适合「按住 Alt 拖一下」。
 * - 快速单击 = 锁定一次，下一次操作做完自动解除。适合「Alt+单击」那类，
 *   否则一根手指按控件、另一根去点目标，两根手指在小屏上根本摆不开。
 *
 * 每个键存成 pressed / latched **两个正交的布尔位**，而不是
 * off|held|latched 三档枚举。枚举的写法有个绕不过去的坑：手指压在一个
 * 已锁定的键上时，「按住」会把「已锁定」覆盖掉，松手时就无从知道
 * 该转成锁定还是该取消锁定。两个位各管一件事，转换里不需要回溯历史。
 *
 * 纯状态机：不认识 React、不认识 store，也不碰计时器。
 * 「按了多久算单击」由调用方按事件时间戳判断后告诉它（见 releaseModifier）。
 */

/** 能模拟的修饰键。Ctrl 不做：PS 里 Ctrl 的活儿几乎都有专用工具或手势 */
export type TouchModifierKey = 'alt' | 'shift';

/** 单个键的状态。两位都为假 = 没按下；任一为真 = 生效 */
export interface ModifierBits {
  /** 手指正压在控件上 */
  readonly pressed: boolean;
  /** 单击锁定，等下一次操作用掉 */
  readonly latched: boolean;
}

export type TouchModifierState = Readonly<Record<TouchModifierKey, ModifierBits>>;

const OFF: ModifierBits = { pressed: false, latched: false };

export const NO_TOUCH_MODIFIERS: TouchModifierState = { alt: OFF, shift: OFF };

export const MODIFIER_KEYS: readonly TouchModifierKey[] = ['alt', 'shift'];

/**
 * 按下多久之内算「单击」。
 *
 * 250ms 比长按阈值（touchGestures 的 LONG_PRESS_MS = 500）短一半：
 * 控件上的单击和长按要能分开，阈值挨太近的话想按住的人会经常被判成单击。
 */
export const TAP_MAX_MS = 250;

/** 这个键现在是否生效（按住和锁定都算） */
export function isModifierActive(state: TouchModifierState, key: TouchModifierKey): boolean {
  const bits = state[key];
  return bits.pressed || bits.latched;
}

/** 有没有任何键生效 */
export function hasActiveModifier(state: TouchModifierState): boolean {
  return MODIFIER_KEYS.some((key) => isModifierActive(state, key));
}

/**
 * 控件上该显示成哪一档。
 *
 * 按住优先于锁定：两者都生效，但一个松手就没、一个要等操作用掉，
 * 手指还压着的时候显示「按住中」才对得上用户此刻的动作。
 */
export function modifierLabel(state: TouchModifierState, key: TouchModifierKey) {
  const bits = state[key];
  if (bits.pressed) return 'held' as const;
  if (bits.latched) return 'latched' as const;
  return 'off' as const;
}

/**
 * 手指压上控件：立刻生效。
 *
 * 不等到松手才判断是单击还是按住 —— 那样「按住控件的同时用另一根手指拖」
 * 会有 250ms 的空档，这段时间里的拖动不带修饰键，选区就已经画错了。
 * latched 位保持不动，松手时才用它决定是锁上还是解锁。
 */
export function pressModifier(
  state: TouchModifierState,
  key: TouchModifierKey,
): TouchModifierState {
  return { ...state, [key]: { ...state[key], pressed: true } };
}

/**
 * 松开控件。
 *
 * @param tapped 这次按下够短、算单击（由调用方按时间戳判定）
 *
 * 单击时把锁定位取反：没锁就锁上，已锁就解开 —— 点错了能点回来，
 * 不用先做一次操作去把它耗掉。按得久则不留任何余味，松手即失效。
 */
export function releaseModifier(
  state: TouchModifierState,
  key: TouchModifierKey,
  { tapped }: { tapped: boolean },
): TouchModifierState {
  const bits = state[key];
  return { ...state, [key]: { pressed: false, latched: tapped ? !bits.latched : false } };
}

/**
 * 一次操作做完了：用掉锁定，保留按住。
 *
 * 「操作」指一次完整的指针交互（按下到抬起），由调用方在抬手后调用。
 * pressed 不能清：手指还压在控件上，清了下一笔就不带修饰键了。
 */
export function consumeLatched(state: TouchModifierState): TouchModifierState {
  const next = { ...state } as Record<TouchModifierKey, ModifierBits>;
  for (const key of MODIFIER_KEYS) {
    if (next[key].latched) next[key] = { ...next[key], latched: false };
  }
  return next;
}

/** 全部清掉。窗口失焦、控件卸载时用 */
export function clearModifiers(): TouchModifierState {
  return NO_TOUCH_MODIFIERS;
}

/**
 * 把控件状态并进一个真实事件的修饰键。
 *
 * 工具层与各处的 onClick 都只看 altKey / shiftKey，不需要知道这一位
 * 是键盘按出来的还是控件按出来的 —— 这正是 TODO 里那条
 * 「工具层不需要知道它来自控件还是键盘」。
 *
 * 键盘用 || 并进来而不是覆盖：外接键盘的 iPad 上两种输入同时存在，
 * 任一路按下就该生效。
 */
export function mergeModifiers(
  event: { altKey: boolean; shiftKey: boolean },
  touch: TouchModifierState,
): { altKey: boolean; shiftKey: boolean } {
  return {
    altKey: event.altKey || isModifierActive(touch, 'alt'),
    shiftKey: event.shiftKey || isModifierActive(touch, 'shift'),
  };
}
