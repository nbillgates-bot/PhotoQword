/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 段落文本边界框的拖拽几何。
 *
 * 纯函数，从 TextEditor 抽出来：组件里不该写几何/像素计算（规约 §2.1），
 * 而且这套换算最容易在改动时算错方向，独立出来才好测。
 */

import type { Rect } from '../types';

/** 边界框最小尺寸（px），避免拖成负数或太小 */
export const MIN_TEXT_BOX = 20;

/** 8 个拖拽方向，与 PS 变换框的手柄一致 */
export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 方向里是否含某条边 */
const has = (direction: string, edge: string) => direction.includes(edge);

/**
 * 按拖拽位移算出新的边界框，取整到整像素。
 *
 * 取整的理由同 textTool：canvas.width 不接受小数，编辑态与提交后的排版基准
 * 必须是同一个值，否则一提交文字就跳。
 *
 * 拖北边或西边时，尺寸被 MIN 夹住后原点要跟着回退 —— 拖的是那条边，
 * 对边必须钉在原地。少了这一步，拖到最小尺寸后继续拖会让整个框跟着指针跑。
 */
export function resizeTextBox(original: Rect, direction: string, dx: number, dy: number): Rect {
  let { width, height } = original;

  if (has(direction, 'e')) width = original.width + dx;
  if (has(direction, 'w')) width = original.width - dx;
  if (has(direction, 's')) height = original.height + dy;
  if (has(direction, 'n')) height = original.height - dy;

  width = Math.max(MIN_TEXT_BOX, width);
  height = Math.max(MIN_TEXT_BOX, height);

  // 拖西/北边时右/下边保持不动，所以原点按「对边减新尺寸」算
  const x = has(direction, 'w') ? original.x + original.width - width : original.x;
  const y = has(direction, 'n') ? original.y + original.height - height : original.y;

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}
