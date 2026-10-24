/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '../engine/appError';
import { errorToToast, sizeCheckToast } from './errorMessage';
import { translateNested, translatorFor } from './translate';

describe('errorToToast', () => {
  it('AppError 用它自己的 key 与参数，不用兜底', () => {
    const err = new AppError('error.image.decodeFailed', { name: 'a.png' });
    expect(errorToToast(err, 'toast.openFailed')).toEqual({
      key: 'error.image.decodeFailed',
      params: { name: 'a.png' },
      paramKeys: undefined,
    });
  });

  it('AppError 的嵌套 key 也带出来', () => {
    const err = new AppError('error.psd.sizeExceeded', undefined, { reason: 'error.size.areaTooLarge' });
    expect(errorToToast(err, 'x').paramKeys).toEqual({ reason: 'error.size.areaTooLarge' });
  });

  it('普通 Error 走兜底词条，技术细节塞进 {reason}', () => {
    const out = errorToToast(new Error('Unexpected token'), 'error.save.failed');
    expect(out.key).toBe('error.save.failed');
    expect(out.params).toEqual({ reason: 'Unexpected token' });
  });

  it('message 为空的 Error 不编造原因', () => {
    const out = errorToToast(new Error(''), 'error.save.failed');
    expect(out.key).toBe('error.save.failed');
    expect(out.params).toBeUndefined();
  });

  it('非 Error 的值只用兜底词条', () => {
    for (const value of ['字符串', 42, null, undefined, {}]) {
      expect(errorToToast(value, 'toast.openFailed')).toEqual({ key: 'toast.openFailed' });
    }
  });
});

describe('sizeCheckToast', () => {
  it('把内层原因 key 放进 paramKeys，参数原样带上', () => {
    const check = {
      reasonKey: 'error.size.sideTooLarge',
      reasonParams: { max: 16384, width: 20000, height: 1 },
    };
    expect(sizeCheckToast(check, 'error.doc.cannotCreate')).toEqual({
      key: 'error.doc.cannotCreate',
      params: { max: 16384, width: 20000, height: 1 },
      paramKeys: { reason: 'error.size.sideTooLarge' },
    });
  });

  it('校验通过（没有 reasonKey）时不给 paramKeys', () => {
    expect(sizeCheckToast({}, 'error.doc.cannotCreate').paramKeys).toBeUndefined();
  });

  /*
   * 走 translateNested 而不是手工分两步 —— Toast 组件就是这么调的。
   * 早先这里手工翻内层再填外层，把「内层占位符填不上」那个 bug 绕过去了，
   * 结果只有在浏览器里切到英文才看得见。测试要走真实路径。
   */
  it('两种语言下都能翻成完整句子，不残留占位符', () => {
    const check = {
      reasonKey: 'error.size.areaTooLarge',
      reasonParams: { megapixels: 120, max: 64 },
    };
    const m = sizeCheckToast(check, 'error.doc.cannotCreate');
    for (const locale of ['zh-CN', 'en'] as const) {
      const full = translateNested(translatorFor(locale), m.key, m.params, m.paramKeys);
      expect(full).not.toContain('{');
      expect(full).toContain(String(check.reasonParams.megapixels));
      expect(full).toContain(String(check.reasonParams.max));
      // 内层不能以原始 key 的形态漏出来
      expect(full).not.toContain('error.size');
    }
  });
});
