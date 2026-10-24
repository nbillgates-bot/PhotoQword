/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { formatSummary, percentile, summarize } from './frameStats';

describe('percentile', () => {
  it('空数组给 0，不抛错', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  it('单个样本时任何分位都是它自己', () => {
    expect(percentile([7], 0)).toBe(7);
    expect(percentile([7], 0.5)).toBe(7);
    expect(percentile([7], 1)).toBe(7);
  });

  it('ratio=0 取最小、ratio=1 取最大', () => {
    const samples = [5, 1, 9, 3];
    expect(percentile(samples, 0)).toBe(1);
    expect(percentile(samples, 1)).toBe(9);
  });

  it('不受输入顺序影响', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(percentile([5, 3, 1, 4, 2], 0.5));
  });

  it('不修改传入的数组', () => {
    const samples = [3, 1, 2];
    percentile(samples, 0.5);
    expect(samples).toEqual([3, 1, 2]);
  });

  it('ratio 越界时被夹住', () => {
    expect(percentile([1, 2, 3], -1)).toBe(1);
    expect(percentile([1, 2, 3], 2)).toBe(3);
  });

  it('P95 会抓住尾部的卡顿，而平均值会把它摊平', () => {
    // 90 个 10ms + 10 个 200ms：平均 29ms 看着还行，P95 必须暴露出 200ms 那一档
    const samples = [...Array(90).fill(10), ...Array(10).fill(200)];
    expect(percentile(samples, 0.95)).toBe(200);
    expect(summarize(samples).mean).toBeLessThan(30);
  });

  /*
   * 最近邻分位数的边界语义：恰好 5% 是慢帧时，P95 落在快慢交界上而不是慢的那侧
   * （100 个样本里 round(0.95×99)=94，正好是第 95 个快帧）。
   * 这不是 bug，是「最近邻不插值」的定义使然，写下来免得以后误当成算错。
   * 要盯住这种刚好 5% 的尾部就得看 max，所以 summarize 一直把 max 也带上。
   */
  it('恰好 5% 慢帧时 P95 落在交界处，max 仍能抓住', () => {
    const samples = [...Array(95).fill(10), ...Array(5).fill(200)];
    expect(percentile(samples, 0.95)).toBe(10);
    expect(summarize(samples).max).toBe(200);
  });
});

describe('summarize', () => {
  it('空数组给全 0', () => {
    expect(summarize([])).toEqual({ count: 0, p50: 0, p95: 0, max: 0, mean: 0 });
  });

  it('统计各项都对得上', () => {
    const result = summarize([10, 20, 30, 40]);
    expect(result.count).toBe(4);
    expect(result.max).toBe(40);
    expect(result.mean).toBe(25);
  });

  it('全是 0 的样本不产生 NaN', () => {
    const result = summarize([0, 0, 0]);
    expect(Number.isNaN(result.mean)).toBe(false);
    expect(result.mean).toBe(0);
    expect(result.max).toBe(0);
  });

  it('小于 1 的小数样本不丢精度也不出 NaN', () => {
    const result = summarize([0.2, 0.5, 0.9]);
    expect(Number.isNaN(result.mean)).toBe(false);
    expect(result.max).toBeCloseTo(0.9);
  });

  it('单样本', () => {
    expect(summarize([12])).toEqual({ count: 1, p50: 12, p95: 12, max: 12, mean: 12 });
  });
});

describe('formatSummary', () => {
  it('带上标签与帧数，且没有 NaN', () => {
    const text = formatSummary('缩放', summarize([10, 20]));
    expect(text).toContain('缩放');
    expect(text).toContain('2 帧');
    expect(text).not.toContain('NaN');
  });

  it('空样本也能格式化', () => {
    expect(formatSummary('空', summarize([]))).not.toContain('NaN');
  });
});
