/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createCanvas, ctx2d } from './canvasUtils';
import { contentBoundsFast } from './contentBoundsFast';
import type { Rect } from '../types';

/**
 * 图层缩略图：一次画成，不建文档尺寸的中间画布。
 *
 * 原来的做法是「先把图层摆进一张文档尺寸的画布，再缩到 40px」。
 * 那张中间画布是纯浪费，而且代价随文档尺寸走：6000×4000 的 PSD 是每层 96 MB。
 * 图层面板上有几十层时，一次刷新就是几十次全幅分配 —— 点一下眼睛卡住就是这么来的。
 *
 * 现在直接用 drawImage 的缩放参数把图层画进 40px 的小画布，
 * 中间不落地任何大图，代价只跟缩略图尺寸有关，与文档多大无关。
 */

/** 取景方式。document / bounds 对应 PS 面板选项里的「缩览图内容」两档 */
export type ThumbClip = 'document' | 'bounds' | 'full';

/**
 * 缩略图取景框，坐标在**图层画布**的坐标系里。
 *
 * - document：整个文档。图层画布原点在文档的 (-x, -y) 处，
 *   所以文档左上角在图层坐标里是 (-x, -y)。
 * - bounds：图层内容的外接框。全透明的图层扫不出范围，退回整幅画布
 *   （结果是空白缩略图，与 PS 一致）。
 *   用 contentBoundsFast 而不是精确的 contentBounds：缩略图最终只有 40px，
 *   估算带来的几十像素误差看不出来，但精确版要全幅扫 alpha，
 *   大 PSD 上是打开时卡住几秒的主因（见 contentBoundsFast 的注释）。
 * - full：整张画布，不取景也不裁剪。蒙版走这一档——它是一张灰度图，
 *   裁到"内容"没有意义，PS 也是整张显示。
 */
export function thumbFrame(
  canvas: HTMLCanvasElement,
  clip: ThumbClip,
  placement: { x: number; y: number; docWidth: number; docHeight: number },
): Rect {
  if (clip === 'full') return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  if (clip === 'document') {
    return { x: -placement.x, y: -placement.y, width: placement.docWidth, height: placement.docHeight };
  }
  const bounds = contentBoundsFast(canvas);
  if (!bounds) return { x: 0, y: 0, width: canvas.width, height: canvas.height };
  return bounds;
}

/**
 * 把取景框缩进边长为 box 的方框里，保持宽高比。
 * 返回缩略图画布的实际尺寸，长边等于 box。
 */
export function thumbSize(frame: Rect, box: number): { width: number; height: number } {
  const scale = Math.min(box / frame.width, box / frame.height);
  return {
    // 至少 1 像素：极扁的取景框缩下来会算出 0，0 尺寸的画布拿不到上下文
    width: Math.max(1, Math.round(frame.width * scale)),
    height: Math.max(1, Math.round(frame.height * scale)),
  };
}

/**
 * 画出缩略图画布。
 *
 * box 是目标边长；调用方按 2 倍传，高分屏上才不糊。
 * 取景框整个落在画布外时（图层被拖出文档）返回一张空白画布，与 PS 一致。
 * 返回 null 表示这个入参画不出东西（box 为 0，或取景框是空的）。
 */
export function thumbCanvas(
  canvas: HTMLCanvasElement,
  clip: ThumbClip,
  placement: { x: number; y: number; docWidth: number; docHeight: number },
  box: number,
): HTMLCanvasElement | null {
  const frame = thumbFrame(canvas, clip, placement);
  if (frame.width <= 0 || frame.height <= 0 || box <= 0) return null;
  const { width, height } = thumbSize(frame, box);
  const thumb = createCanvas(width, height);
  const context = ctx2d(thumb);
  context.imageSmoothingQuality = 'medium';

  /*
   * 自己算源矩形与画布的交集，不依赖 drawImage 对越界源矩形的裁剪。
   * 规范规定越界时按比例裁剪源与目标，但各引擎在这一条上历史分歧较多，
   * 交给它们的话「图层拖出文档一半」这种情形可能在某个浏览器上位置就偏了。
   */
  const sx = Math.max(0, frame.x);
  const sy = Math.max(0, frame.y);
  const sw = Math.min(canvas.width, frame.x + frame.width) - sx;
  const sh = Math.min(canvas.height, frame.y + frame.height) - sy;
  // 取景框与画布完全不相交：图层整个在文档外，给一张空白缩略图
  if (sw <= 0 || sh <= 0) return thumb;

  // 源矩形被裁掉多少，目标矩形就按同样比例挪与缩
  const scaleX = width / frame.width;
  const scaleY = height / frame.height;
  context.drawImage(
    canvas,
    sx, sy, sw, sh,
    (sx - frame.x) * scaleX, (sy - frame.y) * scaleY, sw * scaleX, sh * scaleY,
  );
  return thumb;
}

/** 缩略图的 data URL，直接喂给 <img src>。画不出来时返回空串 */
export function layerThumbnail(
  canvas: HTMLCanvasElement,
  clip: ThumbClip,
  placement: { x: number; y: number; docWidth: number; docHeight: number },
  box: number,
): string {
  const thumb = thumbCanvas(canvas, clip, placement, box);
  return thumb ? thumb.toDataURL('image/png') : '';
}
