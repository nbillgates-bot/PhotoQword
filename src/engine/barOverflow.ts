/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 判断一条横向滚动的栏里有没有装不下的内容。
 *
 * 选项栏在手机上要给出「更多」入口，但只在**真的装不下**时给 ——
 * 恒显一个更多按钮会让本来就只有一两个参数的工具（吸管、抓手）多一个空入口。
 *
 * 抽成纯函数是因为那个 1px 的容差不写测试很容易被人「顺手清掉」：
 * 浏览器的 scrollWidth / clientWidth 带亚像素（缩放比例、devicePixelRatio、
 * 边框的小数宽度都会掺进来），直接比大小会在没有溢出时也答 true，
 * 于是「更多」按钮在桌面上闪一下又消失。
 */

/**
 * 容差。1px 足够吃掉亚像素误差，又小到不会漏掉真实溢出
 * （真溢出至少是一个控件的宽度，几十 px 起）。
 */
const EPSILON = 1;

/** 这条栏是否有内容被挤出可视区 */
export function hasOverflow(metrics: { scrollWidth: number; clientWidth: number }): boolean {
  const { scrollWidth, clientWidth } = metrics;
  // 尺寸还没量到（元素未挂载、display:none）时一律答"没溢出"：
  // 宁可少给一个入口，也不要在布局稳定前闪一下
  if (!Number.isFinite(scrollWidth) || !Number.isFinite(clientWidth)) return false;
  if (clientWidth <= 0) return false;
  return scrollWidth - clientWidth > EPSILON;
}
