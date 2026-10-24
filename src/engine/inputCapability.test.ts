/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  hasCoarsePointer,
  isTouchPointer,
  isWideViewport,
  WIDE_LAYOUT_MIN_WIDTH,
} from './inputCapability';

/** 让 matchMedia 只对指定的查询串答 true */
function stubMatchMedia(matching: (query: string) => boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: matching(query) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('hasCoarsePointer', () => {
  it('问的是 any-pointer 而不是 pointer（插了鼠标的触屏设备也要答对）', () => {
    const asked: string[] = [];
    stubMatchMedia((query) => {
      asked.push(query);
      return query.includes('any-pointer: coarse');
    });
    expect(hasCoarsePointer()).toBe(true);
    expect(asked.some((query) => query.includes('any-pointer'))).toBe(true);
  });

  it('纯鼠标设备答 false', () => {
    stubMatchMedia(() => false);
    expect(hasCoarsePointer()).toBe(false);
  });

  it('matchMedia 缺失时当作没有触屏，不抛异常', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(hasCoarsePointer()).toBe(false);
  });
});

describe('isWideViewport', () => {
  it('按 820px 分界提问', () => {
    const asked: string[] = [];
    stubMatchMedia((query) => {
      asked.push(query);
      return true;
    });
    expect(isWideViewport()).toBe(true);
    expect(asked[0]).toContain(`${WIDE_LAYOUT_MIN_WIDTH}px`);
  });

  it('窄屏答 false', () => {
    stubMatchMedia(() => false);
    expect(isWideViewport()).toBe(false);
  });

  it('matchMedia 缺失时按宽屏处理，桌面端不被误判成手机', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isWideViewport()).toBe(true);
  });
});

describe('isTouchPointer', () => {
  it('只有 touch 算手指', () => {
    expect(isTouchPointer('touch')).toBe(true);
  });

  it('鼠标与手写笔都不算', () => {
    // pen 不算是刻意的：笔尖精确，走桌面单指路径最合适
    expect(isTouchPointer('mouse')).toBe(false);
    expect(isTouchPointer('pen')).toBe(false);
  });

  it('未知类型不算，宁可退回桌面路径', () => {
    expect(isTouchPointer('')).toBe(false);
  });
});
