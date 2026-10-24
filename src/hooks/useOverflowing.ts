/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useEffect, useState } from 'react';
import { hasOverflow } from '../engine/barOverflow';

/**
 * 跟随一个横向滚动容器「有没有装不下的内容」。
 *
 * 判定本身是纯函数（engine/barOverflow，含那 1px 亚像素容差），这里只负责
 * 组件层的事：拿到元素、在尺寸变化时重新量。
 *
 * 为什么要 ResizeObserver 而不是只在挂载时量一次：内容会变（换工具就换一整套
 * 参数）、容器会变（转屏、分屏多任务、桌面拖窄窗口）。两者任一变化都要重判，
 * 而这两件事都不触发 resize 事件。
 */
export function useOverflowing(
  /**
   * 内容标记。它变了就重新量一次。
   *
   * 必须由调用方给：容器是 grid 里的一格，换工具时它的尺寸一点没变，
   * 只有里面的控件换了一套 —— ResizeObserver 看容器看不出来，
   * 而给每个子元素都挂观察器又要在子元素增减时重挂，等于把这件事绕一大圈。
   * 传一个 activeTool 进来是最直白的写法。
   */
  contentKey: unknown,
): {
  ref: (node: HTMLElement | null) => void;
  overflowing: boolean;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);

  /** 用回调 ref 而不是 useRef：ref 对象的赋值不会触发下面那个 effect */
  const ref = useCallback((next: HTMLElement | null) => setNode(next), []);

  useEffect(() => {
    if (!node) {
      setOverflowing(false);
      return;
    }
    const measure = () =>
      setOverflowing(
        hasOverflow({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }),
      );
    /*
     * 量之前先让出一帧。换工具时这个 effect 跑在浏览器算完新布局之前，
     * 立刻量会拿到上一套控件的宽度，于是「更多」按钮总是慢一步。
     */
    const handle = requestAnimationFrame(measure);

    // 特性检测，不嗅探 UA（规约 §3.1）。没有 ResizeObserver 时退化成只量一次，
    // 结论仍然成立，只是转屏后不会重判
    if (typeof ResizeObserver !== 'function') return () => cancelAnimationFrame(handle);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      cancelAnimationFrame(handle);
      observer.disconnect();
    };
  }, [node, contentKey]);

  return { ref, overflowing };
}
