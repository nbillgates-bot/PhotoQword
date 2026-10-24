/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 输入能力探测。
 *
 * 规约 §3.1：**禁止嗅探 userAgent**，一律用 CSS 媒体特性和特性检测。
 * 这里只回答「设备有什么能力」，不回答「是不是 iPad」——后者既问不准
 * （触屏笔记本、外接键盘的平板都会被问错），也不是我们真正要知道的事。
 *
 * 与 canvasLimits.ts 同理：探测浏览器能力属于引擎层，不认识 React 与 store。
 */

/**
 * 有没有粗指针（手指）。用 any-pointer 而不是 pointer：
 *
 * `pointer: coarse` 问的是**主要**指针，插了鼠标的触屏笔记本上它是 fine，
 * 于是手势层根本挂不上去，屏幕却是能摸的。`any-pointer: coarse` 问的是
 * 「有没有任意一个粗指针」，插不插鼠标都答对。
 *
 * 真正区分鼠标与手指的活儿交给每个事件的 `pointerType`，
 * 所以「挂上手势层」对桌面端零影响 —— 鼠标事件根本不会进手势分支。
 */
export function hasCoarsePointer(): boolean {
  // matchMedia 在测试环境（jsdom 早期版本）可能缺失，缺了就当没有触屏
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(any-pointer: coarse)').matches;
}

/**
 * 「主要指针是粗的吗」。
 *
 * 与上面的 hasCoarsePointer 是两个不同的问题，别混用：
 * - any-pointer: coarse → 「能不能用手指操作」。决定要不要挂手势层。
 * - pointer: coarse → 「主要指针精不精确」。决定 UI 按哪一档尺寸画。
 *
 * 插了鼠标的触屏笔记本：前者为真（手势层要挂），后者为假（控件保持紧凑，
 * 也不显示触摸快捷方式 —— 有真键盘就该按 Alt 键）。
 * 这个查询与各 css 模块里 `@media (pointer: coarse)` 的条件是同一个，
 * 两边必须一致，否则会出现「控件显示了但尺寸没放大」这类错位。
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

export function hasPrimaryCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/**
 * 视口够不够宽，用来决定三栏还是抽屉布局。
 *
 * 820px 是 iPad 竖屏（768pt）与横屏（1024pt）之间的分界：竖屏走抽屉，
 * 横屏走三栏。它与 hasCoarsePointer 相互独立 —— 触屏笔记本是粗指针 + 宽屏，
 * 该给三栏配触屏手势；手机横屏够宽也给三栏。
 */
export const WIDE_LAYOUT_MIN_WIDTH = 820;

/**
 * 宽屏（三栏）布局的媒体查询。
 *
 * 组件用 useMediaQuery 跟随它决定渲染三栏还是抽屉，css 里也用同一个条件写
 * 覆盖块 —— 与 COARSE_POINTER_QUERY 同一个道理：两边必须是同一条查询，
 * 否则会出现「渲染了抽屉但样式还按三栏算」这类错位。
 *
 * 视口宽度会变（转屏、分屏多任务、桌面窗口拖窄），所以只能跟随，不能只问一次。
 */
export const WIDE_LAYOUT_QUERY = `(min-width: ${WIDE_LAYOUT_MIN_WIDTH}px)`;

/** 当前视口是否走宽屏（三栏）布局 */
export function isWideViewport(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
  return window.matchMedia(WIDE_LAYOUT_QUERY).matches;
}

/**
 * 这个指针事件是不是手指。
 *
 * 手写笔（`pen`）**不算**：笔尖精确、不遮挡，走桌面那套单指路径就对了，
 * 双指手势也用不上它（见 docs/TODO_MOBILE.md 的精度补偿决策）。
 */
export function isTouchPointer(pointerType: string): boolean {
  return pointerType === 'touch';
}
