/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { fromPsdBlend, toPsdBlend } from './psdBlendMap';
import { BLEND_MODES } from '../types';

describe('toPsdBlend', () => {
  it('我们的每个混合模式都有 PSD 对应写法', () => {
    for (const { value } of BLEND_MODES) {
      expect(toPsdBlend(value)).toBeTruthy();
    }
  });

  it('穿透映射成 PSD 的 pass through', () => {
    expect(toPsdBlend('pass-through')).toBe('pass through');
  });

  it('连字符名映射成 PSD 的空格名', () => {
    expect(toPsdBlend('color-dodge')).toBe('color dodge');
    expect(toPsdBlend('linear-burn')).toBe('linear burn');
    expect(toPsdBlend('hard-mix')).toBe('hard mix');
  });
});

describe('fromPsdBlend', () => {
  it('缺失时按正常处理', () => {
    expect(fromPsdBlend(undefined)).toBe('normal');
  });

  it('我们没实现的模式退化成正常，不抛错', () => {
    // 溶解、深色、浅色、减去、划分：PSD 有，我们的合成器没有
    expect(fromPsdBlend('dissolve')).toBe('normal');
    expect(fromPsdBlend('darker color')).toBe('normal');
    expect(fromPsdBlend('lighter color')).toBe('normal');
    expect(fromPsdBlend('subtract')).toBe('normal');
    expect(fromPsdBlend('divide')).toBe('normal');
  });

  it('往返一圈不变形', () => {
    for (const { value } of BLEND_MODES) {
      expect(fromPsdBlend(toPsdBlend(value))).toBe(value);
    }
  });

  it('穿透也能往返', () => {
    expect(fromPsdBlend(toPsdBlend('pass-through'))).toBe('pass-through');
  });
});
