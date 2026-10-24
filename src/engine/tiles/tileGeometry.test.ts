/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  TILE_SIZE,
  intersectRect,
  localRectIn,
  parseTileKey,
  tileIndexOf,
  tileKey,
  tileRect,
  tilesCovering,
} from './tileGeometry';

describe('tileKey / parseTileKey', () => {
  it('往返一致，含负坐标', () => {
    for (const [tx, ty] of [
      [0, 0],
      [3, 7],
      [-1, -4],
    ]) {
      expect(parseTileKey(tileKey(tx, ty))).toEqual({ tx, ty });
    }
  });

  it('非法键返回 null 而不是造出 NaN 坐标', () => {
    expect(parseTileKey('')).toBeNull();
    expect(parseTileKey('1')).toBeNull();
    expect(parseTileKey('1,2,3')).toBeNull();
    expect(parseTileKey('a,b')).toBeNull();
    expect(parseTileKey('1.5,2')).toBeNull();
  });
});

describe('tileIndexOf', () => {
  it('块内首尾像素都落在同一块', () => {
    expect(tileIndexOf(0)).toBe(0);
    expect(tileIndexOf(TILE_SIZE - 1)).toBe(0);
    expect(tileIndexOf(TILE_SIZE)).toBe(1);
  });

  it('负坐标朝下取整，不能被算进块 0', () => {
    expect(tileIndexOf(-1)).toBe(-1);
    expect(tileIndexOf(-TILE_SIZE)).toBe(-1);
    expect(tileIndexOf(-TILE_SIZE - 1)).toBe(-2);
  });
});

describe('tileRect', () => {
  it('块矩形起点为块索引乘边长', () => {
    expect(tileRect(0, 0)).toEqual({ x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE });
    expect(tileRect(2, 1)).toEqual({
      x: 2 * TILE_SIZE,
      y: TILE_SIZE,
      width: TILE_SIZE,
      height: TILE_SIZE,
    });
    expect(tileRect(-1, 0).x).toBe(-TILE_SIZE);
  });
});

describe('intersectRect', () => {
  const base = { x: 0, y: 0, width: 10, height: 10 };

  it('部分重叠取公共区域', () => {
    expect(intersectRect(base, { x: 5, y: 5, width: 10, height: 10 })).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 5,
    });
  });

  it('包含关系返回被包含的那个', () => {
    const inner = { x: 2, y: 2, width: 3, height: 3 };
    expect(intersectRect(base, inner)).toEqual(inner);
  });

  it('完全不相交返回 null', () => {
    expect(intersectRect(base, { x: 20, y: 0, width: 5, height: 5 })).toBeNull();
  });

  it('仅边缘相接算不相交（交集面积为 0）', () => {
    expect(intersectRect(base, { x: 10, y: 0, width: 5, height: 5 })).toBeNull();
    expect(intersectRect(base, { x: 0, y: 10, width: 5, height: 5 })).toBeNull();
  });

  it('空矩形不产生交集', () => {
    expect(intersectRect(base, { x: 0, y: 0, width: 0, height: 5 })).toBeNull();
  });
});

describe('tilesCovering', () => {
  it('刚好一块大小的矩形只覆盖一块，不多刷相邻列', () => {
    const tiles = tilesCovering({ x: 0, y: 0, width: TILE_SIZE, height: TILE_SIZE });
    expect(tiles).toEqual([{ tx: 0, ty: 0 }]);
  });

  it('单像素矩形覆盖一块', () => {
    expect(tilesCovering({ x: 5, y: 5, width: 1, height: 1 })).toEqual([{ tx: 0, ty: 0 }]);
  });

  it('跨块边界时两块都算进来', () => {
    const tiles = tilesCovering({ x: TILE_SIZE - 1, y: 0, width: 2, height: 1 });
    expect(tiles).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
    ]);
  });

  it('按行优先返回 2×2 共四块', () => {
    const tiles = tilesCovering({
      x: TILE_SIZE - 1,
      y: TILE_SIZE - 1,
      width: 2,
      height: 2,
    });
    expect(tiles).toEqual([
      { tx: 0, ty: 0 },
      { tx: 1, ty: 0 },
      { tx: 0, ty: 1 },
      { tx: 1, ty: 1 },
    ]);
  });

  it('空矩形返回空数组，区别于「改了一个块」', () => {
    expect(tilesCovering({ x: 0, y: 0, width: 0, height: 10 })).toEqual([]);
    expect(tilesCovering({ x: 0, y: 0, width: 10, height: -1 })).toEqual([]);
  });

  it('负坐标区域落在负块上', () => {
    expect(tilesCovering({ x: -1, y: -1, width: 1, height: 1 })).toEqual([{ tx: -1, ty: -1 }]);
  });

  it('块数与面积成正比，不会随坐标平移而变化', () => {
    const size = TILE_SIZE * 3;
    const a = tilesCovering({ x: 0, y: 0, width: size, height: size });
    const b = tilesCovering({ x: TILE_SIZE, y: TILE_SIZE, width: size, height: size });
    expect(a.length).toBe(9);
    expect(b.length).toBe(9);
  });
});

describe('localRectIn', () => {
  it('块内区域换算为局部坐标', () => {
    const rect = { x: TILE_SIZE + 10, y: TILE_SIZE + 20, width: 5, height: 6 };
    expect(localRectIn(1, 1, rect)).toEqual({ x: 10, y: 20, width: 5, height: 6 });
  });

  it('跨块时各块只拿到自己那一份，局部坐标不越界', () => {
    const rect = { x: TILE_SIZE - 2, y: 0, width: 4, height: 1 };
    const left = localRectIn(0, 0, rect);
    const right = localRectIn(1, 0, rect);
    expect(left).toEqual({ x: TILE_SIZE - 2, y: 0, width: 2, height: 1 });
    expect(right).toEqual({ x: 0, y: 0, width: 2, height: 1 });
    // 两块加起来正好等于原矩形宽度，没有重叠也没有漏
    expect((left?.width ?? 0) + (right?.width ?? 0)).toBe(rect.width);
  });

  it('与该块无交集时返回 null', () => {
    expect(localRectIn(5, 5, { x: 0, y: 0, width: 10, height: 10 })).toBeNull();
  });

  it('负块的局部坐标也落在 0..size 之内', () => {
    const local = localRectIn(-1, -1, { x: -2, y: -2, width: 2, height: 2 });
    expect(local).toEqual({ x: TILE_SIZE - 2, y: TILE_SIZE - 2, width: 2, height: 2 });
  });
});
