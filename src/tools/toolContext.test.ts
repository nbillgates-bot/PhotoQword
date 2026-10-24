/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createToolContext } from './toolContext';
import { useEditorStore } from '../store';
import { reset, newDoc } from './testKit';

/**
 * 这组测试守的是一条契约，不是某个功能：ctx.store 必须是「每次现取」。
 *
 * 曾经生产侧传的是 useEditorStore.getState() 的一次性快照，
 * 而 testKit 自己用取值器，于是「同一个 handler 里写完再读」在浏览器里
 * 拿到旧值、在测试里拿到新值 —— 移动选区第二下会重新剪一刀背景，
 * 单元测试却全绿。别把这里改回快照。
 */
describe('createToolContext', () => {
  beforeEach(() => {
    reset();
  });

  it('bumpRevision 之后立刻读 revision，拿到的是自增后的值', () => {
    newDoc();
    const ctx = createToolContext(() => {});
    const before = ctx.store.revision;

    ctx.store.bumpRevision();

    expect(ctx.store.revision).toBe(before + 1);
  });

  it('store 上的 action 换了引用也能读到最新状态', () => {
    newDoc();
    const ctx = createToolContext(() => {});

    useEditorStore.setState({ revision: 999 });

    expect(ctx.store.revision).toBe(999);
  });

  it('requestOverlayRepaint 原样传出去', () => {
    let called = 0;
    const ctx = createToolContext(() => {
      called += 1;
    });

    ctx.requestOverlayRepaint();

    expect(called).toBe(1);
  });
});
