/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 存储 / 存储为的分派逻辑。
 *
 * 这里钉的是 PS 的语义，也是这次改动要修的 bug：
 * **从没存过时按存储，必须先问名字**；存过之后按存储，一次都不许问。
 * 写盘本身（ag-psd 序列化）不在测试范围内，用假句柄拦在 store 边界上。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithValue } from './testHookKit';
import { useSaveFile, type SaveFileApi } from './useSaveFile';
import { useEditorStore } from '../store';
import type { SaveFileHandle } from '../engine/fileSystemAccess';

const store = () => useEditorStore.getState();

type Patched = typeof window & { showSaveFilePicker?: unknown };

/** 记录写入次数的假句柄 */
function fakeHandle(name: string) {
  const writes: unknown[] = [];
  const handle: SaveFileHandle = {
    name,
    createWritable: async () => ({
      write: async (data) => void writes.push(data),
      close: async () => {},
    }),
    getFile: async () => new File([], name),
  };
  return { handle, writes };
}

let api: SaveFileApi;
let unmount: () => void;
/** 降级路径走真下载，这里收集被"点击"的链接 */
let downloads: string[];

beforeEach(() => {
  store().closeDoc();
  store().closeDialog();
  /*
   * jsdom 没实现 createObjectURL，也会把 <a>.click() 当成页面跳转
   * 刷一屏 "Not implemented: navigation"。桩掉这三个，
   * 断言改看「有没有以正确的文件名点过一次」，与 download.test.ts 一致。
   */
  downloads = [];
  URL.createObjectURL = vi.fn(() => 'blob:mock');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloads.push(this.download);
  });
  const probe = renderHookWithValue(() => useSaveFile());
  api = probe.last();
  unmount = probe.unmount;
  store().createDoc({ name: '未命名', width: 8, height: 8, background: 'white' });
});

afterEach(() => {
  unmount?.();
  delete (window as Patched).showSaveFilePicker;
  vi.restoreAllMocks();
});

describe('存储：没存过的时候', () => {
  it('支持系统文件框时弹它问名字，而不是直接落盘', async () => {
    const { handle, writes } = fakeHandle('稿子.psd');
    const show = vi.fn().mockResolvedValue(handle);
    (window as Patched).showSaveFilePicker = show;

    await api.save();

    // 这条就是用户报的 bug：以前这里一次也不问，直接下载了
    expect(show).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
    expect(store().saveTarget).toEqual({ handle, fileName: '稿子.psd', formatId: 'psd', quality: 92 });
  });

  it('建议名按文档名给出，带 .psd 扩展名', async () => {
    const show = vi.fn().mockResolvedValue(fakeHandle('未命名.psd').handle);
    (window as Patched).showSaveFilePicker = show;
    await api.save();
    expect(show.mock.calls[0][0].suggestedName).toBe('未命名.psd');
  });

  it('没有系统文件框时开我们自己的「存储为」对话框', async () => {
    // Firefox / Safari 的路径：语义仍然是「先问名字」
    await api.save();
    expect(store().activeDialog).toBe('save-as');
    expect(store().dialogPayload).toBe('未命名.psd');
    // 还没落盘，所以目标仍然为空
    expect(store().saveTarget).toBeNull();
  });
});

describe('存储：存过之后', () => {
  it('直接写回原句柄，一个窗都不弹', async () => {
    const { handle, writes } = fakeHandle('稿子.psd');
    const show = vi.fn().mockResolvedValue(handle);
    (window as Patched).showSaveFilePicker = show;

    await api.save();
    show.mockClear();
    store().addLayer('raster'); // 再改一笔
    await api.save();

    // 第二次存储不许再问名字，这是 PS 的存储与存储为的根本区别
    expect(show).not.toHaveBeenCalled();
    expect(writes).toHaveLength(2);
    expect(store().dirty).toBe(false);
  });

  it('存储为即使存过也照样问，且换掉关联文件', async () => {
    const first = fakeHandle('旧名.psd');
    const second = fakeHandle('新名.psd');
    const show = vi.fn().mockResolvedValueOnce(first.handle).mockResolvedValueOnce(second.handle);
    (window as Patched).showSaveFilePicker = show;

    await api.save();
    await api.saveAs();

    expect(show).toHaveBeenCalledTimes(2);
    expect(store().saveTarget?.fileName).toBe('新名.psd');
    // 文档名跟着走，与 PS 存储为之后标题栏改名一致
    expect(store().doc?.name).toBe('新名');
  });
});

describe('取消与失败', () => {
  it('用户在系统文件框里取消：不落盘、不留目标、不弹错误条', async () => {
    const abort = new Error('取消');
    abort.name = 'AbortError';
    (window as Patched).showSaveFilePicker = vi.fn().mockRejectedValue(abort);

    await api.save();

    expect(store().saveTarget).toBeNull();
    expect(store().dirty).toBe(true); // 没存成，脏标记必须留着
    expect(store().toast?.kind).not.toBe('error');
  });

  it('句柄权限被收回时清掉目标，下次存储会重新问位置', async () => {
    const { handle } = fakeHandle('稿子.psd');
    const denied: SaveFileHandle = {
      ...handle,
      queryPermission: async () => 'denied',
      requestPermission: async () => 'denied',
    };
    (window as Patched).showSaveFilePicker = vi.fn().mockResolvedValue(denied);

    await api.save();

    expect(store().saveTarget).toBeNull();
    expect(store().toast?.kind).toBe('error');
  });

  it('没有文档时报错而不是抛异常', async () => {
    store().closeDoc();
    await expect(api.save()).resolves.toBeUndefined();
    expect(store().toast?.kind).toBe('error');
  });

  it('进度窗一定会收摊，不会永远盖在界面上', async () => {
    (window as Patched).showSaveFilePicker = vi
      .fn()
      .mockResolvedValue(fakeHandle('稿子.psd').handle);
    await api.save();
    expect(store().progress).toBeNull();
  });
});

describe('降级路径与打开时记住句柄', () => {
  it('saveWithFormat 按给定格式和名字下载并记住它', async () => {
    await api.saveWithFormat('psd', '封面.psd', 92);
    expect(downloads).toEqual(['封面.psd']);
    expect(store().saveTarget).toEqual({ handle: null, fileName: '封面.psd', formatId: 'psd', quality: 92 });
    expect(store().dirty).toBe(false);
    expect(store().doc?.name).toBe('封面');
  });

  it('降级存过之后再按存储，不再弹对话框，直接按原名再下载', async () => {
    await api.saveWithFormat('psd', '封面.psd', 92);
    store().addLayer('raster');
    store().closeDialog();

    await api.save();

    // 名字已经记住了，不该又开一遍对话框
    expect(store().activeDialog).toBeNull();
    expect(downloads).toEqual(['封面.psd', '封面.psd']);
  });

  it('rememberOpened 让打开的文件成为存储目标', () => {
    const { handle } = fakeHandle('照片.psd');
    api.rememberOpened(handle, '照片.psd');
    expect(store().saveTarget).toEqual({ handle, fileName: '照片.psd', formatId: 'psd', quality: 92 });
  });

  it('拿不到句柄时也记住名字，存储不用再问一次', () => {
    api.rememberOpened(null, '照片.psd');
    expect(store().saveTarget).toEqual({ handle: null, fileName: '照片.psd', formatId: 'psd', quality: 92 });
  });
});