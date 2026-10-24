/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';

/**
 * 默认图层名跟随界面语言。
 *
 * 语义对齐 PS：名字在**创建那一刻**按当前语言定下来，
 * 之后切换语言不回头改已有图层 —— 图层名是用户数据，能改名、会写进 PSD。
 */

const store = () => useEditorStore.getState();

afterEach(() => {
  store().closeDoc();
  store().setLocale('zh-CN');
});

function newDoc(): void {
  store().createDoc({ name: 'T', width: 4, height: 4, background: 'white' });
}

describe('背景图层名跟随创建时的语言', () => {
  it('中文界面下新建文档得到「背景」', () => {
    store().setLocale('zh-CN');
    newDoc();
    expect(store().layers[0].name).toBe('背景');
  });

  it('英文界面下新建文档得到 Background', () => {
    store().setLocale('en');
    newDoc();
    expect(store().layers[0].name).toBe('Background');
  });

  it('创建后切换语言不改已有图层的名字', () => {
    store().setLocale('zh-CN');
    newDoc();
    store().setLocale('en');
    // 已经建好的图层保持原名，与 PS 一致
    expect(store().layers[0].name).toBe('背景');
  });

  it('拼合图像后的背景名也跟随语言', () => {
    store().setLocale('en');
    newDoc();
    store().addLayer('raster', 'A');
    store().flattenAll();
    expect(store().layers).toHaveLength(1);
    expect(store().layers[0].name).toBe('Background');
  });
});

describe('新建图层的编号名跟随语言', () => {
  it('中文界面下是「图层 N」', () => {
    store().setLocale('zh-CN');
    newDoc();
    const layer = store().addLayer('raster');
    expect(layer?.name).toBe('图层 2');
  });

  it('英文界面下是 Layer N', () => {
    store().setLocale('en');
    newDoc();
    const layer = store().addLayer('raster');
    expect(layer?.name).toBe('Layer 2');
  });

  it('显式传名字时不受语言影响', () => {
    store().setLocale('en');
    newDoc();
    const layer = store().addLayer('raster', '我自己起的名字');
    expect(layer?.name).toBe('我自己起的名字');
  });
});
