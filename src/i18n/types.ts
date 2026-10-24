/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/** 支持的界面语言。新增语言时在这里加，并补一份 locales/xx.ts */
export type Locale = 'zh-CN' | 'en';

/** 语言选单用的元信息。label 用该语言自己的说法，与 PS 一致 */
export interface LocaleMeta {
  value: Locale;
  /** 语言自称，例如英文项写 "English" 而不是「英语」 */
  label: string;
}

export const LOCALES: LocaleMeta[] = [
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

/** 兜底语言：词条缺失时回退到它，保证界面不出现空白 */
export const FALLBACK_LOCALE: Locale = 'zh-CN';

/**
 * 词条表。值可以带 {name} 占位符，由 translate 的第二个参数填充。
 *
 * 刻意用扁平的 string key（如 'menu.file.new'）而不是嵌套对象：
 * 嵌套在 TS 里推导出的类型会深到难以维护，扁平 key 配合
 * Record<string, string> 就够用，缺字段由 checkLocales 测试兜住。
 */
export type Messages = Record<string, string>;
