/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';

/*
 * 这份测试守的是打包体积，不是功能。
 *
 * ag-psd 约 287 kB，只在真正读写 PSD 时才需要，所以 psdIO 走动态 import。
 * 但只要主包里任何一处**静态** import 了 psdIO（或直接 import ag-psd），
 * 打包器就会把整个库拉回首屏，动态 import 白做，而且这事不会有任何报错——
 * 只有产物体积悄悄涨回去。所以在这里钉住。
 *
 * 新增 PSD 相关代码时如果这条挂了，正确的做法是改成 await import('./psdIO')，
 * 或者把不依赖 ag-psd 的部分挪到 psdNaming.ts，而不是放宽这条断言。
 */

/*
 * 用 import.meta.glob 而不是 node:fs 读源码：
 * tsconfig.app.json 的 types 里只有 vite/client，没有 node。
 * 这是故意的——浏览器代码不该能用 Node API，为了这个测试往 app 的
 * types 里加 "node"，等于把整个 src 的这道防线拆了，代价太大。
 */
const SOURCES: Record<string, string> = import.meta.glob('../**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * 把 glob 的键归一成相对 src 的路径。
 * glob 给的键是相对**本文件所在目录**的：同目录是 './psdIO.ts'，
 * 别的目录是 '../store/docSlice.ts'。统一成 'engine/psdIO.ts' 这种形式好断言。
 */
function toSrcPath(globKey: string): string {
  if (globKey.startsWith('./')) return `engine/${globKey.slice(2)}`;
  return globKey.replace(/^\.\.\//, '');
}

/** src 下的源码，去掉测试文件 */
const APP_SOURCES = Object.entries(SOURCES)
  .filter(([path]) => !path.includes('.test.'))
  .map(([path, code]) => [toSrcPath(path), code] as const);

/**
 * 静态 import 了该模块、且会产生运行时依赖的文件。
 *
 * 两种不算：
 * - `await import('...')`，那正是我们要的写法；
 * - `import type { ... } from '...'`，类型在编译期就擦掉了，不进产物。
 */
function staticImportersOf(module: string): string[] {
  /*
   * 开头的 (?!type\s) 排掉 `import type` / `export type`，类型编译期就擦掉了。
   * 动态 import 后面跟的是括号不是 from，所以自然不会命中。
   * `export ... from` 也得算：它和静态 import 一样是运行时依赖，
   * psdIO 这个转出入口本身就是这么写的。
   */
  const pattern = new RegExp(
    `(?:import|export)\\s+(?!type\\s)[^;]*?from\\s+'[^']*${module}'`,
    's',
  );
  return APP_SOURCES.filter(([, code]) => pattern.test(code)).map(([path]) => path);
}

/** PSD 相关模块。它们之间可以互相静态 import，对外只能走 psdIO 的动态 import */
const PSD_MODULES = [
  'engine/psdIO.ts',
  'engine/psdRead.ts',
  'engine/psdWrite.ts',
  'engine/psdLayers.ts',
];

describe('ag-psd 不能进主包', () => {
  it('源码确实读到了，不是空跑', () => {
    // 没有这条，glob 万一没匹配上，下面几条会因为「没有文件」而假绿
    expect(APP_SOURCES.length).toBeGreaterThan(50);
    expect(APP_SOURCES.map(([path]) => path)).toContain('engine/psdIO.ts');
  });

  it('只有 psdRead / psdWrite / psdLayers 静态 import ag-psd', () => {
    // psdBlendMap 只取 ag-psd 的类型，type-only import 不产生运行时依赖
    expect(staticImportersOf('ag-psd').sort()).toEqual([
      'engine/psdLayers.ts',
      'engine/psdRead.ts',
      'engine/psdWrite.ts',
    ]);
  });

  it('没有任何模块静态 import psdIO', () => {
    expect(staticImportersOf('psdIO')).toEqual([]);
  });

  /*
   * 绕开 psdIO 直接静态 import psdRead / psdWrite / psdLayers，
   * 效果和 import psdIO 一样糟：ag-psd 照样进主包。
   * 所以这几个也只准被 PSD 模块自己引用。
   */
  it('psdRead / psdWrite / psdLayers 只被 PSD 模块自己引用', () => {
    for (const module of ['psdRead', 'psdWrite', 'psdLayers']) {
      const outsiders = staticImportersOf(module).filter((path) => !PSD_MODULES.includes(path));
      expect(outsiders).toEqual([]);
    }
  });

  it('psdNaming 一个 import 都没有，才敢让它留在主包里', () => {
    /*
     * 断言的是「没有 import 语句」而不是「原文里没有 ag-psd 这几个字」——
     * 它的头注释正是在解释为什么要跟 ag-psd 分开，按原文查会把注释当违规。
     */
    const entry = APP_SOURCES.find(([path]) => path === 'engine/psdNaming.ts');
    expect(entry).toBeDefined();
    expect(entry?.[1]).not.toMatch(/^\s*import\s/m);
  });
});
