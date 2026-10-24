/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 各工具下按住 Alt / Shift 会得到什么 —— 触摸快捷方式控件上显示的那行小字。
 *
 * 触屏上没有键盘，用户看不到「按住 Alt 会怎样」的任何线索，也没有 hover
 * 提示可看；不写出来等于把这些功能藏起来。桌面端不用这张表（有肌肉记忆和
 * 状态栏提示），所以它只被 TouchShortcut 消费。
 *
 * **表里只写代码真的实现了的。** 值是 i18n 的 key，没有条目就在控件上
 * 只显示键名（Alt / Shift），不编一个不存在的行为出来。
 * 具体到每个工具的对照来源写在下面各条注释里，改工具行为时要一起改这里。
 *
 * 三条已知的空缺（PS 有、我们还没做，所以这里不写）：
 * - 画笔/铅笔 + Alt 在 PS 里是临时切吸管，paintTools 没有这个分支
 * - 移动 + Alt 在 PS 里是复制图层，moveTool 只实现了 Shift 约束方向
 * - 橡皮 + Alt 在 PS 里是「抹到历史记录」，我们没有历史画笔
 */

import type { ToolId } from '../types';

/** 按住 Alt。对照来源：selectionTools / viewTools / cloneTool / transformTool */
export const ALT_HINT: Partial<Record<ToolId, string>> = {
  // selectionTools：altKey 且非 shiftKey 那一支走 subtract
  'marquee-rect': 'touchMod.hint.subtract',
  'marquee-ellipse': 'touchMod.hint.subtract',
  lasso: 'touchMod.hint.subtract',
  'polygon-lasso': 'touchMod.hint.subtract',
  wand: 'touchMod.hint.subtract',
  // cloneTool：altKey 时记下取样源而不是盖章
  clone: 'touchMod.hint.cloneSource',
  // viewTools：吸管 altKey 写 setBackground，缩放 altKey 走 zoomOut
  eyedropper: 'touchMod.hint.pickBackground',
  zoom: 'touchMod.hint.zoomOut',
  // cropTool / transformTool：alt 传给 dragTo，效果是以中心为锚点
  crop: 'touchMod.hint.fromCenter',
  transform: 'touchMod.hint.fromCenter',
};

/**
 * 按住 Shift。
 *
 * 选区工具的 Shift 在 PS 里兼两职：落笔**前**按下 = 加选，
 * 拖动**中**按下 = 拉成正方/正圆。控件的用法是先按住再落笔，
 * 命中的一定是前者，所以提示写「加选」。
 */
export const SHIFT_HINT: Partial<Record<ToolId, string>> = {
  'marquee-rect': 'touchMod.hint.add',
  'marquee-ellipse': 'touchMod.hint.add',
  lasso: 'touchMod.hint.add',
  'polygon-lasso': 'touchMod.hint.add',
  wand: 'touchMod.hint.add',
  // moveTool：shiftKey 时把位移夹到单一轴上
  move: 'touchMod.hint.axisLock',
  // shapeTool：shiftKey 传给 rectFrom，得到正方/正圆
  shape: 'touchMod.hint.regular',
  // transformTool / cropTool：shift 锁长宽比
  transform: 'touchMod.hint.keepRatio',
  crop: 'touchMod.hint.keepRatio',
};

/** 取某工具下某个键的提示词条 key；没有对照条目时返回 null */
export function hintKeyFor(tool: ToolId, key: 'alt' | 'shift'): string | null {
  const table = key === 'alt' ? ALT_HINT : SHIFT_HINT;
  return table[tool] ?? null;
}
