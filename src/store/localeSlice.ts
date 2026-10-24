/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, LocaleSlice } from './types';
import { detectLocale, storeLocale } from '../i18n/detect';

/**
 * 界面语言。
 *
 * 初值走 detectLocale（存过的选择 > 浏览器语言 > 兜底中文），
 * 切换时立刻写 localStorage，下次打开保持不变。
 * 不进历史记录——语言是应用偏好，不是文档内容，PS 也不允许撤销语言切换。
 */
export const createLocaleSlice: StateCreator<EditorStore, [], [], LocaleSlice> = (set) => ({
  locale: detectLocale(),
  setLocale: (locale) => {
    storeLocale(locale);
    set({ locale });
    // 同步 <html lang>，让浏览器的断词与朗读用对语言
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  },
});
