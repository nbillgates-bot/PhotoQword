/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';

/**
 * 跟随一条 CSS 媒体查询。
 *
 * 为什么要跟随而不是只在挂载时问一次：指针能力是会变的 —— iPad 插上/拔掉
 * 触控板、笔记本翻成平板模式，`(pointer: coarse)` 都会当场翻转。只问一次的话
 * 触摸快捷方式控件会留在屏幕上（或者一直不出现），而 CSS 那边的
 * `@media (pointer: coarse)` 是实时的，两边就错位了。
 *
 * 事件注册用了两种写法：`addEventListener` 是标准，但 Safari 14 之前的
 * MediaQueryList 只有已废弃的 `addListener`。规约 §3.1 要求覆盖近两个大版本，
 * 这里多几行换掉一整类「Safari 上控件不出现」的问题。特性检测，不嗅探 UA。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const sync = () => setMatches(list.matches);
    // 挂载时同步一次：初始值是首次渲染时取的，之间可能已经变过
    sync();

    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', sync);
      return () => list.removeEventListener('change', sync);
    }
    // 老 Safari 的回退路径
    list.addListener(sync);
    return () => list.removeListener(sync);
  }, [query]);

  return matches;
}
