/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { LOUPE_TOOLS, needsLoupe } from './loupeDefs';

describe('放大镜的触发条件', () => {
  it('精度敏感的工具在触屏拖动时要出', () => {
    for (const tool of ['transform', 'crop', 'eyedropper', 'marquee-rect'] as const) {
      expect(needsLoupe(tool, 'touch')).toBe(true);
    }
  });

  it('画笔描边不出 —— 看的是整条线的走势，挂个放大镜只会挡画面', () => {
    for (const tool of ['brush', 'pencil', 'eraser', 'clone', 'bucket'] as const) {
      expect(needsLoupe(tool, 'touch')).toBe(false);
    }
  });

  it('抓手与缩放不出：平移缩放看的是整幅画面', () => {
    expect(needsLoupe('hand', 'touch')).toBe(false);
    expect(needsLoupe('zoom', 'touch')).toBe(false);
  });

  it('手写笔一律不出（笔尖不挡落点，且手掌会盖住放大镜）', () => {
    for (const tool of LOUPE_TOOLS) {
      expect(needsLoupe(tool, 'pen')).toBe(false);
    }
  });

  it('鼠标一律不出：光标本身就不遮挡', () => {
    for (const tool of LOUPE_TOOLS) {
      expect(needsLoupe(tool, 'mouse')).toBe(false);
    }
  });

  it('未知的 pointerType 保守处理，不出', () => {
    expect(needsLoupe('transform', '')).toBe(false);
  });
});
