/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  MODIFIER_KEYS,
  NO_TOUCH_MODIFIERS,
  TAP_MAX_MS,
  clearModifiers,
  consumeLatched,
  hasActiveModifier,
  isModifierActive,
  mergeModifiers,
  modifierLabel,
  pressModifier,
  releaseModifier,
  type TouchModifierKey,
  type TouchModifierState,
} from './touchModifiers';

/** 按一下再松开，tapped 决定是单击还是按住后松手 */
function pressAndRelease(
  state: TouchModifierState,
  key: TouchModifierKey,
  tapped: boolean,
): TouchModifierState {
  return releaseModifier(pressModifier(state, key), key, { tapped });
}

describe('按住', () => {
  it('压上控件立刻生效，不等松手', () => {
    const held = pressModifier(NO_TOUCH_MODIFIERS, 'alt');
    expect(held.alt.pressed).toBe(true);
    expect(isModifierActive(held, 'alt')).toBe(true);
  });

  it('按住期间另一个键不受影响', () => {
    expect(pressModifier(NO_TOUCH_MODIFIERS, 'alt').shift).toEqual(NO_TOUCH_MODIFIERS.shift);
  });

  it('按得久（不算单击）松手就失效', () => {
    expect(isModifierActive(pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', false), 'alt')).toBe(false);
  });

  it('按住不会被「操作做完」清掉：手指还压着，下一笔仍要带修饰键', () => {
    const held = pressModifier(NO_TOUCH_MODIFIERS, 'shift');
    expect(consumeLatched(held).shift.pressed).toBe(true);
  });
});

describe('单击锁定', () => {
  it('快速单击 = 锁定一次', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    expect(latched.alt).toEqual({ pressed: false, latched: true });
    expect(isModifierActive(latched, 'alt')).toBe(true);
  });

  it('锁定在一次操作后自动解除', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    expect(isModifierActive(consumeLatched(latched), 'alt')).toBe(false);
  });

  /*
   * 这条是三档枚举写法踩过的坑：按下会把「已锁定」覆盖成「按住」，
   * 松手时就无从判断该锁上还是该解开，于是永远解不掉。
   */
  it('再单击一次 = 取消锁定（点错了能点回来）', () => {
    let state = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    expect(state.alt.latched).toBe(true);
    state = pressAndRelease(state, 'alt', true);
    expect(isModifierActive(state, 'alt')).toBe(false);
  });

  it('已锁定时按住再慢慢松手，同样回到未按下', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    expect(isModifierActive(pressAndRelease(latched, 'alt', false), 'alt')).toBe(false);
  });

  it('锁定与按住可以叠在同一个键上，操作做完只掉锁定那一位', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    const alsoHeld = pressModifier(latched, 'alt');
    const consumed = consumeLatched(alsoHeld);
    expect(consumed.alt).toEqual({ pressed: true, latched: false });
    // 手指还压着，所以仍然生效
    expect(isModifierActive(consumed, 'alt')).toBe(true);
  });

  it('两个键可以同时锁定（Shift+Alt = 交叉选区），一次操作把两个都用掉', () => {
    let state = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    state = pressAndRelease(state, 'shift', true);
    expect(state.alt.latched && state.shift.latched).toBe(true);
    expect(consumeLatched(state)).toEqual(NO_TOUCH_MODIFIERS);
  });

  it('一个锁定一个按住时，操作做完只清掉锁定那个', () => {
    const state = pressModifier(pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true), 'shift');
    const consumed = consumeLatched(state);
    expect(isModifierActive(consumed, 'alt')).toBe(false);
    expect(isModifierActive(consumed, 'shift')).toBe(true);
  });
});

describe('状态查询', () => {
  it('都没按时 hasActiveModifier 为假', () => {
    expect(hasActiveModifier(NO_TOUCH_MODIFIERS)).toBe(false);
  });

  it('任一个生效 hasActiveModifier 就为真', () => {
    expect(hasActiveModifier(pressModifier(NO_TOUCH_MODIFIERS, 'alt'))).toBe(true);
    expect(hasActiveModifier(pressAndRelease(NO_TOUCH_MODIFIERS, 'shift', true))).toBe(true);
  });

  it('显示档位：按住优先于锁定', () => {
    expect(modifierLabel(NO_TOUCH_MODIFIERS, 'alt')).toBe('off');
    expect(modifierLabel(pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true), 'alt')).toBe('latched');
    const both = pressModifier(pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true), 'alt');
    expect(modifierLabel(both, 'alt')).toBe('held');
  });

  it('clearModifiers 回到全空', () => {
    expect(clearModifiers()).toEqual(NO_TOUCH_MODIFIERS);
  });

  it('单击阈值比长按阈值短，两者才分得开', () => {
    // 500 是 touchGestures 的 LONG_PRESS_MS，这里只断言相对关系
    expect(TAP_MAX_MS).toBeLessThan(500);
  });

  it('MODIFIER_KEYS 与状态对象的键一致，加键时不会漏掉遍历', () => {
    expect([...MODIFIER_KEYS].sort()).toEqual(Object.keys(NO_TOUCH_MODIFIERS).sort());
  });
});

describe('并进真实事件', () => {
  const noKeys = { altKey: false, shiftKey: false };

  it('控件按下时，事件里没按键也算按下', () => {
    const held = pressModifier(NO_TOUCH_MODIFIERS, 'alt');
    expect(mergeModifiers(noKeys, held)).toEqual({ altKey: true, shiftKey: false });
  });

  it('锁定的键同样算按下', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'shift', true);
    expect(mergeModifiers(noKeys, latched)).toEqual({ altKey: false, shiftKey: true });
  });

  it('键盘按下时，控件没按也算按下（外接键盘的 iPad 上两路同时存在）', () => {
    expect(mergeModifiers({ altKey: true, shiftKey: false }, NO_TOUCH_MODIFIERS)).toEqual({
      altKey: true,
      shiftKey: false,
    });
  });

  it('两路都没按就是没按', () => {
    expect(mergeModifiers(noKeys, NO_TOUCH_MODIFIERS)).toEqual({
      altKey: false,
      shiftKey: false,
    });
  });

  it('只产出 altKey 与 shiftKey，不带出事件上的其他字段', () => {
    const merged = mergeModifiers({ ...noKeys, ctrlKey: true } as never, NO_TOUCH_MODIFIERS);
    expect(Object.keys(merged).sort()).toEqual(['altKey', 'shiftKey']);
  });
});

describe('不就地修改', () => {
  it('每个转换都返回新对象，传入的状态不变', () => {
    const original = NO_TOUCH_MODIFIERS;
    pressModifier(original, 'alt');
    consumeLatched(original);
    releaseModifier(original, 'alt', { tapped: true });
    expect(original).toEqual({
      alt: { pressed: false, latched: false },
      shift: { pressed: false, latched: false },
    });
  });

  it('嵌套的位对象也不被就地改（浅拷贝漏了就会串味）', () => {
    const latched = pressAndRelease(NO_TOUCH_MODIFIERS, 'alt', true);
    const bitsBefore = latched.alt;
    consumeLatched(latched);
    expect(bitsBefore.latched).toBe(true);
  });
});
