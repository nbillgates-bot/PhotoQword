/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 哪些工具在拖动时要出放大镜。
 *
 * 决策见 docs/TODO_MOBILE.md：**按场景给**，不做全局开关。
 * 判据是「这一下的成败取决于一两个像素的精度吗」：
 * - 要：拖变换/裁剪手柄、吸管取色、拖选区边界。
 * - 不要：画笔描边。描边看的是整条线的走势，指尖旁边挂个放大镜只会挡住画面，
 *   而且笔画本来就允许不精确 —— 这也是 PS on iPad 的取舍。
 *
 * 写成数据表而不是散在各工具里：加/减一个工具应该只改这里一行。
 */

import type { ToolId } from '../types';

/**
 * 拖动期间显示放大镜的工具。
 *
 * 这是个**近似**：真正想要的条件是「正在拖手柄/边界」，而手柄命中状态
 * 存在各工具的模块级变量里（cropTool 的 cropDrag.handle 之类），
 * 要拿到就得给 ToolHandler 加一个「我现在需要放大镜」的出口。
 * 那笔改动比它换来的精确度贵，所以先按工具粒度给。
 * 代价是裁剪框内平移、新建选区这两种拖动也会出现放大镜 —— 两者本身也
 * 都在定位边界，出现了不算错，只是不必要。
 */
export const LOUPE_TOOLS: ReadonlySet<ToolId> = new Set<ToolId>([
  'transform',
  'crop',
  'eyedropper',
  'marquee-rect',
  'marquee-ellipse',
  'lasso',
  'polygon-lasso',
]);

/**
 * 这次拖动要不要放大镜。
 *
 * 手写笔一律不要（TODO 的既定决策）：笔尖只有几毫米，不挡住落点，
 * 而且用笔的人手腕支在屏幕上，放大镜反而会被手掌盖住。
 * 鼠标同理 —— 光标本身就不遮挡。
 */
export function needsLoupe(tool: ToolId, pointerType: string): boolean {
  if (pointerType !== 'touch') return false;
  return LOUPE_TOOLS.has(tool);
}
