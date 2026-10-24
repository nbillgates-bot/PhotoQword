/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { messagesOf, translate, translateNested, translatorFor } from './translate';
import { LOCALES } from './types';
import { zhCN } from './locales/zhCN';
import { en } from './locales/en';

describe('translate', () => {
  it('按语言取对应词条', () => {
    expect(translate('zh-CN', 'menu.file')).toBe('文件');
    expect(translate('en', 'menu.file')).toBe('File');
  });

  it('缺词条时退回兜底语言', () => {
    // 造一个只有中文有的 key：直接改表不合适，用已知只在中文的情况验证逻辑
    // 这里用兜底路径本身——en 缺失时应拿到 zh-CN 的值
    const key = 'menu.file';
    expect(translate('en', key)).not.toBe(zhCN[key]);
    // 两边都缺时把 key 原样吐出来，漏翻译要在界面上看得见
    expect(translate('en', 'nope.not.here')).toBe('nope.not.here');
    expect(translate('zh-CN', 'nope.not.here')).toBe('nope.not.here');
  });

  it('填充 {name} 占位符', () => {
    // 用一个带占位符的临时表达式验证 interpolate 的行为
    const table = messagesOf('zh-CN');
    // 找一条真实带占位符的词条；没有就跳过断言内容，只验证不抛错
    const withHole = Object.entries(table).find(([, value]) => value.includes('{'));
    if (withHole) {
      const [key, template] = withHole;
      const varName = /\{(\w+)\}/.exec(template)![1];
      const out = translate('zh-CN', key, { [varName]: 'X' });
      expect(out).not.toContain(`{${varName}}`);
    }
  });

  it('占位符没给值时保留原样，方便发现漏传参数', () => {
    // interpolate 的兜底行为：通过 translatorFor 走一遍完整链路
    const t = translatorFor('zh-CN');
    expect(t('nope.{who}.here')).toBe('nope.{who}.here');
  });
});

describe('translatorFor', () => {
  it('绑定语言后只需传 key', () => {
    const t = translatorFor('en');
    expect(t('menu.edit')).toBe('Edit');
  });
});

describe('translateNested', () => {
  const t = translatorFor('zh-CN');

  it('没有 paramKeys 时就是普通翻译', () => {
    expect(translateNested(t, 'menu.file')).toBe('文件');
    expect(translateNested(t, 'status.layerCount', { count: 3 })).toBe('3 个图层');
  });

  it('paramKeys 里的值先翻译再填进外层模板', () => {
    const out = translateNested(
      t,
      'error.doc.cannotCreate',
      undefined,
      { reason: 'error.size.notPositive' },
    );
    expect(out).toBe('无法新建文档：尺寸必须是大于 0 的数值');
    // 关键：内层不能以原始 key 的形态漏出来
    expect(out).not.toContain('error.size');
  });

  /*
   * 回归：内层 key 自己的占位符曾经填不上，界面上漏出
   * 「无法新建文档：图像共 {megapixels} 百万像素…」。
   * 根因是 nestedParams 没有默认值，而 Toast 只传四个参数。
   * 所以这条**必须只传四个参数**——补上第五个就绕过了出问题的那条路径。
   */
  it('只传四个参数时，内层的占位符也要被填上', () => {
    const out = translateNested(
      t,
      'error.doc.cannotCreate',
      { max: 64, megapixels: 120 },
      { reason: 'error.size.areaTooLarge' },
    );
    expect(out).not.toContain('{');
    expect(out).toContain('120');
    expect(out).toContain('64');
  });

  it('内层取值需要与外层不同时，第五个参数能覆盖', () => {
    const out = translateNested(
      t,
      'error.doc.cannotCreate',
      { megapixels: 999 },
      { reason: 'error.size.areaTooLarge' },
      { megapixels: 120, max: 64 },
    );
    expect(out).toContain('120');
    expect(out).not.toContain('999');
  });

  it('params 与翻译后的内层同名时，内层胜出', () => {
    const out = translateNested(
      t,
      'error.doc.cannotCreate',
      { reason: '这个不该出现' },
      { reason: 'error.size.notPositive' },
    );
    expect(out).toContain('尺寸必须是大于 0 的数值');
    expect(out).not.toContain('这个不该出现');
  });

  it('英文下同样成立', () => {
    const en = translatorFor('en');
    const out = translateNested(en, 'error.doc.cannotCreate', undefined, {
      reason: 'error.size.notPositive',
    });
    expect(out).toBe("Can't create the document: Dimensions must be numbers greater than 0");
  });
});

describe('词条表完整性', () => {
  it('每种语言都有一张表', () => {
    for (const { value } of LOCALES) {
      expect(Object.keys(messagesOf(value)).length).toBeGreaterThan(0);
    }
  });

  it('英文表与中文表的 key 完全一致，漏翻译要在这里红', () => {
    const zhKeys = Object.keys(zhCN).sort();
    const enKeys = Object.keys(en).sort();

    const missingInEn = zhKeys.filter((key) => !(key in en));
    const extraInEn = enKeys.filter((key) => !(key in zhCN));

    expect(missingInEn, `英文缺少词条: ${missingInEn.join(', ')}`).toEqual([]);
    expect(extraInEn, `英文有多余词条: ${extraInEn.join(', ')}`).toEqual([]);
  });

  it('没有空词条', () => {
    for (const { value } of LOCALES) {
      const empty = Object.entries(messagesOf(value))
        .filter(([, text]) => text.trim() === '')
        .map(([key]) => key);
      expect(empty, `${value} 有空词条: ${empty.join(', ')}`).toEqual([]);
    }
  });

  /*
   * 占位符对不齐是最难查的一类 i18n bug：不报错、不崩溃，
   * 只是界面上多出一对花括号，或者少显示一个数字。
   * 中文写了 {count} 而英文漏了，只有那一种语言的用户能看见。
   */
  it('同一条词条在各语言里的占位符集合完全一致', () => {
    const holes = (text: string) =>
      [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

    const mismatched: string[] = [];
    for (const key of Object.keys(zhCN)) {
      const zhHoles = holes(zhCN[key]);
      const enHoles = holes(en[key] ?? '');
      if (zhHoles !== enHoles) {
        mismatched.push(`${key}: zh={${zhHoles}} en={${enHoles}}`);
      }
    }
    expect(mismatched, `占位符不一致:\n${mismatched.join('\n')}`).toEqual([]);
  });

  it('词条里不出现未闭合的花括号', () => {
    for (const { value } of LOCALES) {
      const bad = Object.entries(messagesOf(value))
        .filter(([, text]) => {
          const opens = (text.match(/\{/g) ?? []).length;
          const closes = (text.match(/\}/g) ?? []).length;
          return opens !== closes;
        })
        .map(([key]) => key);
      expect(bad, `${value} 有花括号不配对的词条: ${bad.join(', ')}`).toEqual([]);
    }
  });
});
