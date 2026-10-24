/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { isLocale, matchLocale, readStoredLocale, storeLocale } from './detect';

describe('isLocale', () => {
  it('认得支持的语言，拒绝其他值', () => {
    expect(isLocale('zh-CN')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(123)).toBe(false);
  });
});

describe('matchLocale', () => {
  it('精确匹配优先', () => {
    expect(matchLocale(['zh-CN'])).toBe('zh-CN');
    expect(matchLocale(['en'])).toBe('en');
  });

  it('大小写不敏感，浏览器报 zh-cn 也认', () => {
    expect(matchLocale(['zh-cn'])).toBe('zh-CN');
    expect(matchLocale(['EN'])).toBe('en');
  });

  it('地区后缀不同时退到主语言，繁体环境给简体而不是英文', () => {
    expect(matchLocale(['zh-TW'])).toBe('zh-CN');
    expect(matchLocale(['zh-HK'])).toBe('zh-CN');
    expect(matchLocale(['en-US'])).toBe('en');
    expect(matchLocale(['en-GB'])).toBe('en');
  });

  it('按偏好顺序取第一个能匹配上的', () => {
    expect(matchLocale(['fr', 'de', 'en-US'])).toBe('en');
    expect(matchLocale(['ja', 'zh-TW', 'en'])).toBe('zh-CN');
  });

  it('全都不支持时返回 null，由调用方决定兜底', () => {
    expect(matchLocale(['fr', 'de'])).toBeNull();
    expect(matchLocale([])).toBeNull();
  });
});

describe('localStorage 往返', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('存了能读回来', () => {
    storeLocale('en');
    expect(readStoredLocale()).toBe('en');
  });

  it('没存过时返回 null', () => {
    expect(readStoredLocale()).toBeNull();
  });

  it('存着无效值时当没存过，不把脏数据带进界面', () => {
    localStorage.setItem('qword.locale', 'klingon');
    expect(readStoredLocale()).toBeNull();
  });
});
