/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 帧预算任务队列：把一批昂贵的小任务摊到多帧里跑，每帧只占固定时长。
 *
 * 为什么需要:287 个图层的 PSD 打开时,每个图层面板行各自 requestAnimationFrame
 * 一个缩略图任务,浏览器会在同一帧里把 574 个回调全部执行完——rAF 不是
 * 「每帧一个」,是「下一帧把排队的全跑掉」。单个任务几毫秒,加起来就是
 * 打开文件最后僵住的那几秒。
 *
 * 队列按 key 去重,同 key 的后来者覆盖先前的:图层像素连续变化时
 * 只有最后一次值得算,中间那些结果还没上屏就过期了。
 *
 * 放在 hooks/ 而不是 engine/:它是副作用调度器(依赖 rAF 与时钟),
 * 不是纯计算,engine/ 那一层不该出现这种东西。
 */

/**
 * 每帧的执行预算。
 *
 * 16.7ms 是 60fps 的一整帧,全用掉就没时间合成与响应输入了。留 8ms 给任务、
 * 其余留给渲染与事件,这样刷缩略图时界面仍然跟手——慢一点没关系,卡住不行。
 */
const BUDGET_MS = 8;

const queue = new Map<string, () => void>();
let handle = 0;

function flush(): void {
  handle = 0;
  const start = performance.now();

  /*
   * 开帧时先固定住这一轮要处理的 key,不直接迭代 queue。
   *
   * 两个原因:
   * 1. Map 的迭代器**会**访问迭代期间新插入的项。直接迭代的话,任务里重排
   *    自己会在本轮被当场执行,「重排 = 推到下一帧」的语义就没了。
   * 2. 更要紧的是防挂死。performance.now 的精度可以被浏览器压低
   *    (Firefox 与 Safari 出于隐私会夹到 1ms 甚至更粗),一个总是重排自己的
   *    任务遇上不前进的时钟,`now - start >= BUDGET_MS` 会一直不成立,
   *    边迭代边插入就是死循环。定长快照让本轮的上界是确定的。
   */
  const batch = Array.from(queue.keys());
  for (const key of batch) {
    const task = queue.get(key);
    // 本轮开始后被 cancel 掉了(比如那一行滚出视野、组件卸载)
    if (!task) continue;
    queue.delete(key);
    task();
    if (performance.now() - start >= BUDGET_MS) break;
  }

  // 没跑完的、以及本轮新排进来的,下一帧接着跑
  if (queue.size > 0) schedule();
}

function schedule(): void {
  if (handle !== 0) return;
  handle = requestAnimationFrame(flush);
}

/**
 * 排入一个任务。同 key 重复排入时只保留最后一个。
 *
 * 不保证执行时机,只保证「不会把主线程占死」。调用方必须能接受
 * 结果晚几帧才到(缩略图晚一点出现是可以的,PS 也是渐进出图)。
 */
export function enqueueFrameTask(key: string, task: () => void): void {
  queue.set(key, task);
  schedule();
}

/** 撤销尚未执行的任务。组件卸载时调,避免对着已卸载的组件 setState */
export function cancelFrameTask(key: string): void {
  queue.delete(key);
}

/** 清空队列。只给测试用:模块级状态跨用例残留会让断言互相干扰 */
export function resetFrameQueue(): void {
  queue.clear();
  if (handle !== 0) {
    cancelAnimationFrame(handle);
    handle = 0;
  }
}

/** 队列里还剩多少个任务。给测试断言用 */
export function pendingFrameTasks(): number {
  return queue.size;
}
