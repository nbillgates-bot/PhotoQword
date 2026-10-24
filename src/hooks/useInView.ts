/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 元素是否落在滚动容器的可视区内。
 *
 * 用途:图层面板有几百行时,只有可视区那十几行的缩略图值得算。
 * 交给 IntersectionObserver 而不是自己监听 scroll 算位置——后者每次滚动
 * 都要读一遍布局(强制同步重排),行数多时反而成了新的卡顿源。
 *
 * 返回 ref 与布尔值两件套:把 ref 挂到要观察的元素上即可。
 */

import { useEffect, useRef, useState } from 'react';

/**
 * 预取边距。
 *
 * 往可视区外多算一屏:用户滚动时缩略图已经准备好了,不会滚到哪儿哪儿空白。
 * 200px 约等于图层面板五六行的高度。
 */
const ROOT_MARGIN = '200px';

export function useInView<T extends HTMLElement>(): {
  ref: React.RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T | null>(null);
  /*
   * 初值给 true 而不是 false。
   *
   * 观察器要到 effect 里才建起来,首帧拿不到结论;给 false 会让所有行
   * 先按「看不见」渲染一次,首屏那十几行的缩略图要等到第二帧才排队。
   * 更要紧的是:IntersectionObserver 不可用时(极老环境、某些测试环境)
   * 这个初值就是最终值,给 true 才能退化成「照旧全部出图」,
   * 而不是「一张缩略图都不显示」。
   */
  const [inView, setInView] = useState(true);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // 特性检测而不是看 userAgent:拿不到就保持 true,退化成不做可见性优化
    if (typeof IntersectionObserver !== 'function') return;

    const observer = new IntersectionObserver(
      (entries) => {
        // 只观察一个元素,取第一条即可
        setInView(entries[0]?.isIntersecting ?? true);
      },
      { rootMargin: ROOT_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, inView };
}
