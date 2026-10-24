/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Guide, Point, Rect } from '../types';

/**
 * 参考线命中判定的容差（屏幕像素）。
 * PS 里参考线只有 1px 宽，但鼠标不必精确压在这 1px 上也能抓住它，
 * 所以用屏幕像素而非文档像素——放大到 800% 时容差不该跟着放大 8 倍。
 */
export const GUIDE_HIT_TOLERANCE = 4;


/**
 * 参考线是否被拖到了文档之外。
 * PS 的行为：松手时落在画布外（含拖回标尺）就删除这条参考线。
 */
export function guideOutsideDoc(
  orientation: 'h' | 'v',
  position: number,
  doc: { width: number; height: number },
): boolean {
  const max = orientation === 'h' ? doc.height : doc.width;
  return position < 0 || position > max;
}

/**
 * 裁剪之后重新定位参考线。
 *
 * 参考线是钉在图像上的，不是钉在窗口上的：裁剪把文档原点挪到了 rect 的左上角，
 * 所有参考线必须跟着平移同样的量，否则原本压在某个特征上的线会跑到别处去。
 * 平移后落在新文档之外的直接删掉——与 PS 一致，被裁掉的区域上的参考线不保留。
 */
export function remapGuidesAfterCrop(guides: Guide[], rect: Rect): Guide[] {
  const out: Guide[] = [];
  for (const guide of guides) {
    const horizontal = guide.orientation === 'h';
    const position = guide.position - (horizontal ? rect.y : rect.x);
    const max = horizontal ? rect.height : rect.width;
    if (position < 0 || position > max) continue;
    out.push({ ...guide, position });
  }
  return out;
}

/**
 * 找出指针压住的参考线，没有则返回 null。
 *
 * 容差按屏幕像素折算回文档像素，保证任何缩放下手感一致。
 * 多条重合时返回最后一条——它画在最上面，抓最上面那条符合直觉。
 */
export function guideAtPoint(
  guides: Guide[],
  point: Point,
  zoom: number,
  tolerance = GUIDE_HIT_TOLERANCE,
): Guide | null {
  const slack = tolerance / zoom;
  let hit: Guide | null = null;
  for (const guide of guides) {
    const distance =
      guide.orientation === 'h'
        ? Math.abs(point.y - guide.position)
        : Math.abs(point.x - guide.position);
    if (distance <= slack) hit = guide;
  }
  return hit;
}
