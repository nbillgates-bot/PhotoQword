/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';

/**
 * 跟随窗口宽度。
 *
 * 面板宽度的上限按视口比例算，窗口一变小，原本合法的宽度可能就超限了，
 * 不跟着重算会把画布挤没。
 *
 * 不用 ResizeObserver：要观察的是窗口本身，而不是某个元素。
 */
export function useWindowWidth(): number {
  const [width, setWidth] = useState(() =>
    typeof window === 'undefined' ? 1600 : window.innerWidth,
  );

  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    // 挂载时同步一次：初始值是首次渲染时取的，之间可能已经变过
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return width;
}
