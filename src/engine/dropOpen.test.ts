/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { planDrop } from './dropOpen';

describe('planDrop', () => {
  it('空列表没有可做的事', () => {
    expect(planDrop([], false)).toBeNull();
    expect(planDrop([], true)).toBeNull();
  });

  it('没有文档时一律按打开处理', () => {
    expect(planDrop(['a.png'], false)?.action).toBe('open');
    expect(planDrop(['a.psd'], false)?.action).toBe('open');
    // 认不出的扩展名也照样试着打开，解码失败由上层提示
    expect(planDrop(['a.xyz'], false)?.action).toBe('open');
    expect(planDrop(['无扩展名'], false)?.action).toBe('open');
  });

  it('已有文档时普通图片按置入处理', () => {
    expect(planDrop(['a.png'], true)?.action).toBe('place');
    expect(planDrop(['a.jpg'], true)?.action).toBe('place');
    expect(planDrop(['a.webp'], true)?.action).toBe('place');
  });

  it('PSD / PSB 即使已有文档也按打开处理', () => {
    expect(planDrop(['a.psd'], true)?.action).toBe('open');
    expect(planDrop(['a.psb'], true)?.action).toBe('open');
  });

  it('扩展名大小写不敏感', () => {
    expect(planDrop(['A.PSD'], true)?.action).toBe('open');
    expect(planDrop(['A.PsB'], true)?.action).toBe('open');
  });

  it('名字里带 psd 但扩展名不是的，仍按置入', () => {
    // 只看结尾的扩展名，不做子串匹配
    expect(planDrop(['psd-导出.png'], true)?.action).toBe('place');
    expect(planDrop(['a.psd.png'], true)?.action).toBe('place');
  });

  it('只处理第一个文件，其余计入 ignored', () => {
    expect(planDrop(['a.png'], false)?.ignored).toBe(0);
    expect(planDrop(['a.png', 'b.png'], false)?.ignored).toBe(1);
    expect(planDrop(['a.png', 'b.png', 'c.png'], true)?.ignored).toBe(2);
    // 取的始终是第一个
    expect(planDrop(['a.png', 'b.psd'], true)?.index).toBe(0);
    expect(planDrop(['a.png', 'b.psd'], true)?.action).toBe('place');
  });
});
