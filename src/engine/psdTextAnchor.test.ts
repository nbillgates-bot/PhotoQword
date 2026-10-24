/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { baselineToTop, boxAnchor, mapPoint, pointAnchor, toAffine } from './psdTextAnchor';

/**
 * 报的 bug：PSD 里的居中文字层，一点进编辑就整体左移。
 * 根因是位置只用了图层 ink 边界，把 transform 矩阵的平移量丢了 ——
 * 居中时落笔点该是中线，ink 左边却被当成了落笔点，于是绕自己左边居中。
 * 这个文件测的是补上的那一步换算：文字引擎坐标 → 文档坐标。
 */

const FONT = '400 40px sans-serif';

describe('toAffine', () => {
  it('六个数按 [a, b, c, d, tx, ty] 取', () => {
    expect(toAffine([1, 2, 3, 4, 5, 6])).toEqual({ a: 1, b: 2, c: 3, d: 4, tx: 5, ty: 6 });
  });

  it('缺失或长度不足时给 null，让调用方退回 ink 原点', () => {
    expect(toAffine(undefined)).toBeNull();
    expect(toAffine([1, 0, 0, 1, 5])).toBeNull();
  });

  it('含非有限数时给 null，不能把 NaN 放进坐标', () => {
    expect(toAffine([1, 0, 0, 1, NaN, 0])).toBeNull();
    expect(toAffine([1, 0, 0, Infinity, 0, 0])).toBeNull();
  });
});

describe('mapPoint', () => {
  it('单位矩阵只做平移', () => {
    expect(mapPoint({ a: 1, b: 0, c: 0, d: 1, tx: 30, ty: 70 }, 0, 0)).toEqual({ x: 30, y: 70 });
  });

  it('缩放和平移一起算', () => {
    expect(mapPoint({ a: 2, b: 0, c: 0, d: 3, tx: 10, ty: 20 }, 5, 5)).toEqual({ x: 20, y: 35 });
  });

  it('带切变项时 x 也吃 y 的贡献', () => {
    expect(mapPoint({ a: 1, b: 0, c: 2, d: 1, tx: 0, ty: 0 }, 1, 10)).toEqual({ x: 21, y: 10 });
  });
});

describe('baselineToTop', () => {
  it('是个正的有限数，且随字号变大', () => {
    const small = baselineToTop('400 20px sans-serif', 20, 1.2);
    const large = baselineToTop('400 80px sans-serif', 80, 1.2);

    expect(Number.isFinite(small)).toBe(true);
    expect(small).toBeGreaterThan(0);
    // 只断趋势不断具体值：字体度量拿不到时会退化成按字号估，两条路径的数值不同
    expect(large).toBeGreaterThan(small);
  });

  it('行高变大时基线跟着往下走（半行距变宽）', () => {
    const tight = baselineToTop(FONT, 40, 1);
    const loose = baselineToTop(FONT, 40, 2);

    expect(loose).toBeGreaterThan(tight);
  });
});

describe('pointAnchor', () => {
  const base = { layerLeft: 100, layerTop: 200, cssFont: FONT, fontSize: 40, lineHeight: 1.2 };

  it('有矩阵时横向直接取矩阵的平移量，不再掺 ink 左边', () => {
    // ink 边界故意给一个和矩阵差很远的值：新路径不该再理它
    const anchor = pointAnchor({
      ...base,
      m: toAffine([1, 0, 0, 1, 360, 500]),
      pointBase: [0, 0],
    });

    expect(anchor.x).toBe(360);
  });

  it('纵向从基线退回行盒顶端，所以比矩阵的 ty 小一个基线偏移', () => {
    const m = toAffine([1, 0, 0, 1, 360, 500]);
    const anchor = pointAnchor({ ...base, m, pointBase: [0, 0] });

    expect(anchor.y).toBeCloseTo(500 - baselineToTop(FONT, 40, 1.2), 6);
    // 基线一定在行盒顶端下方，所以退完必然更靠上
    expect(anchor.y).toBeLessThan(500);
  });

  it('pointBase 非零时先过矩阵再算', () => {
    const anchor = pointAnchor({
      ...base,
      m: toAffine([2, 0, 0, 2, 10, 0]),
      pointBase: [5, 0],
    });

    expect(anchor.x).toBe(20); // 2*5 + 10
  });

  it('没有矩阵时退回旧约定：ink 原点 + 引擎坐标', () => {
    const anchor = pointAnchor({ ...base, m: null, pointBase: [7, 9] });

    expect(anchor).toEqual({ x: 107, y: 209 });
  });

  it('pointBase 缺失按 (0,0) 算，不产生 NaN', () => {
    const withMatrix = pointAnchor({ ...base, m: toAffine([1, 0, 0, 1, 40, 60]), pointBase: undefined });
    const noMatrix = pointAnchor({ ...base, m: null, pointBase: undefined });

    expect(Number.isNaN(withMatrix.x)).toBe(false);
    expect(Number.isNaN(withMatrix.y)).toBe(false);
    expect(withMatrix.x).toBe(40);
    expect(noMatrix).toEqual({ x: 100, y: 200 });
  });
});

describe('boxAnchor', () => {
  const base = { layerLeft: 100, layerTop: 200 };

  it('有矩阵时框的左上角取矩阵映射后的最小角', () => {
    const rect = boxAnchor({
      ...base,
      m: toAffine([1, 0, 0, 1, 300, 400]),
      boxBounds: [0, 0, 120, 60],
    });

    expect(rect).toEqual({ x: 300, y: 400, width: 120, height: 60 });
  });

  it('矩阵带缩放时宽高跟着放大，不能只减 boxBounds', () => {
    const rect = boxAnchor({
      ...base,
      m: toAffine([2, 0, 0, 3, 0, 0]),
      boxBounds: [0, 0, 100, 20],
    });

    // 只减 boxBounds 会得到 100×20，框小一半，居中的字跟着往左缩
    expect(rect.width).toBe(200);
    expect(rect.height).toBe(60);
  });

  it('引擎坐标为负（框绕锚点居中）时也落在矩阵指定的位置', () => {
    const rect = boxAnchor({
      ...base,
      m: toAffine([1, 0, 0, 1, 400, 300]),
      boxBounds: [-100, -10, 100, 30],
    });

    // 旧做法会算成 layerLeft + (-100) = 0，整框左移 100
    expect(rect).toEqual({ x: 300, y: 290, width: 200, height: 40 });
  });

  it('旋转矩阵取外接矩形，宽高为正', () => {
    // 90 度旋转：[0,1,-1,0]，宽高对调
    const rect = boxAnchor({
      ...base,
      m: toAffine([0, 1, -1, 0, 0, 0]),
      boxBounds: [0, 0, 100, 40],
    });

    expect(rect.width).toBe(40);
    expect(rect.height).toBe(100);
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  it('没有矩阵时退回旧约定，且分量反着写也能算对宽高', () => {
    const normal = boxAnchor({ ...base, m: null, boxBounds: [10, 20, 110, 70] });
    const flipped = boxAnchor({ ...base, m: null, boxBounds: [110, 70, 10, 20] });

    expect(normal).toEqual({ x: 110, y: 220, width: 100, height: 50 });
    expect(flipped.width).toBe(100);
    expect(flipped.height).toBe(50);
  });

  it('退化成零宽高时保底 1，canvas.width 不接受 0', () => {
    const rect = boxAnchor({ ...base, m: toAffine([1, 0, 0, 1, 0, 0]), boxBounds: [5, 5, 5, 5] });

    expect(rect.width).toBe(1);
    expect(rect.height).toBe(1);
  });
});
