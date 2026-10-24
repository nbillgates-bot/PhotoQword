/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 快捷键的集成测试：直接往 window 派发 keydown，看 store 有没有反应。
 *
 * 重点是输入法场景——中文用户默认开着输入法，此时浏览器给出的 key
 * 不是字母，曾导致所有字母快捷键失效。这类 bug 只有在这一层才测得出来：
 * 纯函数测试保证解析对，这里保证解析结果真的被用上了。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from './testHookKit';
import { useShortcuts } from './useShortcuts';
import { useEditorStore } from '../store';

const store = () => useEditorStore.getState();

/** 派发一次 keydown，key/code 分开给，用来模拟输入法 */
function press(key: string, code: string, mods: Partial<KeyboardEventInit> = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, ...mods }));
}

const options = {
  onPickFile: vi.fn(),
  onSave: vi.fn(),
  onSaveAs: vi.fn(),
  getViewport: () => ({ width: 800, height: 600 }),
};

let cleanup: () => void;

beforeEach(() => {
  cleanup?.();
  // transformSession / activeDialog 不受 closeDoc 影响，必须显式清，
  // 否则上一个用例留下的会话会串进下一个用例
  store().cancelTransform();
  store().closeDialog();
  store().closeDoc();
  cleanup = renderHook(() => useShortcuts(options));
  store().createDoc({ name: '测试', width: 64, height: 64, background: 'white' });
  store().setTool('brush');
});

describe('常规按键', () => {
  it('单字母切工具', () => {
    press('v', 'KeyV');
    expect(store().activeTool).toBe('move');
  });

  it('Ctrl+T 开自由变换', () => {
    press('t', 'KeyT', { ctrlKey: true });
    expect(store().activeTool).toBe('transform');
    expect(store().transformSession).not.toBeNull();
  });

  it('Ctrl+M 开曲线对话框', () => {
    press('m', 'KeyM', { ctrlKey: true });
    expect(store().activeDialog).toBe('curves');
  });

  it('Mac 上 Meta 键等效于 Ctrl', () => {
    press('t', 'KeyT', { metaKey: true });
    expect(store().activeTool).toBe('transform');
  });
});

describe('输入法激活时字母快捷键仍然有效', () => {
  it("key 为 'Process' 时 Ctrl+T 照样开变换", () => {
    press('Process', 'KeyT', { ctrlKey: true });
    expect(store().activeTool).toBe('transform');
    expect(store().transformSession).not.toBeNull();
  });

  it('key 为合成中的汉字时 Ctrl+T 照样开变换', () => {
    // 用户实际遇到的场景：中文输入法下按 Ctrl+T 得到 "Ctrl+童"
    press('童', 'KeyT', { ctrlKey: true });
    expect(store().activeTool).toBe('transform');
  });

  it('输入法下单字母切工具也有效', () => {
    press('Process', 'KeyV');
    expect(store().activeTool).toBe('move');
  });

  it('isComposing 为 true 时不吞掉快捷键', () => {
    // 焦点不在输入框，合成态是输入法在画布上空转，本意仍是快捷键
    press('Process', 'KeyV', { isComposing: true });
    expect(store().activeTool).toBe('move');
  });

  it('输入法下 Ctrl+M 照样开对话框', () => {
    press('Process', 'KeyM', { ctrlKey: true });
    expect(store().activeDialog).toBe('curves');
  });
});

describe('不该触发的场景', () => {
  it('焦点在输入框时不触发', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'v', code: 'KeyV', bubbles: true }),
    );
    expect(store().activeTool).toBe('brush');
    input.remove();
  });

  it('认不出的键位安静忽略', () => {
    expect(() => press('Process', 'F13')).not.toThrow();
    expect(store().activeTool).toBe('brush');
  });

  it('Alt+字母不当作工具快捷键', () => {
    press('v', 'KeyV', { altKey: true });
    expect(store().activeTool).toBe('brush');
  });

  it('没有文档时 Ctrl+T 不开会话', () => {
    store().closeDoc();
    press('t', 'KeyT', { ctrlKey: true });
    expect(store().transformSession).toBeNull();
  });
});

describe('具名键', () => {
  it('Escape 取消变换', () => {
    press('t', 'KeyT', { ctrlKey: true });
    expect(store().transformSession).not.toBeNull();
    press('Escape', 'Escape');
    expect(store().transformSession).toBeNull();
  });

  it('Enter 确认变换', () => {
    press('t', 'KeyT', { ctrlKey: true });
    press('Enter', 'Enter');
    expect(store().transformSession).toBeNull();
    expect(store().history.at(-1)?.label).toBe('action.freeTransform');
  });
});

/**
 * 存储与存储为分派到两个不同的回调。
 * PS 里 Ctrl+S 与 Ctrl+Shift+S 是两条命令，绑错等于用户想覆盖原文件
 * 却每次都被问一遍名字（或者反过来，想另存却把原文件覆盖了）。
 */
describe('存储快捷键', () => {
  beforeEach(() => {
    options.onSave.mockClear();
    options.onSaveAs.mockClear();
  });

  it('Ctrl+S 走存储，不走存储为', () => {
    press('s', 'KeyS', { ctrlKey: true });
    expect(options.onSave).toHaveBeenCalledTimes(1);
    expect(options.onSaveAs).not.toHaveBeenCalled();
  });

  it('Ctrl+Shift+S 走存储为，不走存储', () => {
    press('s', 'KeyS', { ctrlKey: true, shiftKey: true });
    expect(options.onSaveAs).toHaveBeenCalledTimes(1);
    expect(options.onSave).not.toHaveBeenCalled();
  });

  it('Cmd+S 在 Mac 上同样生效', () => {
    press('s', 'KeyS', { metaKey: true });
    expect(options.onSave).toHaveBeenCalledTimes(1);
  });

  it('没有文档时两个都不触发', () => {
    store().closeDoc();
    press('s', 'KeyS', { ctrlKey: true });
    press('s', 'KeyS', { ctrlKey: true, shiftKey: true });
    expect(options.onSave).not.toHaveBeenCalled();
    expect(options.onSaveAs).not.toHaveBeenCalled();
  });

  it('不带 Ctrl 的 S 是切工具，不会误存盘', () => {
    press('s', 'KeyS');
    expect(options.onSave).not.toHaveBeenCalled();
    expect(store().activeTool).toBe('clone');
  });
});
