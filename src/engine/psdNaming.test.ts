/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { isPsdFileName, needsPsb, PSD_MAX_SIDE, psdFileName, stripPsdExt } from './psdNaming';

/*
 * 用户输入的名字如何整理，测试在 formats/saveNaming.test.ts ——
 * 那部分逻辑随格式注册表走，已经从这里搬走了。
 */

describe('isPsdFileName', () => {
  it('认得 .psd 与 .psb，大小写都算', () => {
    expect(isPsdFileName('风景.psd')).toBe(true);
    expect(isPsdFileName('风景.PSD')).toBe(true);
    expect(isPsdFileName('大图.psb')).toBe(true);
    expect(isPsdFileName('大图.PsB')).toBe(true);
  });

  it('不认普通图片，也不认 .ps', () => {
    expect(isPsdFileName('照片.png')).toBe(false);
    expect(isPsdFileName('照片.jpg')).toBe(false);
    // 这条是 \.psb?$ 那个 bug 的反向哨兵：.ps 不该被当成 PSD
    expect(isPsdFileName('存档.ps')).toBe(false);
    expect(isPsdFileName('无扩展名')).toBe(false);
  });

  it('扩展名必须在末尾，出现在中间不算', () => {
    expect(isPsdFileName('模板.psd.bak')).toBe(false);
    expect(isPsdFileName('psd')).toBe(false);
  });
});

describe('stripPsdExt', () => {
  it('只去掉末尾的 psd / psb，文件名里的点保留', () => {
    expect(stripPsdExt('风景.psd')).toBe('风景');
    expect(stripPsdExt('大图.PSB')).toBe('大图');
    expect(stripPsdExt('v1.2.psd')).toBe('v1.2');
  });

  it('不是 PSD 的名字原样返回', () => {
    expect(stripPsdExt('照片.png')).toBe('照片.png');
    expect(stripPsdExt('存档.ps')).toBe('存档.ps');
  });
});

describe('needsPsb', () => {
  it('普通尺寸用 PSD', () => {
    expect(needsPsb({ width: 4000, height: 3000 })).toBe(false);
  });

  it('正好在 PSD 上限上还用 PSD', () => {
    expect(needsPsb({ width: PSD_MAX_SIDE, height: PSD_MAX_SIDE })).toBe(false);
  });

  it('超一个像素就要 PSB', () => {
    expect(needsPsb({ width: PSD_MAX_SIDE + 1, height: 100 })).toBe(true);
    expect(needsPsb({ width: 100, height: PSD_MAX_SIDE + 1 })).toBe(true);
  });

  it('1×1 也不需要 PSB', () => {
    expect(needsPsb({ width: 1, height: 1 })).toBe(false);
  });
});

describe('psdFileName', () => {
  it('普通尺寸给 .psd', () => {
    expect(psdFileName({ name: '风景', width: 1920, height: 1080 })).toBe('风景.psd');
  });

  it('超过 PSD 上限时给 .psb，宽或高单独超都算', () => {
    expect(psdFileName({ name: '长图', width: PSD_MAX_SIDE + 1, height: 100 })).toBe('长图.psb');
    expect(psdFileName({ name: '长图', width: 100, height: PSD_MAX_SIDE + 1 })).toBe('长图.psb');
  });

  it('正好等于上限还是 PSD', () => {
    expect(psdFileName({ name: '临界', width: PSD_MAX_SIDE, height: PSD_MAX_SIDE })).toBe(
      '临界.psd',
    );
  });

  it('文档名里已有的点不受影响', () => {
    expect(psdFileName({ name: 'v1.2', width: 10, height: 10 })).toBe('v1.2.psd');
  });
});
