/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkCanvasSize,
  maxCanvasArea,
  maxCanvasSide,
  resetCanvasLimitCache,
} from './canvasLimits';

describe('maxCanvasSide', () => {
  beforeEach(resetCanvasLimitCache);

  it('返回一个正的候选尺寸', () => {
    const side = maxCanvasSide();
    expect(side).toBeGreaterThan(0);
    // 不断言具体数值：探测结果取决于运行环境（规约 4.5，两条路径结论都要成立）
    expect(Number.isFinite(side)).toBe(true);
  });

  it('重复调用返回同一结果（探测被缓存）', () => {
    expect(maxCanvasSide()).toBe(maxCanvasSide());
  });

  it('重置缓存后仍返回一致结果', () => {
    const first = maxCanvasSide();
    resetCanvasLimitCache();
    expect(maxCanvasSide()).toBe(first);
  });
});

describe('checkCanvasSize', () => {
  beforeEach(resetCanvasLimitCache);

  it('常规尺寸通过', () => {
    expect(checkCanvasSize(1920, 1080).ok).toBe(true);
  });

  it('1×1 通过（边界值）', () => {
    expect(checkCanvasSize(1, 1).ok).toBe(true);
  });

  it('0 与负数被拒并给出原因', () => {
    for (const size of [0, -1, -100]) {
      const result = checkCanvasSize(size, 100);
      expect(result.ok).toBe(false);
      // 断言 key 而不是中文句子：改文案不该改测试（I18N.md §7）
      expect(result.reasonKey).toBe('error.size.notPositive');
    }
  });

  it('小于 1 的小数被拒（0.4 取整为 0）', () => {
    expect(checkCanvasSize(0.4, 100).ok).toBe(false);
  });

  it('NaN 与 Infinity 被拒', () => {
    expect(checkCanvasSize(Number.NaN, 100).ok).toBe(false);
    expect(checkCanvasSize(Number.POSITIVE_INFINITY, 100).ok).toBe(false);
  });

  it('过了单边但超面积时被拒，原因里提到百万像素', () => {
    /*
     * 必须构造"单边合法、面积超限"的尺寸，否则先撞单边上限就报另一种原因。
     * 从探测到的单边上限反推：宽取上限，高取刚好让面积越界的值。
     */
    const side = maxCanvasSide();
    const height = Math.min(side, Math.ceil(maxCanvasArea() / side) + 1);
    const result = checkCanvasSize(side, height);

    if (side * height > maxCanvasArea()) {
      expect(result.ok).toBe(false);
      expect(result.reasonKey).toBe('error.size.areaTooLarge');
      // 占位符取值要给全，否则界面上会留下 {megapixels}
      expect(result.reasonParams?.megapixels).toBeGreaterThan(0);
      expect(result.reasonParams?.max).toBeGreaterThan(0);
    } else {
      // 探测到的单边太小，凑不出超面积的尺寸；此时该尺寸合法，同样是正确结论
      expect(result.ok).toBe(true);
    }
  });

  it('单边超限时原因指向单边，而不是面积', () => {
    const side = maxCanvasSide();
    // 1 像素高，面积极小，只有单边越界
    const tooWide = checkCanvasSize(side + 1, 1);
    expect(tooWide.ok).toBe(false);
    expect(tooWide.reasonKey).toBe('error.size.sideTooLarge');
    expect(tooWide.reasonKey).not.toBe('error.size.areaTooLarge');
    // 词条里 {max} / {width} / {height} 三个占位符都要有值
    expect(tooWide.reasonParams).toMatchObject({ max: side, width: side + 1, height: 1 });
  });

  it('通过时不带原因', () => {
    const ok = checkCanvasSize(800, 600);
    expect(ok.reasonKey).toBeUndefined();
    expect(ok.reasonParams).toBeUndefined();
  });

  /*
   * 回归：790×16464 的长图 PSD 被误判成「单边超限」。
   *
   * 根因是单边探测建的是**方形**画布，32768² = 10.7 亿像素 = 4.3GB，
   * 失败在内存上而不是单边上，于是探测一路退到 16384，把这份只有 1300 万
   * 像素、完全能分配的文档判成超限。单边与面积是两个独立限制
   * （checkCanvasSize 也分开报），探测时就不能混在一起。
   */
  it('细长文档只要面积够小就通过，不受「方形能否分配」影响', () => {
    const result = checkCanvasSize(790, 16464);
    expect(result.ok).toBe(true);
    expect(result.reasonKey).toBeUndefined();
  });

  it('探测到的单边上限不小于同环境下细长条能达到的高度', () => {
    // 单边上限应当反映「一条 side×1 的窄条能不能建」，而不是「side² 的方块能不能建」
    expect(maxCanvasSide()).toBeGreaterThanOrEqual(16464);
  });
});
