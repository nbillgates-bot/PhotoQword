/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import type { SaveFileHandle } from '../engine/fileSystemAccess';
import type { SaveTarget } from './types';

/**
 * 保存目标：决定「存储」是静默写回还是退化成「存储为」。
 *
 * 这里只测状态，真正的写盘在 hooks/useSaveFile.ts。
 * 最关键的一条是新建/打开/关闭文档必须清掉目标 ——
 * 不清的话新文档的 Ctrl+S 会直接覆盖上一个文档的文件，是丢数据级的 bug。
 */

const store = () => useEditorStore.getState();

/** 只需要一个能放进 saveTarget 的对象，方法不会被 store 调用 */
const handle = { name: '稿子.psd' } as SaveFileHandle;

/** 造一个保存目标，只关心测试点的那几个字段 */
function target(fileName: string, withHandle = true): SaveTarget {
  return {
    handle: withHandle ? handle : null,
    fileName,
    formatId: 'psd',
    quality: 92,
  };
}

beforeEach(() => {
  store().closeDoc();
});

describe('saveTarget 的初始与清理', () => {
  it('初始没有保存目标，此时「存储」应转为「存储为」', () => {
    expect(store().saveTarget).toBeNull();
  });

  it('新建文档清掉上一个文档的保存目标', () => {
    store().setSaveTarget(target('旧文档.psd'));
    store().createDoc({ width: 8, height: 8, background: 'white', name: '新的' });
    expect(store().saveTarget).toBeNull();
  });

  it('关闭文档清掉保存目标', () => {
    store().createDoc({ width: 8, height: 8, background: 'white', name: '稿子' });
    store().setSaveTarget(target('稿子.psd'));
    store().closeDoc();
    expect(store().saveTarget).toBeNull();
  });

  it('clearSaveTarget 显式清除', () => {
    store().setSaveTarget(target('稿子.psd'));
    store().clearSaveTarget();
    expect(store().saveTarget).toBeNull();
  });
});

describe('markSaved', () => {
  beforeEach(() => {
    store().createDoc({ width: 8, height: 8, background: 'white', name: '未命名' });
  });

  it('记住目标并清掉脏标记', () => {
    // 改一笔让它变脏：pushHistory 是唯一把 dirty 置 true 的地方
    store().addLayer('raster');
    expect(store().dirty).toBe(true);

    store().markSaved(target('封面.psd'));
    expect(store().dirty).toBe(false);
    expect(store().saveTarget).toEqual(target('封面.psd'));
  });

  it('把文档名同步成文件名的主干，与 PS 存储为之后的标题一致', () => {
    store().markSaved(target('封面终稿.psd'));
    expect(store().doc?.name).toBe('封面终稿');
  });

  it('.psb 的扩展名同样不进文档名', () => {
    store().markSaved(target('长图.psb', false));
    expect(store().doc?.name).toBe('长图');
  });

  it('文件名里的点保留，只剥末尾扩展名', () => {
    store().markSaved(target('v1.2.psd'));
    expect(store().doc?.name).toBe('v1.2');
  });

  it('handle 为 null 也算存过（降级下载路径），之后「存储」不再问名字', () => {
    store().markSaved(target('稿子.psd', false));
    expect(store().saveTarget).toEqual(target('稿子.psd', false));
    expect(store().dirty).toBe(false);
  });

  it('存完再改一笔又变脏', () => {
    store().markSaved(target('稿子.psd'));
    store().addLayer('raster');
    expect(store().dirty).toBe(true);
  });

  it('没有文档时不崩，也不凭空造出 doc', () => {
    store().closeDoc();
    store().markSaved(target('稿子.psd'));
    expect(store().doc).toBeNull();
  });
});
