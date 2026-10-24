/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useLayoutEffect, useState, type RefObject } from 'react';

/** 视口坐标系里的一块矩形。只有需要的四个值，不用整个 DOMRect */
export interface ElementRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const SAME = (a: ElementRect | null, b: ElementRect) =>
  a !== null && a.top === b.top && a.bottom === b.bottom && a.left === b.left && a.right === b.right;

/**
 * 量一个元素在视口里的位置，尺寸变化时跟着更新。
 *
 * 用途是给 `position: fixed` 的浮层算坐标：fixed 相对视口定位，而锚点元素
 * 的位置只有量了才知道（规约 §3.4 —— 浮层要脱离滚动容器就得用 fixed + JS 算坐标，
 * 工具栏 flyout 与窄屏下拉菜单都是这个原因）。
 *
 * 为什么不用 CSS 算：锚点的位置取决于栅格行高、`#root` 上那 1px 边框、
 * 以及触屏下选项栏变高这几件事，把它们抄进浮层的样式表等于复制一份布局知识，
 * 上游改了浮层会静默错位。量出来的值永远是对的。
 *
 * ResizeObserver 只在**元素自己**尺寸变化时触发，窗口变宽而元素尺寸不变
 * （图标轨恒为 44px 宽，只是位置右移）它不响，所以额外挂 resize。
 */
export function useElementRect(ref: RefObject<HTMLElement | null>, enabled = true): ElementRect | null {
  const [rect, setRect] = useState<ElementRect | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element) {
      setRect(null);
      return;
    }

    const measure = () => {
      const r = element.getBoundingClientRect();
      const next = { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      // 值没变就不 setState：ResizeObserver 回调里无条件 setState 会自己喂自己
      setRect((prev) => (SAME(prev, next) ? prev : next));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, enabled]);

  return rect;
}
