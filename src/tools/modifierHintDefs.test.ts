/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { ALT_HINT, SHIFT_HINT, hintKeyFor } from './modifierHintDefs';
import { zhCN } from '../i18n/locales/zhCN';

describe('提示词条', () => {
  it('表里每个值都能在词条表里查到（写错 key 会在界面上显示成原始 key）', () => {
    for (const value of [...Object.values(ALT_HINT), ...Object.values(SHIFT_HINT)]) {
      expect(zhCN[value], `缺词条 ${value}`).toBeTruthy();
    }
  });

  it('没有条目的工具返回 null，由控件退回显示键名', () => {
    // 画笔的 Alt 在 PS 里是吸管，我们还没实现，所以这里必须是空的 ——
    // 一旦 paintTools 补上了那个分支，这条会失败，提醒把提示也加上
    expect(hintKeyFor('brush', 'alt')).toBeNull();
    expect(hintKeyFor('brush', 'shift')).toBeNull();
  });

  it('有条目的工具返回对应词条', () => {
    expect(hintKeyFor('wand', 'alt')).toBe('touchMod.hint.subtract');
    expect(hintKeyFor('wand', 'shift')).toBe('touchMod.hint.add');
  });

  it('同一工具的两个键互不串台', () => {
    expect(hintKeyFor('zoom', 'alt')).toBe('touchMod.hint.zoomOut');
    expect(hintKeyFor('zoom', 'shift')).toBeNull();
    expect(hintKeyFor('move', 'shift')).toBe('touchMod.hint.axisLock');
    expect(hintKeyFor('move', 'alt')).toBeNull();
  });
});
