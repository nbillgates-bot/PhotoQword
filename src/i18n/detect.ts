/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { FALLBACK_LOCALE, LOCALES, type Locale } from './types';

const STORAGE_KEY = 'qword.locale';

/** 是不是我们支持的语言代码 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LOCALES.some((item) => item.value === value);
}

/**
 * 把浏览器语言标签匹配到我们支持的语言。
 *
 * 先精确匹配（zh-CN），再退到主语言匹配（zh-TW / zh-HK → zh-CN），
 * 因为 navigator.language 在不同系统上的地区后缀五花八门。
 */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const exact = LOCALES.find((item) => item.value.toLowerCase() === tag.toLowerCase());
    if (exact) return exact.value;

    const primary = tag.split('-')[0].toLowerCase();
    const loose = LOCALES.find((item) => item.value.split('-')[0].toLowerCase() === primary);
    if (loose) return loose.value;
  }
  return null;
}

/** 读用户存过的语言选择。读不到或存的是无效值都返回 null */
export function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    // 隐私模式下 localStorage 会抛异常，静默退回自动检测
    return null;
  }
}

/** 记住用户的语言选择 */
export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // 存不下也不影响本次会话的语言，忽略
  }
}

/**
 * 初始语言：用户存过的优先，否则跟浏览器，最后兜底。
 *
 * navigator.languages 是按用户偏好排序的完整列表，比 navigator.language
 * 单个值准；Safari 老版本没有 languages，所以要退回 language。
 */
export function detectLocale(): Locale {
  const stored = readStoredLocale();
  if (stored) return stored;

  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const tags = nav?.languages ?? (nav?.language ? [nav.language] : []);
  return matchLocale(tags) ?? FALLBACK_LOCALE;
}
