/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolContext } from './types';
import { useEditorStore } from '../store';

/**
 * 造工具上下文。生产和测试都走这里，两边行为必须一致。
 *
 * `store` 必须是取值器而不是快照。zustand 的 set() 换的是新的 state 对象，
 * 老对象上的字段不会跟着变；工具在同一个 handler 里「先写后读」时
 * （典型：bumpRevision() 之后再读 revision 记下来）拿到的会是写之前的旧值。
 * 这类 bug 在浏览器里稳定复现，而测试若用取值器就永远测不出来，极难查。
 */
export function createToolContext(requestOverlayRepaint: () => void): ToolContext {
  return {
    get store() {
      return useEditorStore.getState();
    },
    requestOverlayRepaint,
  };
}
