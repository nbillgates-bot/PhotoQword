/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 压感的取值与换算。
 *
 * Pointer Events 规范规定：**鼠标按下时 pressure 恒为 0.5**，不是 1。
 * 直接把它喂给笔刷，size 100 的画笔实际只画出 70px（见下面的换算式），
 * 而且起笔那一下是全尺寸、后面变细——正是「笔刷大小和设置对不上」的来源。
 * 所以不能只判 `pressure > 0`，得先问「这个设备到底报不报压感」。
 *
 * 规约 §3.3 已经写了这个坑，这里是它的落地实现。
 */

/** 压感换算的下限系数：压到最轻也还有 0.4 倍粗，不然轻触等于什么都没画 */
const MIN_SCALE = 0.4;

/**
 * 这个指针事件该按多少压感算。
 *
 * 只信手写笔：
 * - `pen` —— Apple Pencil、Wacom 这些报的是真实力度，照用。
 * - `mouse` —— 规范规定的 0.5 是个占位值，不是「用户按了一半力」，一律按 1。
 * - `touch` —— 绝大多数触屏根本不报压感（值为 0 或 0.5），同样按 1。
 *   iPad 上想要压感就用 Apple Pencil，那会走 pen 分支。
 *
 * 笔报 0 也按 1：部分第三方触控笔在整笔过程中恒报 0，
 * 信了它就是一条完全画不出来的笔画。
 */
export function effectivePressure(pointerType: string, pressure: number): number {
  if (pointerType !== 'pen') return 1;
  if (!Number.isFinite(pressure) || pressure <= 0) return 1;
  // 夹到 1：驱动偶尔会报出略大于 1 的值，放过去会让笔尖比设定的还粗
  return Math.min(1, pressure);
}

/**
 * 压感对应的笔尖直径。
 *
 * 起笔那一下和后续线段都要用它，两处写同一个式子必然写歪一处
 * （之前 beginStroke 就是不乘压感、extendStroke 乘，同一笔粗细不一致）。
 * 最小 1px：小于一个像素的笔尖画不出任何东西。
 */
export function pressureSize(baseSize: number, pressure: number): number {
  const scale = MIN_SCALE + (1 - MIN_SCALE) * pressure;
  return Math.max(1, baseSize * scale);
}
