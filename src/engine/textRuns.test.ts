/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { applyRunColor, colorAt, normalizeRuns, shiftRunsForEdit } from './textRuns';

const RED = '#ff0000';
const BLUE = '#0000ff';
const BASE = '#000000';

describe('normalizeRuns', () => {
  it('丢掉空区间与反向区间', () => {
    expect(normalizeRuns([{ start: 2, end: 2, color: RED }])).toEqual([]);
    expect(normalizeRuns([{ start: 5, end: 3, color: RED }])).toEqual([]);
  });

  it('合并相邻同色段', () => {
    const runs = normalizeRuns([
      { start: 0, end: 2, color: RED },
      { start: 2, end: 4, color: RED },
    ]);
    expect(runs).toEqual([{ start: 0, end: 4, color: RED }]);
  });

  it('不合并相邻异色段', () => {
    const runs = normalizeRuns([
      { start: 2, end: 4, color: BLUE },
      { start: 0, end: 2, color: RED },
    ]);
    expect(runs).toEqual([
      { start: 0, end: 2, color: RED },
      { start: 2, end: 4, color: BLUE },
    ]);
  });
});

describe('colorAt', () => {
  const runs = [{ start: 1, end: 3, color: RED }];

  it('没有 runs 时一律返回基色', () => {
    expect(colorAt(undefined, 0, BASE)).toBe(BASE);
  });

  it('区间内取覆盖色，区间外取基色', () => {
    expect(colorAt(runs, 1, BASE)).toBe(RED);
    expect(colorAt(runs, 2, BASE)).toBe(RED);
    // end 是开区间，第 3 个字符不在内
    expect(colorAt(runs, 3, BASE)).toBe(BASE);
    expect(colorAt(runs, 0, BASE)).toBe(BASE);
  });
});

describe('applyRunColor', () => {
  it('空 runs 上色得到单段', () => {
    expect(applyRunColor(undefined, 1, 3, RED)).toEqual([{ start: 1, end: 3, color: RED }]);
  });

  it('空选区不产生段', () => {
    expect(applyRunColor(undefined, 2, 2, RED)).toEqual([]);
  });

  it('新段从中间挖开旧段，两侧各留一截', () => {
    const runs = applyRunColor([{ start: 0, end: 6, color: RED }], 2, 4, BLUE);
    expect(runs).toEqual([
      { start: 0, end: 2, color: RED },
      { start: 2, end: 4, color: BLUE },
      { start: 4, end: 6, color: RED },
    ]);
  });

  it('新段完整盖住旧段时旧段消失', () => {
    const runs = applyRunColor([{ start: 2, end: 4, color: RED }], 0, 6, BLUE);
    expect(runs).toEqual([{ start: 0, end: 6, color: BLUE }]);
  });

  it('区间互不重叠（applyRunColor 的不变式）', () => {
    let runs = applyRunColor(undefined, 0, 10, RED);
    runs = applyRunColor(runs, 3, 6, BLUE);
    runs = applyRunColor(runs, 5, 8, RED);
    for (let i = 1; i < runs.length; i += 1) {
      expect(runs[i].start).toBeGreaterThanOrEqual(runs[i - 1].end);
    }
  });
});

describe('shiftRunsForEdit', () => {
  const runs = [{ start: 2, end: 4, color: RED }];

  it('内容没变时原样返回', () => {
    expect(shiftRunsForEdit(runs, 'abcdef', 'abcdef', null)).toEqual(runs);
  });

  it('在前面插入字符，整段右移', () => {
    // 'abcdef' -> 'Xabcdef'，红色本来盖 cd，插一个字后应该还盖 cd
    const next = shiftRunsForEdit(runs, 'abcdef', 'Xabcdef', null);
    expect(next).toEqual([{ start: 3, end: 5, color: RED }]);
  });

  it('删掉前面的字符，整段左移', () => {
    const next = shiftRunsForEdit(runs, 'abcdef', 'bcdef', null);
    expect(next).toEqual([{ start: 1, end: 3, color: RED }]);
  });

  it('在后面追加字符不影响前面的段', () => {
    expect(shiftRunsForEdit(runs, 'abcdef', 'abcdefgh', null)).toEqual(runs);
  });

  it('删掉整个上色区间后段消失', () => {
    expect(shiftRunsForEdit(runs, 'abcdef', 'abef', null)).toEqual([]);
  });

  it('待用色套在新插入的字符上', () => {
    const next = shiftRunsForEdit(undefined, 'ab', 'aXb', BLUE);
    expect(next).toEqual([{ start: 1, end: 2, color: BLUE }]);
  });

  it('没有待用色时新字符继承左邻颜色', () => {
    // 在红色段 [2,4) 中间插字，插进去的也该是红的
    const next = shiftRunsForEdit(runs, 'abcdef', 'abcXdef', null);
    expect(colorAt(next, 3, BASE)).toBe(RED);
  });

  it('在最开头插字时用基色，不继承右边', () => {
    const next = shiftRunsForEdit([{ start: 0, end: 2, color: RED }], 'ab', 'Xab', null);
    expect(colorAt(next, 0, BASE)).toBe(BASE);
    expect(colorAt(next, 1, BASE)).toBe(RED);
  });

  it('清空内容后不留任何段', () => {
    expect(shiftRunsForEdit(runs, 'abcdef', '', null)).toEqual([]);
  });

  it('端点不会越界到内容长度之外', () => {
    const next = shiftRunsForEdit([{ start: 0, end: 6, color: RED }], 'abcdef', 'ab', null);
    for (const run of next) {
      expect(run.end).toBeLessThanOrEqual(2);
    }
  });
});
