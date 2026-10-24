/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 工具组弹出层的落位计算。
 *
 * 为什么要抽出来：同一个 ToolGroupButton 会挂在两个方向的容器上 ——
 * 桌面/iPad 的竖向工具栏（弹在按钮右侧，PS 就是这样）和手机底部工具条
 * （只能弹在按钮上方，右侧是屏幕边缘）。
 *
 * 做成两个纯函数由调用方传进去，而不是给按钮加一个 `above` 布尔参数：
 * 规约 1.3 禁止为了加功能往已有函数里塞 flag，差异部分要做成传入的策略。
 * 顺带这两个函数可以单独测边界，而组件里的 getBoundingClientRect 测不了。
 */

/** 弹出层要落在哪儿（视口坐标，配 position: fixed 用） */
export interface FlyoutPos {
  left: number;
  top: number;
}

/** 计算落位需要知道的东西。矩形是按钮的视口坐标，尺寸是弹出层自己的 */
export interface FlyoutPlacementArgs {
  /** 按钮的 getBoundingClientRect() */
  button: { left: number; right: number; top: number; bottom: number };
  /** 弹出层估算尺寸 */
  flyout: { width: number; height: number };
  /** 视口尺寸 */
  viewport: { width: number; height: number };
}

/** 离视口边缘至少留这么多，免得贴边到看不出是浮层 */
const MARGIN = 4;

/** 把一个坐标夹进 [MARGIN, limit - size - MARGIN]，区间为负时取 MARGIN */
function clampEdge(value: number, size: number, limit: number): number {
  return Math.max(MARGIN, Math.min(value, Math.max(MARGIN, limit - size - MARGIN)));
}

/**
 * 弹在按钮右侧，顶边与按钮对齐。竖向工具栏用这个（PS 的做法）。
 *
 * 高度不够时整体上移而不是翻到左边：翻边会让同一个按钮每次弹出的方向不一样，
 * 上移只是位置微调，肌肉记忆还在。
 */
export function placeRight({ button, flyout, viewport }: FlyoutPlacementArgs): FlyoutPos {
  return {
    left: clampEdge(button.right + MARGIN, flyout.width, viewport.width),
    top: clampEdge(button.top, flyout.height, viewport.height),
  };
}

/**
 * 弹在按钮上方，左缘与按钮对齐。手机底部工具条用这个。
 *
 * 为什么不能沿用 placeRight：底部工具条是横向排列且贴着屏幕底边，
 * 弹在右侧会盖住相邻的工具按钮，弹在下方则整个在视口外。
 * PS 没有手机版可对齐，这里按第零节的触屏例外重新映射方向，语义不变
 * （还是「同组工具在按钮旁边展开」）。
 */
export function placeAbove({ button, flyout, viewport }: FlyoutPlacementArgs): FlyoutPos {
  return {
    left: clampEdge(button.left, flyout.width, viewport.width),
    top: clampEdge(button.top - flyout.height - MARGIN, flyout.height, viewport.height),
  };
}

/** 落位策略。ToolGroupButton 接一个这样的函数，默认用 placeRight */
export type FlyoutPlacer = (args: FlyoutPlacementArgs) => FlyoutPos;

/**
 * 弹出层的估算高度。
 *
 * 按钮要在**弹出之前**就定好位置（fixed 定位需要坐标），那时候浮层还没渲染，
 * 量不到真实高度，只能按行数估。itemHeight 由调用方给：桌面一行 30，
 * 粗指针下一行 40（见各 css 模块的 pointer: coarse 覆盖块）。
 */
export function flyoutHeight(itemCount: number, itemHeight: number): number {
  // 上下各 4 的内边距
  return Math.max(0, itemCount) * itemHeight + 8;
}

