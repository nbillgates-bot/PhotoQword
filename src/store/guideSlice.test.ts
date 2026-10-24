/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';

const store = () => useEditorStore.getState();

describe('guideSlice', () => {
  beforeEach(() => {
    store().clearGuides();
  });

  it('初始没有参考线，且默认显示', () => {
    expect(store().guides).toEqual([]);
    expect(store().showGuides).toBe(true);
  });

  it('addGuide 返回新参考线的 id，并追加到列表', () => {
    const id = store().addGuide('h', 40);
    expect(typeof id).toBe('string');
    expect(store().guides).toHaveLength(1);
    expect(store().guides[0]).toMatchObject({ id, orientation: 'h', position: 40 });
  });

  it('多次 addGuide 的 id 互不相同', () => {
    const first = store().addGuide('h', 10);
    const second = store().addGuide('h', 10);
    expect(first).not.toBe(second);
  });

  it('moveGuide 只改目标那一条', () => {
    const a = store().addGuide('v', 10);
    const b = store().addGuide('v', 20);
    store().moveGuide(a, 99);
    expect(store().guides.find((g) => g.id === a)?.position).toBe(99);
    expect(store().guides.find((g) => g.id === b)?.position).toBe(20);
  });

  it('moveGuide 传不存在的 id 不抛错也不改动', () => {
    store().addGuide('v', 10);
    expect(() => store().moveGuide('guide-does-not-exist', 50)).not.toThrow();
    expect(store().guides[0].position).toBe(10);
  });

  it('deleteGuide 只删目标那一条', () => {
    const a = store().addGuide('h', 10);
    const b = store().addGuide('v', 20);
    store().deleteGuide(a);
    expect(store().guides.map((g) => g.id)).toEqual([b]);
  });

  it('clearGuides 清空全部', () => {
    store().addGuide('h', 10);
    store().addGuide('v', 20);
    store().clearGuides();
    expect(store().guides).toEqual([]);
  });

  it('toggleGuides 只翻转显示开关，不动参考线本身', () => {
    store().addGuide('h', 10);
    const before = store().showGuides;
    store().toggleGuides();
    expect(store().showGuides).toBe(!before);
    // 隐藏只是不画，参考线还在——与 PS 一致
    expect(store().guides).toHaveLength(1);
    store().toggleGuides();
    expect(store().showGuides).toBe(before);
  });

  it('guides 每次变更都换新数组引用，React 才看得见', () => {
    const first = store().guides;
    store().addGuide('h', 10);
    expect(store().guides).not.toBe(first);
  });
});
