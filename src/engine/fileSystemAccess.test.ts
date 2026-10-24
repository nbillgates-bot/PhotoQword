/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PickCancelled,
  pickOpenFile,
  pickSaveFile,
  supportsOpenPicker,
  supportsSavePicker,
  writeToHandle,
  type SaveFileHandle,
} from './fileSystemAccess';

/**
 * File System Access API 的封装。
 *
 * jsdom 不实现这套 API，所以「不支持」是测试环境的天然状态 ——
 * 正好覆盖 Firefox / Safari 那条降级路径。支持的分支靠往 window 上
 * 塞桩函数来测，这与真实浏览器的判断依据（属性是不是函数）完全一致。
 */

type Patched = typeof window & {
  showSaveFilePicker?: unknown;
  showOpenFilePicker?: unknown;
};

afterEach(() => {
  const w = window as Patched;
  delete w.showSaveFilePicker;
  delete w.showOpenFilePicker;
  vi.restoreAllMocks();
});

/** 造一个能记下写入内容的假句柄 */
function fakeHandle(name = '稿子.psd') {
  const chunks: unknown[] = [];
  const handle: SaveFileHandle = {
    name,
    createWritable: async () => ({
      write: async (data) => void chunks.push(data),
      close: async () => {},
    }),
    getFile: async () => new File([], name),
  };
  return { handle, chunks };
}

/** 浏览器取消文件框时抛的就是这个 */
function abortError(): Error {
  const err = new Error('用户取消');
  err.name = 'AbortError';
  return err;
}

describe('特性检测', () => {
  it('jsdom 里两个 picker 都不存在，等同 Firefox / Safari', () => {
    expect(supportsSavePicker()).toBe(false);
    expect(supportsOpenPicker()).toBe(false);
  });

  it('挂上函数后检测为支持', () => {
    (window as Patched).showSaveFilePicker = () => {};
    (window as Patched).showOpenFilePicker = () => {};
    expect(supportsSavePicker()).toBe(true);
    expect(supportsOpenPicker()).toBe(true);
  });

  it('属性存在但不是函数时算不支持', () => {
    // 防的是「某浏览器把它占成了非函数」这种情况，typeof 检查必须挡住
    (window as Patched).showSaveFilePicker = true;
    expect(supportsSavePicker()).toBe(false);
  });
});

describe('pickSaveFile', () => {
  it('不支持时返回 null 而不是抛错，调用方据此降级', async () => {
    await expect(pickSaveFile('稿子.psd', [])).resolves.toBeNull();
  });

  it('把建议文件名透给系统文件框', async () => {
    const { handle } = fakeHandle();
    const show = vi.fn().mockResolvedValue(handle);
    (window as Patched).showSaveFilePicker = show;

    await expect(pickSaveFile('封面.psd', [])).resolves.toBe(handle);
    expect(show.mock.calls[0][0].suggestedName).toBe('封面.psd');
  });

  it('用户取消时抛 PickCancelled，不是原始的 AbortError', async () => {
    // 取消要能和真正的失败区分开，否则会弹一条不该弹的红色错误条
    (window as Patched).showSaveFilePicker = vi.fn().mockRejectedValue(abortError());
    await expect(pickSaveFile('稿子.psd', [])).rejects.toBeInstanceOf(PickCancelled);
  });

  it('真正的错误原样抛出，不被当成取消', async () => {
    const boom = new Error('磁盘满了');
    (window as Patched).showSaveFilePicker = vi.fn().mockRejectedValue(boom);
    await expect(pickSaveFile('稿子.psd', [])).rejects.toBe(boom);
  });
});

describe('pickOpenFile', () => {
  it('不支持时返回 null，调用方退回隐藏 input', async () => {
    await expect(pickOpenFile()).resolves.toBeNull();
  });

  it('取第一个句柄', async () => {
    const { handle } = fakeHandle('照片.psd');
    (window as Patched).showOpenFilePicker = vi.fn().mockResolvedValue([handle]);
    await expect(pickOpenFile()).resolves.toBe(handle);
  });

  it('返回空数组时给 null，不要越界读出 undefined', async () => {
    (window as Patched).showOpenFilePicker = vi.fn().mockResolvedValue([]);
    await expect(pickOpenFile()).resolves.toBeNull();
  });

  it('取消同样映射成 PickCancelled', async () => {
    (window as Patched).showOpenFilePicker = vi.fn().mockRejectedValue(abortError());
    await expect(pickOpenFile()).rejects.toBeInstanceOf(PickCancelled);
  });
});

describe('writeToHandle', () => {
  it('没有权限方法时直接写（老实现没有 queryPermission）', async () => {
    const { handle, chunks } = fakeHandle();
    const blob = new Blob(['x']);
    await expect(writeToHandle(handle, blob)).resolves.toBe(true);
    expect(chunks).toEqual([blob]);
  });

  it('已授权时直接写，不再多问一次', async () => {
    const { handle, chunks } = fakeHandle();
    const request = vi.fn();
    const withPerm: SaveFileHandle = {
      ...handle,
      queryPermission: async () => 'granted',
      requestPermission: request,
    };
    await expect(writeToHandle(withPerm, new Blob(['y']))).resolves.toBe(true);
    expect(request).not.toHaveBeenCalled();
    expect(chunks).toHaveLength(1);
  });

  it('权限过期时先申请，拿到就照写', async () => {
    const { handle, chunks } = fakeHandle();
    const withPerm: SaveFileHandle = {
      ...handle,
      queryPermission: async () => 'prompt',
      requestPermission: async () => 'granted',
    };
    await expect(writeToHandle(withPerm, new Blob(['z']))).resolves.toBe(true);
    expect(chunks).toHaveLength(1);
  });

  it('申请被拒时返回 false 且一个字节都不写', async () => {
    // 关键点：不能抛异常，调用方要靠 false 转去走「存储为」
    const { handle, chunks } = fakeHandle();
    const withPerm: SaveFileHandle = {
      ...handle,
      queryPermission: async () => 'denied',
      requestPermission: async () => 'denied',
    };
    await expect(writeToHandle(withPerm, new Blob(['w']))).resolves.toBe(false);
    expect(chunks).toEqual([]);
  });
});