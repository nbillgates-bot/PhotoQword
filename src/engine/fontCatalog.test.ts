/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { buildFontCatalog } from './fontCatalog';
import { FONT_FAMILIES } from './textRender';
import { webFontFamilyList } from './webFontSources';
import { isWebFontFamily } from './webFontSources';

/** 什么都没装的机器 */
const noneAvailable = () => false;
/** 什么都装了的机器 */
const allAvailable = () => true;

describe('webFontFamilyList', () => {
  it('返回的是家族名，不带字重后缀', () => {
    const families = webFontFamilyList().map((item) => item.family);
    expect(families.length).toBeGreaterThan(0);
    // 'Alibaba PuHuiTi 300' 这种键不能出现在下拉框里
    for (const family of families) {
      expect(family).not.toMatch(/\s\d{3}$/);
      // 每个都应当被白名单认得，否则选了也下载不到
      expect(isWebFontFamily(family)).toBe(true);
    }
  });

  it('同一家族的多个字重只出现一次', () => {
    const families = webFontFamilyList().map((item) => item.family);
    expect(families.length).toBe(new Set(families).size);
  });

  it('登记了思源与普惠体', () => {
    const families = webFontFamilyList().map((item) => item.family);
    expect(families).toContain('Noto Sans SC');
    expect(families).toContain('Noto Serif SC');
    expect(families).toContain('Alibaba PuHuiTi');
  });
});

describe('buildFontCatalog', () => {
  it('把 Web 字体并进清单——这是它们唯一的入口', () => {
    const catalog = buildFontCatalog(noneAvailable);
    const web = catalog.filter((entry) => entry.kind === 'web').map((entry) => entry.family);
    expect(web).toContain('Noto Sans SC');
    expect(web).toContain('Alibaba PuHuiTi');
  });

  it('本机装了的内置字体标成 system', () => {
    const catalog = buildFontCatalog(allAvailable);
    const arial = catalog.find((entry) => entry.family === 'Arial');
    expect(arial?.kind).toBe('system');
  });

  it('本机没装且下载不到的标成 missing，不假装可选', () => {
    const catalog = buildFontCatalog(noneAvailable);
    const arial = catalog.find((entry) => entry.family === 'Arial');
    expect(arial?.kind).toBe('missing');
  });

  it('家族名不重复，Web 字体不会同时出现在 system 档', () => {
    // 系统里正好也装了普惠体的情形
    const catalog = buildFontCatalog(allAvailable, ['Alibaba PuHuiTi', 'Arial']);
    const names = catalog.map((entry) => entry.family);
    expect(names.length).toBe(new Set(names).size);
    expect(catalog.find((entry) => entry.family === 'Alibaba PuHuiTi')?.kind).toBe('web');
  });

  it('枚举到的系统字体都进清单，并按名字排序', () => {
    const catalog = buildFontCatalog(noneAvailable, ['Zapfino', 'Baskerville', 'Menlo']);
    const system = catalog.filter((entry) => entry.kind === 'system').map((entry) => entry.family);
    expect(system.slice(0, 3)).toEqual(['Baskerville', 'Menlo', 'Zapfino']);
  });

  it('枚举失败（空数组）时退回内置清单，仍然可用', () => {
    const catalog = buildFontCatalog(allAvailable, []);
    const names = catalog.map((entry) => entry.family);
    for (const family of FONT_FAMILIES) expect(names).toContain(family);
  });

  it('内置清单里的每个字体都出现在结果中，不会被漏掉', () => {
    const catalog = buildFontCatalog(noneAvailable, ['Arial']);
    const names = new Set(catalog.map((entry) => entry.family));
    for (const family of FONT_FAMILIES) expect(names.has(family)).toBe(true);
  });

  it('web 档带上体积提示，供选单显示「约 5MB」', () => {
    const catalog = buildFontCatalog(noneAvailable);
    const puhuiti = catalog.find((entry) => entry.family === 'Alibaba PuHuiTi');
    expect(puhuiti?.approxMB).toBeGreaterThan(0);
  });

  it('空输入也不炸，至少给出内置清单加 Web 字体', () => {
    const catalog = buildFontCatalog(noneAvailable, []);
    expect(catalog.length).toBeGreaterThanOrEqual(FONT_FAMILIES.length);
  });
});
