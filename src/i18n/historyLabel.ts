/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { HistoryEntry } from '../types';
import { translateNested, type TranslateFn } from './translate';

/**
 * 把一条历史记录翻成当前语言的文字。
 *
 * 占位符有两种：labelParams 放最终值（图层名这类用户数据，不该被翻译），
 * labelParamKeys 放的值本身还是词条 key（滤镜名这类），要先各自翻一遍
 * 再填进外层模板 —— 否则切语言后会出现「Filter: 高斯模糊」这种
 * 一半新一半旧的串。两段式的实现在 translate.translateNested，
 * toast 与进度窗共用同一份。
 */
export function historyLabel(entry: HistoryEntry, t: TranslateFn): string {
  return translateNested(t, entry.label, entry.labelParams, entry.labelParamKeys);
}
