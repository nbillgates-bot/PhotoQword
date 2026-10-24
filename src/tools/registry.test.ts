/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TOOL_REGISTRY, getTool } from './registry';
import { context, newDoc, store } from './testKit';
import type { ToolId } from '../types';

/**
 * 注册表层面的横向检查。
 *
 * 单个工具的测试只管自己那一件事，容易漏掉"新加的工具忘了写光标"这类
 * 全局约束——漏了不会报错，只是光标静默退回 default，用户看到的就是
 * "指针没反应"。这一层就是拦这个。
 */
const ids = Object.keys(TOOL_REGISTRY) as ToolId[];

/** CSS 认的光标关键字，本项目实际用到的那些 */
const KEYWORDS = new Set([
  'default',
  'crosshair',
  'move',
  'text',
  'grab',
  'grabbing',
  'zoom-in',
  'zoom-out',
  'ns-resize',
  'ew-resize',
  'nwse-resize',
  'nesw-resize',
]);

/** 求某个工具此刻的光标值 */
function cursorOf(id: ToolId): string {
  const { cursor } = getTool(id);
  if (typeof cursor === 'function') return cursor(context());
  return cursor ?? '';
}

/** 判断一个光标值是否合法：关键字，或带兜底关键字的 data URI */
function isValidCursor(value: string): boolean {
  if (KEYWORDS.has(value)) return true;
  if (!value.startsWith('url("data:image/svg+xml,')) return false;
  // 规范要求 url() 后必须跟一个关键字兜底，否则整条声明作废
  const fallback = value.slice(value.lastIndexOf(',') + 1).trim();
  return KEYWORDS.has(fallback);
}

beforeEach(() => {
  store().closeDoc();
  store().setCursorPos(null);
  store().setAltPressed(false);
});

describe('工具注册表', () => {
  it('每个 ToolId 都有处理器，且 id 与键名一致', () => {
    ids.forEach((id) => {
      expect(getTool(id), id).toBeDefined();
      expect(getTool(id).id, id).toBe(id);
    });
  });

  it('每个工具都声明了光标，没有静默退回 default 的', () => {
    const missing = ids.filter((id) => getTool(id).cursor === undefined);
    expect(missing).toEqual([]);
  });

  it('没有文档时求光标不报错', () => {
    ids.forEach((id) => {
      expect(() => cursorOf(id), id).not.toThrow();
    });
  });

  it('有文档、指针在画布中央时每个工具的光标都合法', () => {
    newDoc(64, 64);
    store().setCursorPos({ x: 32, y: 32 });
    ids.forEach((id) => {
      const value = cursorOf(id);
      expect(isValidCursor(value), `${id} -> ${value}`).toBe(true);
    });
  });

  it('光标值不含未转义的引号或换行，否则内联到 style 上会坏掉', () => {
    newDoc(64, 64);
    ids.forEach((id) => {
      const value = cursorOf(id);
      expect(value, id).not.toMatch(/[\n\r]/);
      // data URI 里的 " 已经被换成 '，剩下的只有包裹 url() 的那两个
      expect((value.match(/"/g) ?? []).length % 2, id).toBe(0);
    });
  });
});
