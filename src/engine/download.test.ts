/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadBlob } from './download';

/*
 * jsdom 没有实现 URL.createObjectURL / revokeObjectURL，
 * 也不会真的下载文件，所以这里桩掉这两个方法，
 * 断言的是「建了 URL、带着正确的文件名点了一次、之后把 URL 回收了」这套契约。
 */
describe('downloadBlob', () => {
  let created: Blob[];
  let revoked: string[];
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    revoked = [];
    clicked = [];
    let seq = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      created.push(blob);
      seq += 1;
      return `blob:mock/${seq}`;
    });
    URL.revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
    // 拦 click 而不是拦 createElement：这样链接的属性是真的被设上去的
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicked.push(this);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('用传入的 blob 建 URL，并以给定文件名触发一次点击', () => {
    const blob = new Blob(['abc'], { type: 'application/octet-stream' });
    downloadBlob(blob, '风景.psd');

    expect(created).toEqual([blob]);
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('风景.psd');
    expect(clicked[0].href).toBe('blob:mock/1');
  });

  it('点击的当下不回收 URL，等一个事件循环之后才回收', () => {
    downloadBlob(new Blob(['x']), 'a.psd');

    // 立刻 revoke 会让下载拿不到数据，所以这一步必须还没发生
    expect(revoked).toEqual([]);

    vi.runAllTimers();
    expect(revoked).toEqual(['blob:mock/1']);
  });

  it('连续两次下载各用自己的 URL，互不覆盖', () => {
    downloadBlob(new Blob(['1']), '第一张.png');
    downloadBlob(new Blob(['2']), '第二张.png');

    expect(clicked.map((link) => link.download)).toEqual(['第一张.png', '第二张.png']);
    expect(clicked.map((link) => link.href)).toEqual(['blob:mock/1', 'blob:mock/2']);

    vi.runAllTimers();
    expect(revoked).toEqual(['blob:mock/1', 'blob:mock/2']);
  });

  it('临时链接不留在 DOM 里', () => {
    downloadBlob(new Blob(['x']), 'a.psd');
    vi.runAllTimers();
    expect(document.querySelectorAll('a')).toHaveLength(0);
  });

  it('文件名里的中文和空格原样传给 download 属性', () => {
    downloadBlob(new Blob(['x']), '我的 作品 v2.psb');
    expect(clicked[0].download).toBe('我的 作品 v2.psb');
  });
});
