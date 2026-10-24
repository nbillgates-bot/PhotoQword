/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { hasOverflow } from './barOverflow';

describe('hasOverflow', () => {
  it('内容比容器宽时判为溢出', () => {
    expect(hasOverflow({ scrollWidth: 900, clientWidth: 375 })).toBe(true);
  });

  it('刚好装满不算溢出', () => {
    expect(hasOverflow({ scrollWidth: 375, clientWidth: 375 })).toBe(false);
  });

  it('亚像素误差不算溢出', () => {
    // 关键点：不吃掉这点误差，桌面上「更多」按钮会闪一下再消失 ——
    // 缩放比例和小数边框都会让 scrollWidth 比 clientWidth 大零点几
    expect(hasOverflow({ scrollWidth: 375.4, clientWidth: 375 })).toBe(false);
    expect(hasOverflow({ scrollWidth: 376, clientWidth: 375 })).toBe(false);
  });

  it('超过容差一点就判为溢出，不会漏掉真实溢出', () => {
    expect(hasOverflow({ scrollWidth: 377, clientWidth: 375 })).toBe(true);
  });

  it('尺寸还没量到时答"没溢出"', () => {
    // 元素未挂载或 display:none 时两个值都是 0
    expect(hasOverflow({ scrollWidth: 0, clientWidth: 0 })).toBe(false);
    expect(hasOverflow({ scrollWidth: 900, clientWidth: 0 })).toBe(false);
  });

  it('非有限值不抛异常也不误判', () => {
    expect(hasOverflow({ scrollWidth: NaN, clientWidth: 375 })).toBe(false);
    expect(hasOverflow({ scrollWidth: 900, clientWidth: NaN })).toBe(false);
    expect(hasOverflow({ scrollWidth: Infinity, clientWidth: 375 })).toBe(false);
  });
});
