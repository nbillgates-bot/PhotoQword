/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect } from '../types';
import { ctx2d } from './canvasUtils';

/** 一段轴对齐的轮廓边，文档坐标。像素边界走整数格线 */
export interface OutlineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 蚂蚁线的判定阈值。与 PS 一致取 50%：
 * 羽化选区的过渡带很宽，蚂蚁线画在半强度处，不是画在 alpha>0 的最外沿。
 */
const INSIDE = 128;

/** 只读 bounds 外扩 1px 的那一块，别整幅读 —— 大文档拖拽时每帧读全图会卡 */
function readRegion(mask: HTMLCanvasElement, bounds: Rect) {
  const x = Math.max(0, Math.floor(bounds.x) - 1);
  const y = Math.max(0, Math.floor(bounds.y) - 1);
  const right = Math.min(mask.width, Math.ceil(bounds.x + bounds.width) + 1);
  const bottom = Math.min(mask.height, Math.ceil(bounds.y + bounds.height) + 1);
  const width = Math.max(0, right - x);
  const height = Math.max(0, bottom - y);
  if (width === 0 || height === 0) return null;
  const data = ctx2d(mask).getImageData(x, y, width, height).data;
  return { x, y, width, height, data };
}

/**
 * 沿选区蒙版的实际边界提取轮廓。
 *
 * 只在「本像素在选区内、相邻像素不在」处产生边，所以互不相连的多个选区
 * 各自成框，不会共用一个外接矩形（这正是"添加到选区"画两个矩形时该有的样子）。
 * 同向共线的边合并成长线段：虚线相位在每个子路径起点会重置，
 * 不合并的话一格一段，看起来是一排散点而不是连续行进的蚂蚁。
 */
export function selectionOutline(mask: HTMLCanvasElement, bounds: Rect): OutlineSegment[] {
  const region = readRegion(mask, bounds);
  if (!region) return [];
  const { x: rx, y: ry, width: rw, height: rh, data } = region;

  const inside = (x: number, y: number): boolean => {
    if (x < rx || y < ry || x >= rx + rw || y >= ry + rh) return false;
    return data[((y - ry) * rw + (x - rx)) * 4 + 3] >= INSIDE;
  };

  return [...horizontalEdges(inside, rx, ry, rw, rh), ...verticalEdges(inside, rx, ry, rw, rh)];
}

type InsideFn = (x: number, y: number) => boolean;

/**
 * 横向边：逐行扫描，在上边界（本行在内、上一行不在）和
 * 下边界（本行在内、下一行不在）处出边，同行连续的合并成一条。
 */
function horizontalEdges(
  inside: InsideFn,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): OutlineSegment[] {
  const out: OutlineSegment[] = [];
  for (let y = ry; y < ry + rh; y += 1) {
    for (const side of [0, 1] as const) {
      // side 0 取上边界，画在 y；side 1 取下边界，画在 y+1
      const lineY = side === 0 ? y : y + 1;
      let runStart: number | null = null;
      for (let x = rx; x <= rx + rw; x += 1) {
        const isEdge =
          x < rx + rw &&
          inside(x, y) &&
          !inside(x, side === 0 ? y - 1 : y + 1);
        if (isEdge && runStart === null) runStart = x;
        else if (!isEdge && runStart !== null) {
          out.push({ x1: runStart, y1: lineY, x2: x, y2: lineY });
          runStart = null;
        }
      }
    }
  }
  return out;
}

/** 纵向边：逐列扫描，逻辑与横向对称 */
function verticalEdges(
  inside: InsideFn,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): OutlineSegment[] {
  const out: OutlineSegment[] = [];
  for (let x = rx; x < rx + rw; x += 1) {
    for (const side of [0, 1] as const) {
      const lineX = side === 0 ? x : x + 1;
      let runStart: number | null = null;
      for (let y = ry; y <= ry + rh; y += 1) {
        const isEdge =
          y < ry + rh &&
          inside(x, y) &&
          !inside(side === 0 ? x - 1 : x + 1, y);
        if (isEdge && runStart === null) runStart = y;
        else if (!isEdge && runStart !== null) {
          out.push({ x1: lineX, y1: runStart, x2: lineX, y2: y });
          runStart = null;
        }
      }
    }
  }
  return out;
}
