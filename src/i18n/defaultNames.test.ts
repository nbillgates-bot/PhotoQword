/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  adjustmentLayerName,
  backgroundLayerName,
  copyOfName,
  newGroupName,
  newLayerName,
  pastedLayerName,
  shapeLayerName,
  textLayerName,
  unnamedLayerName,
  untitledDocName,
} from './defaultNames';

describe('backgroundLayerName', () => {
  it('按语言给出背景图层名', () => {
    expect(backgroundLayerName('zh-CN')).toBe('背景');
    expect(backgroundLayerName('en')).toBe('Background');
  });
});

describe('newLayerName', () => {
  it('按语言给出带编号的图层名', () => {
    expect(newLayerName('zh-CN', 1)).toBe('图层 1');
    expect(newLayerName('en', 1)).toBe('Layer 1');
  });

  it('编号被填进模板，不留占位符', () => {
    for (const index of [1, 2, 10, 999]) {
      expect(newLayerName('zh-CN', index)).toBe(`图层 ${index}`);
      expect(newLayerName('en', index)).toBe(`Layer ${index}`);
    }
  });

  it('边界编号也不留占位符', () => {
    // 0 与负数不该出现在正常路径上，但也不许吐出 '{index}' 这种半成品
    for (const index of [0, -1]) {
      expect(newLayerName('zh-CN', index)).not.toContain('{');
      expect(newLayerName('en', index)).not.toContain('{');
    }
  });
});

describe('untitledDocName', () => {
  it('按语言给出未命名文档名', () => {
    expect(untitledDocName('zh-CN')).toBe('未命名');
    expect(untitledDocName('en')).toBe('Untitled');
  });
});

describe('newGroupName', () => {
  it('按语言给出带编号的组名', () => {
    expect(newGroupName('zh-CN', 2)).toBe('组 2');
    expect(newGroupName('en', 2)).toBe('Group 2');
  });
});

describe('adjustmentLayerName', () => {
  it('把调整类型填进模板', () => {
    expect(adjustmentLayerName('zh-CN', '色阶')).toBe('色阶 调整');
    expect(adjustmentLayerName('en', 'Levels')).toBe('Levels Adjustment');
  });
});

describe('copyOfName', () => {
  it('按 PS 的写法加副本后缀', () => {
    expect(copyOfName('zh-CN', '背景')).toBe('背景 副本');
    expect(copyOfName('en', 'Background')).toBe('Background copy');
  });

  it('原名里带空格或标点也照样拼', () => {
    expect(copyOfName('zh-CN', '图层 1')).toBe('图层 1 副本');
    expect(copyOfName('en', 'My Layer (2)')).toBe('My Layer (2) copy');
  });

  it('原名为空串时不留下悬空的占位符', () => {
    expect(copyOfName('zh-CN', '')).not.toContain('{');
    expect(copyOfName('en', '')).not.toContain('{');
  });
});

describe('文字 / 形状 / 粘贴 / 未命名图层名', () => {
  it('中英各给一份', () => {
    expect(textLayerName('zh-CN')).toBe('文字');
    expect(textLayerName('en')).toBe('Type');
    expect(shapeLayerName('zh-CN')).toBe('形状');
    expect(shapeLayerName('en')).toBe('Shape');
    expect(pastedLayerName('zh-CN')).toBe('粘贴的图层');
    expect(pastedLayerName('en')).toBe('Pasted Layer');
    expect(unnamedLayerName('zh-CN')).toBe('图层');
    expect(unnamedLayerName('en')).toBe('Layer');
  });
});

describe('默认名称都不是空串', () => {
  it('每种语言都给得出名字', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const names = [
        backgroundLayerName(locale),
        newLayerName(locale, 1),
        newGroupName(locale, 1),
        adjustmentLayerName(locale, 'X'),
        textLayerName(locale),
        shapeLayerName(locale),
        pastedLayerName(locale),
        unnamedLayerName(locale),
        untitledDocName(locale),
        copyOfName(locale, 'X'),
      ];
      for (const name of names) {
        expect(name.trim()).not.toBe('');
        // 名字会写进 PSD 与图层面板，残留占位符会一路带下去
        expect(name).not.toContain('{');
      }
    }
  });
});
