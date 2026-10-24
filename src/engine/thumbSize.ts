/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';

/**
 * 缩略图尺寸与内容范围。对应 PS 图层面板菜单里的「面板选项」。
 *
 * PS 给的是四档「无 / 小 / 中 / 大」，加一个「缩览图内容：整个文档 / 图层边界」。
 */

export type ThumbSize = 'none' | 'small' | 'medium' | 'large';

/** 每一档的像素边长。none 为 0，表示不画缩略图 */
export const THUMB_BOX: Record<ThumbSize, number> = {
  none: 0,
  small: 20,
  medium: 28,
  large: 40,
};

export const THUMB_SIZE_OPTIONS: { value: ThumbSize; label: string }[] = [
  { value: 'none', label: 'common.none' },
  { value: 'small', label: 'thumbSize.small' },
  { value: 'medium', label: 'thumbSize.medium' },
  { value: 'large', label: 'thumbSize.large' },
];

/*
 * 出图的取景与缩放已经搬去 engine/layerThumb.ts 了。
 * 这里原来有 thumbSource / docFramedSource 两个函数，做法是「先把图层摆进一张
 * 文档尺寸的画布、再裁、再缩」，中间那张大画布的代价随文档尺寸走，
 * 大 PSD 上每刷新一次图层面板就是每层一次全幅分配。layerThumbnail 一次画成，
 * 不再需要它们。
 */

/** 组没有像素，但占位方块要跟着尺寸档一起变，否则行高参差不齐 */
export function thumbBoxOf(size: ThumbSize): number {
  return THUMB_BOX[size];
}

/** 该图层在当前设置下要不要画缩略图 */
export function showsThumb(layer: Layer, size: ThumbSize): boolean {
  return size !== 'none' && layer.type !== 'group';
}
