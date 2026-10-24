/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useMemo } from 'react';
import { useT } from './useT';

/** 选项里存的是词条 key 的形状，翻完之后交给 Select/SegmentedControl 渲染 */
interface KeyedOption<T extends string> {
  value: T;
  label: string;
  group?: string;
}

/**
 * 把「label/group 存词条 key」的选项表翻成当前语言。
 *
 * 数据定义（BLEND_MODES、FILTER_KINDS 这些）统一存 key，
 * 基础 UI 组件只认成品文字，翻译这一步就集中放在这里，
 * 免得每个调用点各写一遍 map。
 */
export function useTranslatedOptions<T extends string>(
  options: readonly KeyedOption<T>[],
): KeyedOption<T>[] {
  const t = useT();
  return useMemo(
    () =>
      options.map((option) => ({
        ...option,
        label: t(option.label),
        group: option.group ? t(option.group) : undefined,
      })),
    [options, t],
  );
}
