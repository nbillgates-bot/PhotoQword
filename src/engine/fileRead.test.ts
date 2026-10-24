/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it, vi } from 'vitest';
import { ReadCancelled, createYielder, readFileWithProgress, throwIfCancelled } from './fileRead';

/** 造一个内容可控的文件 */
function makeFile(bytes: number, name = '测试.psd'): File {
  return new File([new Uint8Array(bytes).fill(7)], name);
}

describe('throwIfCancelled', () => {
  it('没有 signal 时不抛', () => {
    expect(() => throwIfCancelled(undefined)).not.toThrow();
  });

  it('signal 未取消时不抛', () => {
    expect(() => throwIfCancelled(new AbortController().signal)).not.toThrow();
  });

  it('已取消时抛 ReadCancelled', () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfCancelled(controller.signal)).toThrow(ReadCancelled);
  });

  /*
   * docSlice 靠 err.name 认取消，而不是 instanceof——ReadCancelled 定义在
   * 动态 import 的那半边，为了判类型静态引进来会把 ag-psd 拖回主包。
   * 所以 name 是对外契约，改名就等于把「取消不弹红条」这条逻辑弄坏。
   */
  it('name 是 ReadCancelled，调用方靠它认取消', () => {
    const controller = new AbortController();
    controller.abort();
    try {
      throwIfCancelled(controller.signal);
      expect.unreachable('应该抛出来');
    } catch (err) {
      expect(err instanceof Error && err.name).toBe('ReadCancelled');
    }
  });
});

describe('readFileWithProgress', () => {
  it('读出的字节数和文件一致', async () => {
    const buffer = await readFileWithProgress(makeFile(64));
    expect(buffer.byteLength).toBe(64);
    expect(new Uint8Array(buffer)[0]).toBe(7);
  });

  it('空文件也能读，不卡住', async () => {
    const buffer = await readFileWithProgress(makeFile(0));
    expect(buffer.byteLength).toBe(0);
  });

  /*
   * 进度只断言「落在 0-1 之间」和「读完不超过 1」，不断言回调次数。
   * onprogress 触发几次由浏览器（这里是 jsdom）决定，
   * 写死次数等于把测试绑在实现上，换个环境就红。
   */
  it('报出的进度都在 0-1 之间', async () => {
    const seen: number[] = [];
    await readFileWithProgress(makeFile(1024), (ratio) => seen.push(ratio));
    for (const ratio of seen) {
      expect(ratio).toBeGreaterThanOrEqual(0);
      expect(ratio).toBeLessThanOrEqual(1);
      expect(Number.isNaN(ratio)).toBe(false);
    }
  });

  it('进度不倒退', async () => {
    const seen: number[] = [];
    await readFileWithProgress(makeFile(4096), (ratio) => seen.push(ratio));
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  it('进 Promise 之前就已取消，直接拒绝', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readFileWithProgress(makeFile(64), undefined, controller.signal)).rejects.toThrow(
      ReadCancelled,
    );
  });

  it('读的过程中取消，抛 ReadCancelled', async () => {
    const controller = new AbortController();
    const promise = readFileWithProgress(makeFile(1 << 20), undefined, controller.signal);
    // 同一轮微任务里就 abort：此时 FileReader 已经开始读了
    controller.abort();
    await expect(promise).rejects.toThrow(ReadCancelled);
  });

  it('取消后不再报进度', async () => {
    const controller = new AbortController();
    const onProgress = vi.fn();
    const promise = readFileWithProgress(makeFile(1 << 20), onProgress, controller.signal);
    controller.abort();
    await expect(promise).rejects.toThrow(ReadCancelled);
    const countAtAbort = onProgress.mock.calls.length;
    // 再等几轮事件循环，确认没有迟到的进度回调
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(onProgress.mock.calls.length).toBe(countAtAbort);
  });
});

describe('createYielder', () => {
  /*
   * 让行器的价值全在「不是每次都让」上：每层都让的话，
   * 浏览器把嵌套 setTimeout 钳到 4ms，200 层白搭 800ms。
   * 所以这一组测的是节流行为本身，不是它内部用了什么定时器。
   */
  it('刚建好就问，不用让行', () => {
    const yieldNow = createYielder(50);
    expect(yieldNow()).toBeNull();
  });

  it('时间没到之前连问多次都不让行', () => {
    const yieldNow = createYielder(10_000);
    for (let i = 0; i < 100; i += 1) expect(yieldNow()).toBeNull();
  });

  it('攒够时间后给出一个能 await 的 Promise', async () => {
    const yieldNow = createYielder(1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const pause = yieldNow();
    expect(pause).toBeInstanceOf(Promise);
    // 必须真的能 resolve，否则整个打开流程会挂在这儿
    await expect(pause).resolves.toBeUndefined();
  });

  /*
   * 自己掌控时钟，不靠真实耗时。
   *
   * 原来的写法是「睡 60ms 让它该让行，await 之后再问一次」，靠的是
   * 「await 一次 setTimeout(0) 用不了 50ms」。机器一忙这个前提就不成立——
   * 跑全量测试时这条会随机变红。计时有没有重置是纯逻辑，不该由负载决定。
   */
  it('让行之后计时重新起算', async () => {
    let clock = 1000;
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      const yieldNow = createYielder(50);

      clock += 60; // 攒够一个分片
      const first = yieldNow();
      expect(first).toBeInstanceOf(Promise);
      await first;

      // 让行那一刻计时已重置，此刻距上次让行只有 10ms
      clock += 10;
      expect(yieldNow()).toBeNull();

      // 再攒够就该继续让行，证明重置的是起点而不是把它关掉了
      clock += 45;
      expect(yieldNow()).toBeInstanceOf(Promise);
    } finally {
      spy.mockRestore();
    }
  });

  it('sliceMs 为 0 时每次都让行', () => {
    const yieldNow = createYielder(0);
    expect(yieldNow()).toBeInstanceOf(Promise);
    expect(yieldNow()).toBeInstanceOf(Promise);
  });
});
