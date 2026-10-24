/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelFrameTask,
  enqueueFrameTask,
  pendingFrameTasks,
  resetFrameQueue,
} from './frameQueue';

/**
 * 手动驱动 rAF。
 *
 * 不用 jsdom 自带的 rAF：它按真实时间回调，测试要么加 sleep 要么不稳。
 * 换成「记下回调、由测试决定什么时候跑一帧」，队列的分帧行为才可断言。
 */
let frames: FrameRequestCallback[] = [];

/** 跑一帧：把当前排着的回调全部执行掉 */
function tick(): void {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

beforeEach(() => {
  frames = [];
  resetFrameQueue();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

afterEach(() => {
  resetFrameQueue();
  vi.unstubAllGlobals();
});

describe('frameQueue', () => {
  it('排入的任务不立即执行，要等到下一帧', () => {
    const task = vi.fn();
    enqueueFrameTask('a', task);
    expect(task).not.toHaveBeenCalled();
    tick();
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('同 key 重复排入只保留最后一个', () => {
    const first = vi.fn();
    const last = vi.fn();
    enqueueFrameTask('a', first);
    enqueueFrameTask('a', last);
    expect(pendingFrameTasks()).toBe(1);
    tick();
    expect(first).not.toHaveBeenCalled();
    expect(last).toHaveBeenCalledTimes(1);
  });

  it('不同 key 各自排队', () => {
    const a = vi.fn();
    const b = vi.fn();
    enqueueFrameTask('a', a);
    enqueueFrameTask('b', b);
    expect(pendingFrameTasks()).toBe(2);
    tick();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('cancel 掉的任务不会执行', () => {
    const task = vi.fn();
    enqueueFrameTask('a', task);
    cancelFrameTask('a');
    expect(pendingFrameTasks()).toBe(0);
    tick();
    expect(task).not.toHaveBeenCalled();
  });

  it('cancel 不存在的 key 不报错', () => {
    expect(() => cancelFrameTask('没有这个')).not.toThrow();
  });

  it('一帧只申请一次 rAF，不是每个任务一次', () => {
    enqueueFrameTask('a', () => {});
    enqueueFrameTask('b', () => {});
    enqueueFrameTask('c', () => {});
    expect(frames).toHaveLength(1);
  });

  /*
   * 这条是整个模块存在的理由：287 个图层的 PSD 打开时，574 个缩略图任务
   * 挤在同一帧跑完就是卡住几秒。超出预算必须留到下一帧。
   */
  it('超出帧预算时剩下的留到下一帧', () => {
    let now = 0;
    // 每个任务耗 5ms，预算 8ms：第二个跑完就超了，第三个必须等下一帧
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const order: string[] = [];
    const slow = (id: string) => () => {
      order.push(id);
      now += 5;
    };

    enqueueFrameTask('a', slow('a'));
    enqueueFrameTask('b', slow('b'));
    enqueueFrameTask('c', slow('c'));

    tick();
    expect(order).toEqual(['a', 'b']);
    expect(pendingFrameTasks()).toBe(1);

    tick();
    expect(order).toEqual(['a', 'b', 'c']);
    expect(pendingFrameTasks()).toBe(0);
  });

  it('没跑完时会自己续订下一帧，不需要外部再排', () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    enqueueFrameTask('a', () => {
      now += 100;
    });
    enqueueFrameTask('b', () => {});

    tick();
    // 预算用光后留下 b，并且已经申请了新的一帧
    expect(pendingFrameTasks()).toBe(1);
    expect(frames).toHaveLength(1);
  });

  it('任务里再排入同 key 不会被本轮当场吃掉', () => {
    const runs: number[] = [];
    let round = 0;
    enqueueFrameTask('a', function again() {
      round += 1;
      runs.push(round);
      // 只重排一次，避免测试自己写成死循环
      if (round === 1) enqueueFrameTask('a', again);
    });

    tick();
    expect(runs).toEqual([1]);
    expect(pendingFrameTasks()).toBe(1);
    tick();
    expect(runs).toEqual([1, 2]);
  });

  /*
   * 时钟不前进时也必须能出得来。
   *
   * performance.now 的精度会被浏览器压低（Firefox 与 Safari 出于隐私会夹到
   * 1ms 甚至更粗），一个总是重排自己的任务遇上不前进的时钟，如果实现是
   * 边迭代边插入就成死循环，整个页面挂死。定长快照保证本轮有确定的上界。
   */
  it('时钟完全不前进 + 任务无限重排自己，也只跑有限次', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    let runs = 0;
    enqueueFrameTask('a', function forever() {
      runs += 1;
      enqueueFrameTask('a', forever);
    });

    // 不加保护的实现会在这一行挂死
    tick();
    expect(runs).toBe(1);
    expect(pendingFrameTasks()).toBe(1);
  });

  it('reset 清空队列', () => {
    const task = vi.fn();
    enqueueFrameTask('a', task);
    resetFrameQueue();
    expect(pendingFrameTasks()).toBe(0);
    tick();
    expect(task).not.toHaveBeenCalled();
  });
});
