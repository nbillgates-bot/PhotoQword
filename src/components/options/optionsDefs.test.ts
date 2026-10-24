/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { TOOL_OPTIONS } from './optionsDefs';
import { TOOL_REGISTRY } from '../../tools/registry';
import type { ToolId } from '../../types';

const ids = Object.keys(TOOL_REGISTRY) as ToolId[];

/*
 * 起因：多边形套索能在工具栏选中，但选项栏整条是空的——
 * 分发用的 switch 漏写了它那一支，编译期没有任何提示。
 * 这组用例保证「工具存在但选项栏没有」这件事不会再发生。
 */
describe('工具选项栏分发表', () => {
  it('每个工具都有对应的选项组件，一个都不能少', () => {
    const missing = ids.filter((id) => TOOL_OPTIONS[id] === undefined);
    expect(missing).toEqual([]);
  });

  it('表里没有多余的条目，工具删掉后这里也要删干净', () => {
    const extra = Object.keys(TOOL_OPTIONS).filter((id) => !ids.includes(id as ToolId));
    expect(extra).toEqual([]);
  });

  it('每一项都是可渲染的组件', () => {
    for (const id of ids) {
      expect(typeof TOOL_OPTIONS[id], id).toBe('function');
    }
  });

  it('五个选区工具都接到选项栏上，不是只有其中几个', () => {
    // 报的 bug 正是这里：套索有，多边形套索没有
    const selectionTools: ToolId[] = [
      'marquee-rect',
      'marquee-ellipse',
      'lasso',
      'polygon-lasso',
      'wand',
    ];
    for (const id of selectionTools) {
      expect(TOOL_OPTIONS[id], id).toBeDefined();
    }
  });
});
