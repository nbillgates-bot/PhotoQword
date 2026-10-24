/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { FALLBACK_LOCALE, type Locale, type Messages } from './types';
import { zhCN } from './locales/zhCN';
import { en } from './locales/en';

const TABLES: Record<Locale, Messages> = {
  'zh-CN': zhCN,
  en,
};

/** 取某语言的完整词条表 */
export function messagesOf(locale: Locale): Messages {
  return TABLES[locale] ?? TABLES[FALLBACK_LOCALE];
}

/** 填充 {name} 形式的占位符 */
function interpolate(template: string, values?: Record<string, string | number>): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key];
    // 占位符没给值时保留原样，方便一眼看出漏传了哪个参数
    return value === undefined ? whole : String(value);
  });
}

/**
 * 查词条。
 *
 * 缺词条时依次退回兜底语言、再退回 key 本身——
 * 界面上出现 'menu.file.new' 这样的原始 key 很扎眼，正是我们想要的效果：
 * 漏翻译立刻被看见，而不是显示成空白让人以为是布局 bug。
 */
export function translate(
  locale: Locale,
  key: string,
  values?: Record<string, string | number>,
): string {
  const table = messagesOf(locale);
  const hit = table[key] ?? messagesOf(FALLBACK_LOCALE)[key];
  return hit === undefined ? key : interpolate(hit, values);
}

/** 翻译函数的类型。组件里拿到的 t 就是这个签名 */
export type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

/**
 * 两段式翻译：占位符的值本身还是词条 key 时，先各自翻一遍再填进外层模板。
 *
 * 用在"外层句子 + 内层原因"的场合，例如
 * `translateNested(t, 'error.doc.cannotCreate', undefined, { reason: 'error.size.areaTooLarge' })`。
 * 少了这一步会出现「无法新建文档：error.size.areaTooLarge」这种半成品，
 * 或者切语言后一半新一半旧的串。
 *
 * toast、历史记录、进度窗都用它，所以放在这里而不是各自实现一份。
 */
export function translateNested(
  t: TranslateFn,
  key: string,
  params?: Record<string, string | number>,
  paramKeys?: Record<string, string>,
  /**
   * 内层 key 自己的占位符取值。
   *
   * 默认与外层共用 params —— 内层原因的数字（尺寸超限的 {megapixels}、{max}）
   * 和外层句子的取值本来就装在同一个袋子里，调用方没有理由分两份传。
   * 漏了这个默认值的后果是内层的占位符原样漏到界面上：
   * 「Can't create the document: The image is {megapixels} megapixels…」，
   * 不报错、测试也不一定抓到，只有真在浏览器里切到英文才看得见。
   */
  nestedParams: Record<string, string | number> | undefined = params,
): string {
  if (!paramKeys) return t(key, params);
  const resolved = Object.fromEntries(
    Object.entries(paramKeys).map(([name, innerKey]) => [name, t(innerKey, nestedParams)]),
  );
  return t(key, { ...params, ...resolved });
}

/** 绑定语言，得到一个只需传 key 的翻译函数 */
export function translatorFor(locale: Locale): TranslateFn {
  return (key, values) => translate(locale, key, values);
}
