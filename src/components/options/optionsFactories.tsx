/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ComponentType } from 'react';
import styles from './Options.module.css';
import type { ToolId } from '../../types';
import SelectionOptions from './SelectionOptions';
import EffectOptions from './EffectOptions';
import { useT } from '../../hooks/useT';

/**
 * 生成选项栏组件的工厂。
 *
 * 单独成文件是为了满足 fast refresh 的要求：一个文件不能同时导出组件和
 * 非组件（工厂函数是后者）。所以工厂在这里，成品组件在 optionsParts，
 * 纯数据的映射表在 optionsDefs。
 */

/**
 * 只有一句操作提示的工具，用这个包一层，省得各写一个组件。
 * 参数是词条 key，翻译在生成出来的组件里做 —— 工厂在模块顶层跑，
 * 那时候还没有 React 上下文，拿不到当前语言。
 */
export function hintOnly(hintKey: string): ComponentType {
  return function HintOptions() {
    const t = useT();
    return <span className={styles.hint}>{t(hintKey)}</span>;
  };
}

/** 五个选区工具共用 SelectionOptions，只是把自己的 id 传进去 */
export function selectionOptionsFor(tool: ToolId): ComponentType {
  return function ToolSelectionOptions() {
    return <SelectionOptions tool={tool} />;
  };
}

/** 涂抹类工具只有画笔参数加一句提示，差别仅在提示语 */
export function effectOptionsWith(hint: string): ComponentType {
  return function ToolEffectOptions() {
    return <EffectOptions hint={hint} />;
  };
}
