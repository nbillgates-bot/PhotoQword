/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 图层缩略图的取图 hook。
 *
 * 三层防护,缺一个大 PSD 就会卡:
 * 1. **只给看得见的行出图**。287 个图层的面板里 DOM 有 287 行,但可视区只有
 *    十几行。滚出视野的行不值得花 PNG 编码的钱(IntersectionObserver 判断,
 *    四家浏览器都支持)。
 * 2. **帧预算队列**。可见的十几行也不能挤在同一帧,交给 frameQueue 摊开。
 * 3. **结果缓存**。key 覆盖所有影响输出的量,滚回去时直接复用,不重算。
 */

import { useEffect, useState } from 'react';
import { layerThumbnail, type ThumbClip } from '../engine/layerThumb';
import { cancelFrameTask, enqueueFrameTask } from './frameQueue';

/** 缩略图取景位置。clip 为 document 时结果跟着图层在文档里的位置变 */
export interface ThumbPlacement {
  x: number;
  y: number;
  docWidth: number;
  docHeight: number;
}

export interface ThumbnailArgs {
  /** 缓存标识。同一图层的像素图与蒙版图要用不同的 id */
  id: string;
  source: HTMLCanvasElement | undefined;
  /** store 的 pixelRevision:像素换了才需要重画 */
  revision: number;
  /** 缩略图方框边长,0 表示「不显示缩略图」这一档 */
  box: number;
  clip: ThumbClip;
  placement?: ThumbPlacement;
  /** 这一行在面板可视区里吗。false 时不出新图,已有缓存照旧显示 */
  inView: boolean;
}

/**
 * 缓存:签名 → dataURL。
 *
 * 全局共享且不随组件卸载清除——面板滚动会卸载滚出视野的行,
 * 挂在组件里等于滚一次全部重算。
 */
const cache = new Map<string, string>();

/**
 * 缓存上限。
 *
 * 一张 40px PNG 的 dataURL 约 2~6 KB,600 张不到 4 MB,而图层再多的文档
 * 也不会有比这更多的「最近看过的行」。超了按插入顺序丢最旧的
 * (Map 的迭代顺序就是插入顺序,不需要额外的 LRU 结构)。
 */
const CACHE_LIMIT = 600;

/**
 * 缓存签名:把所有影响输出的量都编进去。
 *
 * revision 之外还要带 box/clip/位置:以前只用 layerId + revision,
 * 于是 clip='document' 时把图层拖到别处,签名没变,返回的是旧位置的缩略图。
 * 换缩略图尺寸档位也是同样的问题。
 */
function signature(args: ThumbnailArgs): string {
  const { x = 0, y = 0, docWidth = 0, docHeight = 0 } = args.placement ?? {};
  // 只有 document 这一档的取景跟位置有关,别的档位不该因为图层移动而失效
  const place = args.clip === 'document' ? `${x},${y},${docWidth},${docHeight}` : '';
  return `${args.id}|${args.revision}|${args.box}|${args.clip}|${place}`;
}

export function useThumbnail(args: ThumbnailArgs): string {
  const { id, source, box, clip, inView } = args;
  const key = signature(args);
  // 初值直接取缓存:滚回来的行不该先闪一下空白
  const [thumb, setThumb] = useState(() => cache.get(key) ?? '');

  useEffect(() => {
    if (!source || box === 0) {
      setThumb('');
      return;
    }

    const hit = cache.get(key);
    if (hit !== undefined) {
      setThumb(hit);
      return;
    }
    // 看不见的行不出新图。已有的旧图继续显示,总比空白好
    if (!inView) return;

    const placement = args.placement ?? { x: 0, y: 0, docWidth: 0, docHeight: 0 };
    /*
     * 拿不到文档尺寸时退回整幅出图:否则 document 档的取景框宽高是 0,
     * 什么都画不出来。
     */
    const mode: ThumbClip = clip === 'document' && placement.docWidth === 0 ? 'full' : clip;

    enqueueFrameTask(key, () => {
      // 按 2 倍框宽出图,高分屏上才不糊
      const result = layerThumbnail(source, mode, placement, box * 2);
      if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
      }
      cache.set(key, result);
      setThumb(result);
    });
    return () => cancelFrameTask(key);
    // key 已经把 placement 的各字段编进去了,不必再逐个进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, source, box, clip, inView, id]);

  return thumb;
}

/** 清空缩略图缓存。只给测试用 */
export function resetThumbnailCache(): void {
  cache.clear();
}
