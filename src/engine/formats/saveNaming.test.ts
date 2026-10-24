/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { buildSaveName, cleanBaseName, extensionFor, stripKnownExt } from './saveNaming';
import { formatById } from './registry';
import { PSD_MAX_SIDE } from '../psdNaming';

const SMALL = { width: 800, height: 600 };

describe('stripKnownExt', () => {
  it('剥掉已知的扩展名', () => {
    expect(stripKnownExt('风景.psd')).toBe('风景');
    expect(stripKnownExt('稿子.jpg')).toBe('稿子');
    expect(stripKnownExt('封面.PNG')).toBe('封面'); // 大小写不敏感
  });

  it('不认识的后缀不动', () => {
    expect(stripKnownExt('v1.2')).toBe('v1.2');
    expect(stripKnownExt('文档.终稿')).toBe('文档.终稿');
  });

  it('没有点也不误剥', () => {
    expect(stripKnownExt('未命名')).toBe('未命名');
  });
});

describe('cleanBaseName', () => {
  it('去掉首尾空白', () => {
    expect(cleanBaseName('  稿子  ')).toBe('稿子');
  });

  it('剔掉文件系统不接受的字符', () => {
    expect(cleanBaseName('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });

  it('剔掉控制字符', () => {
    // 用 fromCharCode 构造，避免把裸控制字节写进源文件（grep 会把它当二进制）
    const raw = `a${String.fromCharCode(0)}b${String.fromCharCode(31)}c`;
    expect(cleanBaseName(raw)).toBe('abc');
  });

  it('名字里的点保留', () => {
    expect(cleanBaseName('v1.2')).toBe('v1.2');
  });

  it('空名字退回兜底，不会存出只有扩展名的文件', () => {
    expect(cleanBaseName('')).toBe('未命名');
    expect(cleanBaseName('   ')).toBe('未命名');
    expect(cleanBaseName('///')).toBe('未命名');
  });

  it('兜底名可以指定', () => {
    expect(cleanBaseName('', '草稿')).toBe('草稿');
  });
});

describe('extensionFor', () => {
  it('普通格式给自己的主扩展名', () => {
    expect(extensionFor(formatById('png'), SMALL)).toBe('png');
    expect(extensionFor(formatById('jpeg'), SMALL)).toBe('jpg');
    expect(extensionFor(formatById('tiff'), SMALL)).toBe('tif');
  });

  it('PSD 遇到超限尺寸自动改成 psb', () => {
    const huge = { width: PSD_MAX_SIDE + 1, height: 100 };
    expect(extensionFor(formatById('psd'), huge)).toBe('psb');
    // 正好等于上限还是 psd
    expect(extensionFor(formatById('psd'), { width: PSD_MAX_SIDE, height: PSD_MAX_SIDE })).toBe(
      'psd',
    );
  });

  it('其他格式不受 PSD 尺寸上限影响', () => {
    const huge = { width: PSD_MAX_SIDE + 1, height: 100 };
    expect(extensionFor(formatById('png'), huge)).toBe('png');
  });
});

describe('buildSaveName', () => {
  it('补上所选格式的扩展名', () => {
    expect(buildSaveName('风景', formatById('psd'), SMALL)).toBe('风景.psd');
    expect(buildSaveName('风景', formatById('png'), SMALL)).toBe('风景.png');
  });

  it('用户敲的扩展名被换成所选格式的', () => {
    // 在下拉里选了 PNG，名字里却写着 .psd，应该听下拉的
    expect(buildSaveName('风景.psd', formatById('png'), SMALL)).toBe('风景.png');
  });

  it('同格式的扩展名不会重复叠加', () => {
    expect(buildSaveName('风景.png', formatById('png'), SMALL)).toBe('风景.png');
    expect(buildSaveName('风景.PNG', formatById('png'), SMALL)).toBe('风景.png');
  });

  it('超限文档存 PSD 时纠正为 psb', () => {
    const huge = { width: PSD_MAX_SIDE + 1, height: 100 };
    expect(buildSaveName('长图.psd', formatById('psd'), huge)).toBe('长图.psb');
  });
});