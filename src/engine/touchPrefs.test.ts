/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCK_SIDE,
  otherSide,
  readDockSide,
  storeDockSide,
  type TouchDockSide,
} from './touchPrefs';

const KEY = 'qword.touchDockSide';

beforeEach(() => {
  localStorage.clear();
});

describe('停靠边的持久化', () => {
  it('没存过时给默认值', () => {
    expect(readDockSide()).toBe(DEFAULT_DOCK_SIDE);
  });

  it('存了能读回来', () => {
    storeDockSide('right');
    expect(readDockSide()).toBe('right');
  });

  it('存坏了当没存过，而不是把脏值透出去', () => {
    localStorage.setItem(KEY, 'middle');
    expect(readDockSide()).toBe(DEFAULT_DOCK_SIDE);
  });

  it('空串也算存坏了', () => {
    localStorage.setItem(KEY, '');
    expect(readDockSide()).toBe(DEFAULT_DOCK_SIDE);
  });

  it('两个方向都能往返', () => {
    for (const side of ['left', 'right'] as TouchDockSide[]) {
      storeDockSide(side);
      expect(readDockSide()).toBe(side);
    }
  });
});

describe('换边', () => {
  it('左右互换', () => {
    expect(otherSide('left')).toBe('right');
    expect(otherSide('right')).toBe('left');
  });

  it('换两次回到原处', () => {
    expect(otherSide(otherSide('left'))).toBe('left');
  });
});
