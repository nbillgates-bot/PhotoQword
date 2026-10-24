/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  BOLD_WEIGHT,
  FONT_WEIGHTS,
  NORMAL_WEIGHT,
  clampWeight,
  nearestOf,
  nearestWeight,
} from './fontWeights';

/**
 * 字重表本身是数据，但 clampWeight 和 nearestWeight 是两道兜底闸门，
 * 漏了都是难查的静默故障：
 * - clampWeight 漏了越界值 → 整条 CSS font 字符串非法 → canvas 沿用上一个字体，
 *   画面上是文字整层消失，控制台不报错。
 * - nearestWeight 漏了档位之间的值（可变字体的 450）→ 下拉框显示空白。
 */

describe('FONT_WEIGHTS 字重表', () => {
  it('9 档齐全且从小到大', () => {
    expect(FONT_WEIGHTS.map((option) => option.value)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900,
    ]);
  });

  it('常规和粗体的常量在表里', () => {
    expect(FONT_WEIGHTS.some((option) => option.value === NORMAL_WEIGHT)).toBe(true);
    expect(FONT_WEIGHTS.some((option) => option.value === BOLD_WEIGHT)).toBe(true);
  });

  it('每档都有非空标签，不然下拉框会出空行', () => {
    for (const option of FONT_WEIGHTS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe('clampWeight 夹到合法范围', () => {
  it('范围内的值原样返回', () => {
    for (const weight of [1, 100, 400, 700, 900]) {
      expect(clampWeight(weight)).toBe(weight);
    }
  });

  it('越界值夹到边界', () => {
    expect(clampWeight(0)).toBe(1);
    expect(clampWeight(-100)).toBe(1);
    expect(clampWeight(1000)).toBe(900);
    expect(clampWeight(Number.MAX_SAFE_INTEGER)).toBe(900);
  });

  it('小数四舍五入', () => {
    expect(clampWeight(449.4)).toBe(449);
    expect(clampWeight(449.6)).toBe(450);
    expect(clampWeight(0.4)).toBe(1);
  });

  it('非有限值退回常规字重', () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(clampWeight(bad)).toBe(NORMAL_WEIGHT);
    }
  });

  it('结果一律是整数且没有 NaN', () => {
    for (const weight of [NaN, -5, 0.2, 450.5, 12345]) {
      const result = clampWeight(weight);
      expect(Number.isNaN(result)).toBe(false);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});

describe('nearestWeight 就近归一到某一档', () => {
  it('正好落在档上就返回那一档', () => {
    for (const option of FONT_WEIGHTS) {
      expect(nearestWeight(option.value)).toEqual(option);
    }
  });

  it('档位之间的值取更近的那档', () => {
    expect(nearestWeight(430).value).toBe(400);
    expect(nearestWeight(470).value).toBe(500);
    expect(nearestWeight(160).value).toBe(200);
  });

  it('正中间时取更轻的那档（严格小于的比较规则）', () => {
    expect(nearestWeight(450).value).toBe(400);
    expect(nearestWeight(650).value).toBe(600);
  });

  it('越界值先夹再取，落到首尾两档', () => {
    expect(nearestWeight(0).value).toBe(100);
    expect(nearestWeight(-999).value).toBe(100);
    expect(nearestWeight(5000).value).toBe(900);
  });

  it('非有限值落到常规档，控件不会显示空白', () => {
    // Infinity 走的是 clampWeight 的非有限分支，不是「大到夹成 900」那条
    for (const bad of [NaN, Infinity, -Infinity]) {
      expect(nearestWeight(bad).value).toBe(NORMAL_WEIGHT);
    }
  });

  it('返回的一定是表里的对象，不是临时拼的', () => {
    expect(FONT_WEIGHTS).toContain(nearestWeight(450));
    expect(FONT_WEIGHTS).toContain(nearestWeight(9999));
  });
});

/*
 * nearestOf 是 nearestWeight 的一般化：候选集由调用方给。
 * 可下载字体只有部分字重有完整字符集的文件（普惠体没有 900），
 * 那边的候选集是残缺的，不能拿完整 9 档去匹配。
 */
describe('nearestOf 在给定候选集里就近取', () => {
  const SPARSE = [100, 300, 400, 800];

  it('候选集里有就原样返回', () => {
    for (const weight of SPARSE) {
      expect(nearestOf(SPARSE, weight)).toBe(weight);
    }
  });

  it('候选集里没有就取最近的一个', () => {
    expect(nearestOf(SPARSE, 320)).toBe(300);
    expect(nearestOf(SPARSE, 700)).toBe(800);
    // 900 缺档时落到 800，剩下那点粗度差交给浏览器合成
    expect(nearestOf(SPARSE, 900)).toBe(800);
  });

  it('正中间取更轻的那个，和 nearestWeight 同规则', () => {
    expect(nearestOf(SPARSE, 200)).toBe(100);
    expect(nearestOf(SPARSE, 600)).toBe(400);
  });

  it('脏值先夹再取，一定落在候选集里', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -100, 5000]) {
      expect(SPARSE, `${bad} 落到了候选集外`).toContain(nearestOf(SPARSE, bad));
    }
  });

  it('只有一个候选时不管要什么都是它', () => {
    expect(nearestOf([400], 900)).toBe(400);
    expect(nearestOf([400], 100)).toBe(400);
  });

  it('候选集顺序不影响结果', () => {
    // 靠输入顺序才对的实现，换个 Object.keys 的枚举顺序就会悄悄变样
    expect(nearestOf([800, 100, 400, 300], 320)).toBe(300);
    expect(nearestOf([800, 100, 400, 300], 900)).toBe(800);
  });
});
