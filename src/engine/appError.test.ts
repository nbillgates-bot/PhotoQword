/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { AppError, isAppError } from './appError';

describe('AppError', () => {
  it('带上词条 key 与占位符取值', () => {
    const err = new AppError('error.size.sideTooLarge', { max: 16384 });
    expect(err.messageKey).toBe('error.size.sideTooLarge');
    expect(err.params).toEqual({ max: 16384 });
  });

  it('message 存的是 key，方便在控制台反查词条', () => {
    expect(new AppError('error.image.decodeFailed').message).toBe('error.image.decodeFailed');
  });

  it('支持嵌套 key（外层句子 + 内层原因）', () => {
    const err = new AppError('error.psd.sizeExceeded', { max: 100 }, { reason: 'error.size.areaTooLarge' });
    expect(err.paramKeys).toEqual({ reason: 'error.size.areaTooLarge' });
  });

  it('不传参数时两个字段都是 undefined，不是空对象', () => {
    const err = new AppError('error.image.decodeFailed');
    expect(err.params).toBeUndefined();
    expect(err.paramKeys).toBeUndefined();
  });

  it('name 固定为 AppError，跨模块判类型靠它', () => {
    expect(new AppError('x').name).toBe('AppError');
  });

  it('是 Error 的子类，能被 catch 住也能拿到 stack', () => {
    const err = new AppError('x');
    expect(err).toBeInstanceOf(Error);
    expect(typeof err.stack).toBe('string');
  });
});

describe('isAppError', () => {
  it('认自己', () => {
    expect(isAppError(new AppError('x'))).toBe(true);
  });

  it('不认普通 Error 与其他值', () => {
    expect(isAppError(new Error('普通错误'))).toBe(false);
    expect(isAppError(new TypeError('类型错误'))).toBe(false);
    expect(isAppError('字符串')).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
    expect(isAppError({ messageKey: 'x' })).toBe(false);
  });

  it('按 name 认，所以跨模块实例也认得出', () => {
    // 模拟另一份模块副本造出来的实例：原型链不同，但 name 相同
    const cross = new Error('error.x');
    cross.name = 'AppError';
    expect(isAppError(cross)).toBe(true);
  });
});
