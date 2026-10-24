/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * TiledSurface：在 TileStore 之上提供「按矩形读写」的接口。
 *
 * TileStore 只认块，调用方却总是按矩形思考（画一笔、贴一块选区、
 * 上一次滤镜）。这一层负责把矩形切成块、算好每块的局部坐标，
 * 并顺带维护实际有内容的边界（bounds），供合成与裁剪使用。
 *
 * 与 canvas 的桥接也放在这里：现有引擎全是 canvas 语义，
 * 没有桥就无法与 compositor 共存。
 */

import type { Rect } from '../../types';
import { createCanvas, ctx2dReadback } from '../canvasUtils';
import { fromImageData, toImageData } from '../pixel/imageDataBridge';
import { createPixelBuffer, indexOf } from '../pixel/buffer';
import type { PixelBuffer } from '../pixel/buffer';
import { localRectIn, tilesCovering } from './tileGeometry';
import { TileStore } from './tileStore';
import type { TileStoreOptions } from './tileStore';

export class TiledSurface {
  readonly store: TileStore;

  constructor(options: TileStoreOptions | TileStore = {}) {
    this.store = options instanceof TileStore ? options : new TileStore(options);
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * 已分配块并集的外接矩形，全空时返回 null。
   *
   * 这是块粒度的保守估计，不是精确的像素边界：某块里只画了一个点，
   * 边界也算整块。合成时按它裁剪足够，要精确边界得另外扫像素。
   */
  bounds(): Rect | null {
    const keys = this.store.keys();
    if (keys.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { tx, ty } of keys) {
      if (tx < minX) minX = tx;
      if (ty < minY) minY = ty;
      if (tx > maxX) maxX = tx;
      if (ty > maxY) maxY = ty;
    }
    const size = this.size;
    return {
      x: minX * size,
      y: minY * size,
      width: (maxX - minX + 1) * size,
      height: (maxY - minY + 1) * size,
    };
  }

  /**
   * 遍历矩形覆盖到的每一块，回调拿到该块的可写缓冲与块内局部矩形。
   *
   * 写路径按需分配：只有被矩形碰到的块才会存在。
   */
  forEachWritable(
    rect: Rect,
    visit: (tile: PixelBuffer, local: Rect, tx: number, ty: number) => void,
  ): void {
    for (const { tx, ty } of tilesCovering(rect, this.size)) {
      const local = localRectIn(tx, ty, rect, this.size);
      if (!local) continue;
      visit(this.store.write(tx, ty), local, tx, ty);
    }
  }

  /**
   * 遍历矩形覆盖到的已分配块。未分配的块直接跳过，不会为了读而分配。
   * 这是「读不分配」这条不变量在矩形层面的体现。
   */
  forEachReadable(
    rect: Rect,
    visit: (tile: PixelBuffer, local: Rect, tx: number, ty: number) => void,
  ): void {
    for (const { tx, ty } of tilesCovering(rect, this.size)) {
      const tile = this.store.read(tx, ty);
      if (!tile) continue;
      const local = localRectIn(tx, ty, rect, this.size);
      if (!local) continue;
      visit(tile, local, tx, ty);
    }
  }

  /** 共享全部块的快照，不复制像素。写入时才按块分离 */
  snapshot(): TiledSurface {
    return new TiledSurface(this.store.snapshot());
  }

  /** 把 canvas 的像素写进指定位置（左上角为 x, y） */
  drawCanvas(source: HTMLCanvasElement, x = 0, y = 0): void {
    if (source.width === 0 || source.height === 0) return;
    const image = ctx2dReadback(source).getImageData(0, 0, source.width, source.height);
    this.drawImageData(image, x, y);
  }

  /** 把 ImageData 写进指定位置 */
  drawImageData(image: ImageData, x = 0, y = 0): void {
    const src = fromImageData(image, this.store.format);
    const rect: Rect = { x, y, width: image.width, height: image.height };
    this.forEachWritable(rect, (tile, local, tx, ty) => {
      copyRegion(src, tile, {
        srcX: local.x + tx * this.size - x,
        srcY: local.y + ty * this.size - y,
        dstX: local.x,
        dstY: local.y,
        width: local.width,
        height: local.height,
      });
    });
  }

  /**
   * 把指定矩形范围渲染成一张 canvas。范围内未分配的块留作透明。
   * rect 为空（宽高 <= 0）时返回 1×1 空画布，与 createCanvas 的下限一致。
   */
  toCanvas(rect: Rect): HTMLCanvasElement {
    const canvas = createCanvas(rect.width, rect.height);
    if (rect.width <= 0 || rect.height <= 0) return canvas;
    const ctx = ctx2dReadback(canvas);
    this.forEachReadable(rect, (tile, local, tx, ty) => {
      const patch = extractRegion(tile, local);
      ctx.putImageData(
        toImageData(patch),
        local.x + tx * this.size - rect.x,
        local.y + ty * this.size - rect.y,
      );
    });
    return canvas;
  }
}

interface CopyArgs {
  srcX: number;
  srcY: number;
  dstX: number;
  dstY: number;
  width: number;
  height: number;
}

/** 在两段同格式缓冲之间搬一块矩形。就地修改 dst */
function copyRegion(src: PixelBuffer, dst: PixelBuffer, args: CopyArgs): void {
  const channels = Math.min(src.channels, dst.channels);
  for (let row = 0; row < args.height; row += 1) {
    for (let col = 0; col < args.width; col += 1) {
      const from = indexOf(src, args.srcX + col, args.srcY + row);
      const to = indexOf(dst, args.dstX + col, args.dstY + row);
      if (from < 0 || to < 0) continue;
      for (let c = 0; c < channels; c += 1) dst.data[to + c] = src.data[from + c];
    }
  }
}

/** 从缓冲里抠出一块矩形，返回新缓冲 */
function extractRegion(source: PixelBuffer, rect: Rect): PixelBuffer {
  const out = createPixelBuffer(rect.width, rect.height, source.format, source.channels);
  copyRegion(source, out, {
    srcX: rect.x,
    srcY: rect.y,
    dstX: 0,
    dstY: 0,
    width: rect.width,
    height: rect.height,
  });
  return out;
}
