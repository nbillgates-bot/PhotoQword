/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 分块几何：块索引与矩形之间的换算。纯函数，不碰像素也不碰 DOM。
 *
 * 先把几何单独拆出来是因为它最容易错也最好测：
 * 「一个矩形压到哪些块」「某块与矩形的交集在块内的局部坐标是多少」
 * 这两件事算错，表现是画面某些块不刷新或错位一格，极难定位。
 */

import type { Rect } from '../../types';

/**
 * 块边长。PS 内部按文档大小在 128/256/1024 之间选，
 * 256 是通用折中：小到空图层几乎不占内存，大到不会因块数过多而拖慢遍历。
 */
export const TILE_SIZE = 256;

/** 块坐标（以块为单位，不是像素） */
export interface TileCoord {
  tx: number;
  ty: number;
}

/** 块的 Map 键。字符串键比嵌套 Map 好调试，也便于直接序列化 */
export function tileKey(tx: number, ty: number): string {
  return `${tx},${ty}`;
}

/** 从键还原块坐标。键非法时返回 null，由调用方决定怎么处理 */
export function parseTileKey(key: string): TileCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const tx = Number(parts[0]);
  const ty = Number(parts[1]);
  if (!Number.isInteger(tx) || !Number.isInteger(ty)) return null;
  return { tx, ty };
}

/**
 * 像素坐标落在哪个块。
 * 用 Math.floor 而不是整除：坐标可以为负（图层伸出文档左上角之外），
 * 负数整除会朝零取整，-1 会被算成块 0，与 -1 实际属于块 -1 矛盾。
 */
export function tileIndexOf(pixel: number, size = TILE_SIZE): number {
  return Math.floor(pixel / size);
}

/** 某块在像素坐标系里的矩形范围 */
export function tileRect(tx: number, ty: number, size = TILE_SIZE): Rect {
  return { x: tx * size, y: ty * size, width: size, height: size };
}

/** 两个矩形的交集，不相交时返回 null */
export function intersectRect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * 一个矩形覆盖到的所有块，按行优先顺序返回。
 * 空矩形（宽或高 <= 0）返回空数组，而不是一个块——
 * 「什么都没改」和「改了一个块」在增量刷新里是两种不同的结论。
 */
export function tilesCovering(rect: Rect, size = TILE_SIZE): TileCoord[] {
  if (rect.width <= 0 || rect.height <= 0) return [];
  const x0 = tileIndexOf(rect.x, size);
  const y0 = tileIndexOf(rect.y, size);
  // 右下角用「最后一个像素」定块：宽 256 从 0 起只覆盖块 0，
  // 若用 rect.x + rect.width 会把紧邻的块 1 也算进去，导致每次多刷一列
  const x1 = tileIndexOf(rect.x + rect.width - 1, size);
  const y1 = tileIndexOf(rect.y + rect.height - 1, size);

  const tiles: TileCoord[] = [];
  for (let ty = y0; ty <= y1; ty += 1) {
    for (let tx = x0; tx <= x1; tx += 1) tiles.push({ tx, ty });
  }
  return tiles;
}

/**
 * 矩形与某块的交集，换算成块内的局部坐标（0..size）。
 * 写像素时要的就是这个：外面给的是文档坐标，块自己只认局部坐标。
 */
export function localRectIn(
  tx: number,
  ty: number,
  rect: Rect,
  size = TILE_SIZE,
): Rect | null {
  const hit = intersectRect(tileRect(tx, ty, size), rect);
  if (!hit) return null;
  return { x: hit.x - tx * size, y: hit.y - ty * size, width: hit.width, height: hit.height };
}
