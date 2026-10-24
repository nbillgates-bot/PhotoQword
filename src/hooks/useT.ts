/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useMemo } from 'react';
import { useEditorStore } from '../store';
import { translatorFor, type TranslateFn } from '../i18n/translate';

/**
 * 取当前语言的翻译函数。
 *
 * 只订阅 locale 这一个字段，所以除切换语言外不会引起额外重渲染；
 * useMemo 让返回的 t 引用稳定，被 memo 包住的子组件才拦得住重渲染。
 */
export function useT(): TranslateFn {
  const locale = useEditorStore((state) => state.locale);
  return useMemo(() => translatorFor(locale), [locale]);
}
