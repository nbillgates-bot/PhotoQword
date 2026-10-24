/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addCustomLibrary,
  libraryNameFromFile,
  loadCustomLibraries,
  removeCustomLibrary,
} from './customLibraries';

const KEY = 'qword.colorLibraries';
const RED = { hex: '#ff0000', name: 'r' };
const BLUE = { hex: '#0000ff' };

beforeEach(() => {
  localStorage.clear();
});

describe('libraryNameFromFile', () => {
  it('去掉后缀', () => {
    expect(libraryNameFromFile('PANTONE Solid Coated.ase')).toBe('PANTONE Solid Coated');
  });

  it('去掉路径', () => {
    expect(libraryNameFromFile('C:\\colors\\my.aco')).toBe('my');
  });

  it('大写后缀也去掉', () => {
    expect(libraryNameFromFile('X.ASE')).toBe('X');
  });

  it('没有后缀时原样返回', () => {
    expect(libraryNameFromFile('plain')).toBe('plain');
  });
});

describe('存取', () => {
  it('没存过时读出空数组', () => {
    expect(loadCustomLibraries()).toEqual([]);
  });

  it('存进去能读回来', () => {
    addCustomLibrary('my.ase', [RED, BLUE]);
    const libraries = loadCustomLibraries();
    expect(libraries).toHaveLength(1);
    expect(libraries[0].name).toBe('my');
    expect(libraries[0].colors).toEqual([RED, BLUE]);
    expect(libraries[0].custom).toBe(true);
  });

  it('空色板不存', () => {
    expect(addCustomLibrary('my.ase', []).reasonKey).toBe('swatch.empty');
    expect(loadCustomLibraries()).toEqual([]);
  });

  it('同名文件再导一次是覆盖而不是攒两份', () => {
    addCustomLibrary('my.ase', [RED]);
    addCustomLibrary('my.ase', [RED, BLUE]);
    const libraries = loadCustomLibraries();
    expect(libraries).toHaveLength(1);
    expect(libraries[0].colors).toHaveLength(2);
  });

  it('不同文件各存一份', () => {
    addCustomLibrary('a.ase', [RED]);
    addCustomLibrary('b.ase', [BLUE]);
    expect(loadCustomLibraries()).toHaveLength(2);
  });

  it('能删掉指定色库', () => {
    addCustomLibrary('a.ase', [RED]);
    addCustomLibrary('b.ase', [BLUE]);
    const remaining = removeCustomLibrary('custom:a');
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe('b');
    expect(loadCustomLibraries()).toHaveLength(1);
  });

  it('删不存在的 id 不报错', () => {
    addCustomLibrary('a.ase', [RED]);
    expect(() => removeCustomLibrary('custom:nope')).not.toThrow();
    expect(loadCustomLibraries()).toHaveLength(1);
  });
});

describe('坏数据的容错', () => {
  it('存的不是 JSON 时退回空数组', () => {
    localStorage.setItem(KEY, '这不是 json');
    expect(loadCustomLibraries()).toEqual([]);
  });

  it('存的是 JSON 但不是数组时退回空数组', () => {
    localStorage.setItem(KEY, '{"a":1}');
    expect(loadCustomLibraries()).toEqual([]);
  });

  it('丢掉结构不对的条目，保留正常的', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'custom:ok', name: 'ok', colors: [RED], custom: true },
        { id: 'bad', name: 'bad' },
        { id: 'custom:badhex', name: 'x', colors: [{ hex: 'not-a-color' }], custom: true },
      ]),
    );
    const libraries = loadCustomLibraries();
    expect(libraries).toHaveLength(1);
    expect(libraries[0].id).toBe('custom:ok');
  });

  it('localStorage 读抛异常时退回空数组', () => {
    // 隐私模式下访问 localStorage 会直接抛，不能让拾色器打不开
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(loadCustomLibraries()).toEqual([]);
    spy.mockRestore();
  });

  it('localStorage 写不进去时报 storageFull', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(addCustomLibrary('my.ase', [RED]).reasonKey).toBe('swatch.storageFull');
    spy.mockRestore();
  });
});

describe('上限', () => {
  it('色块超过上限时截断而不是整个拒绝', () => {
    const many = Array.from({ length: 5000 }, () => RED);
    const outcome = addCustomLibrary('big.ase', many);
    expect(outcome.reasonKey).toBeUndefined();
    const colors = outcome.library?.colors ?? [];
    expect(colors.length).toBeLessThanOrEqual(4000);
    expect(colors.length).toBeGreaterThan(0);
  });

  it('色库数量到上限后拒绝新增', () => {
    for (let i = 0; i < 20; i += 1) addCustomLibrary(`lib${i}.ase`, [RED]);
    expect(addCustomLibrary('overflow.ase', [RED]).reasonKey).toBe('swatch.tooMany');
  });

  it('到上限后覆盖已有的那本仍然允许', () => {
    for (let i = 0; i < 20; i += 1) addCustomLibrary(`lib${i}.ase`, [RED]);
    // lib0 已存在，这是覆盖不是新增
    expect(addCustomLibrary('lib0.ase', [RED, BLUE]).reasonKey).toBeUndefined();
  });
});
