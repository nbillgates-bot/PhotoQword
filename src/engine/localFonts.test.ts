/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryLocalFontFamilies, supportsLocalFonts } from './localFonts';

/** 装一个假的 queryLocalFonts，返回值由用例给 */
function stub(impl: (() => Promise<unknown>) | undefined) {
  if (impl === undefined) {
    delete (window as unknown as Record<string, unknown>).queryLocalFonts;
    return;
  }
  (window as unknown as Record<string, unknown>).queryLocalFonts = impl;
}

afterEach(() => stub(undefined));

describe('supportsLocalFonts', () => {
  it('没有这个 API 时返回 false', () => {
    stub(undefined);
    expect(supportsLocalFonts()).toBe(false);
  });

  it('有这个 API 时返回 true', () => {
    stub(() => Promise.resolve([]));
    expect(supportsLocalFonts()).toBe(true);
  });

  it('值不是函数时也算不支持，不能只看键在不在', () => {
    (window as unknown as Record<string, unknown>).queryLocalFonts = 'nope';
    expect(supportsLocalFonts()).toBe(false);
  });
});

describe('queryLocalFontFamilies', () => {
  it('不支持时返回空数组，让调用方退回内置清单', async () => {
    stub(undefined);
    await expect(queryLocalFontFamilies()).resolves.toEqual([]);
  });

  it('取出家族名并去重（一个家族有多个字形）', async () => {
    stub(() =>
      Promise.resolve([
        { family: 'Arial', style: 'Regular' },
        { family: 'Arial', style: 'Bold' },
        { family: 'Menlo', style: 'Regular' },
      ]),
    );
    await expect(queryLocalFontFamilies()).resolves.toEqual(['Arial', 'Menlo']);
  });

  it('用户拒绝授权时静默返回空数组，不抛错', async () => {
    stub(() => Promise.reject(new Error('permission denied')));
    await expect(queryLocalFontFamilies()).resolves.toEqual([]);
  });

  it('过滤掉空的家族名', async () => {
    stub(() => Promise.resolve([{ family: '' }, { family: 'Arial' }]));
    await expect(queryLocalFontFamilies()).resolves.toEqual(['Arial']);
  });

  it('不缓存结果：先拒绝后允许，第二次要能拿到', async () => {
    const api = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce([{ family: 'Arial' }]);
    stub(api as unknown as () => Promise<unknown>);

    await expect(queryLocalFontFamilies()).resolves.toEqual([]);
    await expect(queryLocalFontFamilies()).resolves.toEqual(['Arial']);
    expect(api).toHaveBeenCalledTimes(2);
  });
});
