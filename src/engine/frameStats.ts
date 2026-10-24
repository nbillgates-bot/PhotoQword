/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 帧耗时统计：把一串样本压成 P50 / P95 这类分位数。
 *
 * 为什么要它：平均值会把卡顿摊平。滚 100 格里有 5 格花了 200ms，
 * 平均下来还是「不到 20ms」，看不出问题；而 P95 会直接把那 5 格暴露出来。
 * 优化前后要对比的是 P95 和最大值，不是平均值。
 *
 * 纯计算，不认识 rAF 也不认识 store——采样时机由调用方决定（见 useFrameProbe）。
 */

/** 一组样本的统计结果，单位与输入一致（毫秒） */
export interface FrameSummary {
  count: number;
  p50: number;
  p95: number;
  max: number;
  mean: number;
}

/**
 * 取分位数，最近邻法（不插值）。
 *
 * ratio 取 0~1，0 给最小值、1 给最大值。空数组返回 0：调用方通常在
 * 「还没采到样本」时就想打印一次，为此让它抛错不值得。
 *
 * 用最近邻而不是线性插值：样本量只有几十到几百，插值出来的小数没有意义，
 * 而「P95 就是某一次真实的帧耗时」更好解释。
 */
export function percentile(samples: readonly number[], ratio: number): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const clamped = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  const index = Math.round(clamped * (sorted.length - 1));
  return sorted[index];
}

/** 把样本压成一份统计。空数组给全 0，便于直接打印 */
export function summarize(samples: readonly number[]): FrameSummary {
  if (samples.length === 0) {
    return { count: 0, p50: 0, p95: 0, max: 0, mean: 0 };
  }
  let sum = 0;
  let max = samples[0];
  for (const value of samples) {
    sum += value;
    if (value > max) max = value;
  }
  return {
    count: samples.length,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max,
    mean: sum / samples.length,
  };
}

/** 一行人能读的摘要，给控制台用 */
export function formatSummary(label: string, summary: FrameSummary): string {
  const ms = (value: number) => value.toFixed(1);
  return (
    `[${label}] ${summary.count} 帧  ` +
    `P50 ${ms(summary.p50)}ms  P95 ${ms(summary.p95)}ms  ` +
    `最大 ${ms(summary.max)}ms  平均 ${ms(summary.mean)}ms`
  );
}
