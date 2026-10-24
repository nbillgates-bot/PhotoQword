/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { resolveShortcutKey } from './shortcutKeys';

const ev = (key: string, code: string) => ({ key, code });

describe('resolveShortcutKey 常规输入', () => {
  it('普通字母直接用 key', () => {
    expect(resolveShortcutKey(ev('t', 'KeyT'))).toBe('t');
  });

  it('大写字母（按住 Shift）归一成小写', () => {
    expect(resolveShortcutKey(ev('T', 'KeyT'))).toBe('t');
  });

  it('数字键正常', () => {
    expect(resolveShortcutKey(ev('0', 'Digit0'))).toBe('0');
  });

  it('具名键保留全名', () => {
    expect(resolveShortcutKey(ev('Escape', 'Escape'))).toBe('escape');
    expect(resolveShortcutKey(ev('Enter', 'Enter'))).toBe('enter');
    expect(resolveShortcutKey(ev('Delete', 'Delete'))).toBe('delete');
    expect(resolveShortcutKey(ev('Backspace', 'Backspace'))).toBe('backspace');
  });

  it('加号减号两种键位都认', () => {
    expect(resolveShortcutKey(ev('=', 'Equal'))).toBe('=');
    expect(resolveShortcutKey(ev('-', 'Minus'))).toBe('-');
    expect(resolveShortcutKey(ev('+', 'NumpadAdd'))).toBe('+');
  });
});

describe('resolveShortcutKey 输入法激活时', () => {
  it("key 为 'Process' 时退回物理键位", () => {
    expect(resolveShortcutKey(ev('Process', 'KeyT'))).toBe('t');
    expect(resolveShortcutKey(ev('Process', 'KeyZ'))).toBe('z');
  });

  it('key 是正在合成的汉字时退回物理键位', () => {
    // 用户实际报的场景：按 Ctrl+T，输入法给出 "童"
    expect(resolveShortcutKey(ev('童', 'KeyT'))).toBe('t');
  });

  it('任意非 ASCII 字符都退回键位', () => {
    expect(resolveShortcutKey(ev('あ', 'KeyA'))).toBe('a');
    expect(resolveShortcutKey(ev('ㄓ', 'KeyV'))).toBe('v');
  });

  it("key 为 'Unidentified' 时退回键位", () => {
    expect(resolveShortcutKey(ev('Unidentified', 'KeyB'))).toBe('b');
  });

  it('输入法下的数字键也能还原', () => {
    expect(resolveShortcutKey(ev('Process', 'Digit1'))).toBe('1');
    expect(resolveShortcutKey(ev('Process', 'Numpad1'))).toBe('1');
  });
});

describe('resolveShortcutKey 边界', () => {
  it('认不出来的 code 返回空串，调用方据此忽略', () => {
    expect(resolveShortcutKey(ev('Process', 'F13'))).toBe('');
    expect(resolveShortcutKey(ev('Process', ''))).toBe('');
  });

  it('空 key 加空 code 不抛错', () => {
    expect(() => resolveShortcutKey(ev('', ''))).not.toThrow();
    expect(resolveShortcutKey(ev('', ''))).toBe('');
  });

  it('空格键不被当成可用字符', () => {
    // 空格的 key 是 ' '，长度为 1 但不该被当作字母快捷键
    expect(resolveShortcutKey(ev(' ', 'Space'))).toBe('');
  });

  it('修饰键本身不产生逻辑键', () => {
    expect(resolveShortcutKey(ev('Control', 'ControlLeft'))).toBe('control');
    expect(resolveShortcutKey(ev('Shift', 'ShiftLeft'))).toBe('shift');
  });

  it('同一物理键在不同布局下优先尊重 key', () => {
    // AZERTY 上 KeyA 位置打出的是 'q'，应当按用户看到的字母走
    expect(resolveShortcutKey(ev('q', 'KeyA'))).toBe('q');
  });
});
