/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 触摸快捷方式控件的停靠边，以及它的持久化。
 *
 * 为什么要能换边：控件是用非主手的拇指按住的，右手持笔的人靠左、
 * 左手持笔的人靠右，固定一边就有一半人要横跨屏幕去按。
 * 换过一次就该记住，异常兜底见 engine/prefs.ts。
 */

import { readPref, writePref } from './prefs';

/** 停靠边。只有左右两档：控件必须在拇指自然落点上，上边够不到 */
export type TouchDockSide = 'left' | 'right';

/** 默认靠左：右手持笔/触控笔的人占多数，左拇指正好压在这儿 */
export const DEFAULT_DOCK_SIDE: TouchDockSide = 'left';

const SIDE_KEY = 'qword.touchDockSide';

function isDockSide(value: string | null): value is TouchDockSide {
  return value === 'left' || value === 'right';
}

/** 读存过的停靠边。没存过或存坏了都回到默认 */
export function readDockSide(): TouchDockSide {
  const raw = readPref(SIDE_KEY);
  return isDockSide(raw) ? raw : DEFAULT_DOCK_SIDE;
}

/** 记住停靠边 */
export function storeDockSide(side: TouchDockSide): void {
  writePref(SIDE_KEY, side);
}

/** 换到另一边 */
export function otherSide(side: TouchDockSide): TouchDockSide {
  return side === 'left' ? 'right' : 'left';
}
