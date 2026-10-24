/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 字符级颜色（PS 的字符样式里最常用的一项）。
 *
 * TextData.color 是整层的基色，colorRuns 在它之上按字符区间覆盖。
 * 没有 runs 的文字层就是纯单色，与改动前的行为完全一致 —— 老文档和
 * PSD 导入的图层都不带这个字段，读的时候一律按「整层单色」处理。
 *
 * 区间用半开区间 [start, end)，与 textarea 的 selectionStart/End 同一套坐标，
 * 省去两边换算。纯函数，不认识 React 也不认识 store（规约 §2.1）。
 *
 * ColorRun 本身定义在 types/ 里：领域模型归 types，这里只放操作它的算法。
 */

import type { ColorRun } from '../types';

export type { ColorRun };

/**
 * 归一化：丢掉空区间、按起点排序、合并相邻且同色的段。
 *
 * 每次改动后都要过一遍，否则反复上色会攒出一堆碎片段
 * （同色相邻不合并的话，渲染时会按边界切开逐段 fillText，
 * 跨段的字距和字偶间距就丢了）。
 */
export function normalizeRuns(runs: ColorRun[]): ColorRun[] {
  const valid = runs
    .filter((run) => run.end > run.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: ColorRun[] = [];
  for (const run of valid) {
    const last = merged[merged.length - 1];
    if (last && last.color === run.color && run.start <= last.end) {
      last.end = Math.max(last.end, run.end);
      continue;
    }
    merged.push({ ...run });
  }
  return merged;
}

/** 取第 index 个字符的颜色，没有覆盖时返回整层基色 */
export function colorAt(runs: ColorRun[] | undefined, index: number, base: string): string {
  if (!runs) return base;
  // 后写的段压前面的段，所以从后往前找第一个命中的
  for (let i = runs.length - 1; i >= 0; i -= 1) {
    const run = runs[i];
    if (index >= run.start && index < run.end) return run.color;
  }
  return base;
}

/**
 * 给 [start, end) 上色：先把与之相交的旧段挖掉，再插入新段。
 *
 * 挖而不是直接叠加，是为了让 runs 保持「互不重叠」的不变式 ——
 * 允许重叠的话 colorAt 得靠顺序决断，normalizeRuns 也没法合并同色段。
 */
export function applyRunColor(
  runs: ColorRun[] | undefined,
  start: number,
  end: number,
  color: string,
): ColorRun[] {
  if (end <= start) return normalizeRuns(runs ?? []);

  const result: ColorRun[] = [];
  for (const run of runs ?? []) {
    // 完全在选区外，原样保留
    if (run.end <= start || run.start >= end) {
      result.push({ ...run });
      continue;
    }
    // 与选区相交：保留露在选区左右两侧的部分
    if (run.start < start) result.push({ start: run.start, end: start, color: run.color });
    if (run.end > end) result.push({ start: end, end: run.end, color: run.color });
  }

  result.push({ start, end, color });
  return normalizeRuns(result);
}

/** 一次编辑的位置：[from, oldTo) 被换成了长度 insertedLength 的新内容 */
interface EditSpan {
  from: number;
  oldTo: number;
  insertedLength: number;
}

/**
 * 从改动前后的内容反推这次编辑动了哪一段。
 *
 * textarea 的 onChange 只给最终字符串，不给「插入还是删除、在哪儿」。
 * 靠掐掉公共前缀和公共后缀来定位：中间剩下的就是被替换掉的那段。
 * 这对连续打字、退格、粘贴、整段替换都成立，代价是拿不到「移动一段文字」
 * 这种意图（会被当成删一段 + 插一段），但颜色跟着位置走的结论仍然对。
 */
function diffEdit(before: string, after: string): EditSpan {
  let from = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (from < maxPrefix && before[from] === after[from]) from += 1;

  // 后缀不能吃进已经算作前缀的部分，否则 'aa' -> 'aaa' 会算出负长度
  let suffix = 0;
  const maxSuffix = Math.min(before.length - from, after.length - from);
  while (
    suffix < maxSuffix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    from,
    oldTo: before.length - suffix,
    insertedLength: after.length - suffix - from,
  };
}

/**
 * 把一个端点映射到编辑后的坐标系。
 *
 * 起点和终点在编辑处的落法是相反的，必须分开处理：
 * 正好落在插入点上时，起点要被推到新内容**之后**，终点要停在新内容**之前**。
 * 两者用同一套规则的话，插入点恰好压在某段边界上时那段会把新字符吞进去 ——
 * 于是在一段红字最前面插字，插进去的字也变红了。新字符该是什么颜色由
 * shiftRunsForEdit 末尾的继承逻辑单独决定，这里只管几何位置。
 */
function shiftPoint(point: number, edit: EditSpan, isEnd: boolean): number {
  const { from, oldTo, insertedLength } = edit;
  const delta = insertedLength - (oldTo - from);

  if (point < from) return point;
  if (point > oldTo) return point + delta;
  // 落在被替换掉的那段里（含两个端点）：终点收到编辑起点，起点让到新内容之后
  return isEnd ? from : from + insertedLength;
}

/**
 * 内容变化后把 runs 挪到新坐标系上，并给新插入的字符定色。
 *
 * pendingColor 是「光标处没选中任何字、但用户刚点了个颜色」时记下的待用色，
 * 对齐 PS：那之后敲进去的字用这个颜色，而不是整层基色。传 null 表示
 * 新字符继承插入点左边那个字的颜色（PS 里在一段红字中间接着打字，
 * 打出来的也是红的 —— 这是没有待用色时的默认行为）。
 */
export function shiftRunsForEdit(
  runs: ColorRun[] | undefined,
  before: string,
  after: string,
  pendingColor: string | null,
): ColorRun[] {
  if (before === after) return normalizeRuns(runs ?? []);

  const edit = diffEdit(before, after);
  const moved = (runs ?? []).map((run) => ({
    start: shiftPoint(run.start, edit, false),
    end: shiftPoint(run.end, edit, true),
    color: run.color,
  }));

  const normalized = normalizeRuns(moved);
  if (edit.insertedLength <= 0) return normalized;

  const insertedEnd = edit.from + edit.insertedLength;
  if (pendingColor) return applyRunColor(normalized, edit.from, insertedEnd, pendingColor);

  /*
   * 没有待用色：让新字符继承左邻字符的颜色。
   *
   * 不做这一步的话，在红字中间插字，插进去的字会露出整层基色 ——
   * shiftPoint 把左边那段的 end 停在插入点上，新字符正好落在所有段之外。
   * 插在最开头（from === 0）时没有左邻，那就该用基色，保持原样。
   */
  if (edit.from === 0) return normalized;
  const inherited = normalized.find((run) => run.start < edit.from && run.end >= edit.from);
  if (!inherited) return normalized;
  return applyRunColor(normalized, edit.from, insertedEnd, inherited.color);
}
