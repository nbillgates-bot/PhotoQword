/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { isAppError } from '../engine/appError';

/** showToast 要的那几个参数 */
export interface ToastMessage {
  key: string;
  params?: Record<string, string | number>;
  paramKeys?: Record<string, string>;
}

/**
 * 把 catch 到的任意东西变成可翻译的 toast 参数。
 *
 * 三种来源：
 * - `AppError`：engine 明确报出来的、用户能理解的失败，直接用它的 key。
 * - 别的 `Error`：契约性错误或第三方库抛的，message 是中文或英文技术信息。
 *   外层句子用 fallbackKey 翻译，技术细节塞进 {reason} —— 细节不翻译是
 *   有意的：它对用户没意义，但贴出来便于反馈问题（I18N.md 第四节）。
 * - 其余（字符串、undefined）：只用 fallbackKey，不编造原因。
 *
 * @param fallbackKey 认不出具体原因时用的词条。这条词条如果带 {reason}
 *   占位符，会被填上技术细节；不带则原样显示。
 */
export function errorToToast(err: unknown, fallbackKey: string): ToastMessage {
  if (isAppError(err)) {
    return { key: err.messageKey, params: err.params, paramKeys: err.paramKeys };
  }
  if (err instanceof Error && err.message) {
    return { key: fallbackKey, params: { reason: err.message } };
  }
  return { key: fallbackKey };
}

/**
 * 把尺寸校验的失败结果配上外层句子。
 *
 * 「无法新建文档 / 无法打开这张图片 / 无法调整图像大小…」有五六个调用点，
 * 每处都要写一遍 params 与 paramKeys 的拼装，所以提出来（规约 §1.1）。
 *
 * @param outerKey 外层句子的词条，要带一个 {reason} 占位符
 */
export function sizeCheckToast(
  check: { reasonKey?: string; reasonParams?: Record<string, string | number> },
  outerKey: string,
): ToastMessage {
  return {
    key: outerKey,
    params: check.reasonParams,
    paramKeys: check.reasonKey ? { reason: check.reasonKey } : undefined,
  };
}
