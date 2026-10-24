/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { createCanvas, ctx2d } from '../canvasUtils';
import { readNorm, writeNorm } from '../pixel/buffer';
import { TILE_SIZE } from './tileGeometry';
import { TiledSurface } from './tiledSurface';

/** 造一张纯色画布 */
function solid(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  const ctx = ctx2d(canvas);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

describe('TiledSurface bounds', () => {
  it('全空时返回 null', () => {
    expect(new TiledSurface().bounds()).toBeNull();
  });

  it('单块的外接矩形就是那一块', () => {
    const surface = new TiledSurface({ size: 64 });
    surface.forEachWritable({ x: 10, y: 10, width: 1, height: 1 }, () => {});
    expect(surface.bounds()).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });

  it('跨块时取并集，含负块', () => {
    const surface = new TiledSurface({ size: 64 });
    surface.forEachWritable({ x: -1, y: -1, width: 2, height: 2 }, () => {});
    expect(surface.bounds()).toEqual({ x: -64, y: -64, width: 128, height: 128 });
  });
});

describe('TiledSurface 遍历', () => {
  it('写遍历按需分配，块数与覆盖数一致', () => {
    const surface = new TiledSurface({ size: 64 });
    let visits = 0;
    surface.forEachWritable({ x: 63, y: 63, width: 2, height: 2 }, () => {
      visits += 1;
    });
    expect(visits).toBe(4);
    expect(surface.store.tileCount).toBe(4);
  });

  it('读遍历不分配，未分配的块直接跳过', () => {
    const surface = new TiledSurface({ size: 64 });
    let visits = 0;
    surface.forEachReadable({ x: 0, y: 0, width: 200, height: 200 }, () => {
      visits += 1;
    });
    expect(visits).toBe(0);
    expect(surface.store.tileCount).toBe(0);
  });

  it('局部矩形宽高之和等于原矩形，不重不漏', () => {
    const surface = new TiledSurface({ size: 64 });
    let area = 0;
    surface.forEachWritable({ x: 60, y: 60, width: 10, height: 10 }, (_tile, local) => {
      area += local.width * local.height;
    });
    expect(area).toBe(100);
  });

  it('空矩形不触发任何访问，也不分配', () => {
    const surface = new TiledSurface({ size: 64 });
    let visits = 0;
    surface.forEachWritable({ x: 0, y: 0, width: 0, height: 5 }, () => {
      visits += 1;
    });
    expect(visits).toBe(0);
    expect(surface.store.tileCount).toBe(0);
  });
});

describe('TiledSurface canvas 桥接', () => {
  it('写入再读出，像素一致', () => {
    const surface = new TiledSurface({ size: 64 });
    surface.drawCanvas(solid(10, 10, 'rgb(255, 0, 0)'), 0, 0);
    const out = ctx2d(surface.toCanvas({ x: 0, y: 0, width: 10, height: 10 })).getImageData(
      0,
      0,
      10,
      10,
    );
    expect([...out.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
  });

  it('跨块写入在块边界上不错位', () => {
    const surface = new TiledSurface({ size: 64 });
    // 从 62 起画 4 像素宽，横跨块 0 与块 1
    surface.drawCanvas(solid(4, 1, 'rgb(0, 255, 0)'), 62, 0);
    const out = ctx2d(surface.toCanvas({ x: 60, y: 0, width: 8, height: 1 })).getImageData(
      0,
      0,
      8,
      1,
    );
    // 60、61 应为透明，62..65 为绿，66、67 透明
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(0);
    for (let x = 2; x < 6; x += 1) {
      expect([...out.data.slice(x * 4, x * 4 + 4)]).toEqual([0, 255, 0, 255]);
    }
    expect(out.data[6 * 4 + 3]).toBe(0);
    expect(out.data[7 * 4 + 3]).toBe(0);
  });

  it('负坐标写入不丢像素（图层可伸出文档之外）', () => {
    const surface = new TiledSurface({ size: 64 });
    surface.drawCanvas(solid(4, 4, 'rgb(0, 0, 255)'), -2, -2);
    const out = ctx2d(surface.toCanvas({ x: -2, y: -2, width: 4, height: 4 })).getImageData(
      0,
      0,
      4,
      4,
    );
    expect([...out.data.slice(0, 4)]).toEqual([0, 0, 255, 255]);
  });

  it('未写过的区域读出来是透明的', () => {
    const surface = new TiledSurface({ size: 64 });
    const out = ctx2d(surface.toCanvas({ x: 0, y: 0, width: 4, height: 4 })).getImageData(
      0,
      0,
      4,
      4,
    );
    expect([...out.data].every((v) => v === 0)).toBe(true);
  });

  it('空矩形返回 1×1 空画布而不是抛错', () => {
    const surface = new TiledSurface({ size: 64 });
    const canvas = surface.toCanvas({ x: 0, y: 0, width: 0, height: 0 });
    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
  });

  it('默认块边长与 TILE_SIZE 一致', () => {
    expect(new TiledSurface().size).toBe(TILE_SIZE);
  });

  it('快照与本体互不影响（写时复制透传）', () => {
    const surface = new TiledSurface({ size: 64 });
    surface.forEachWritable({ x: 0, y: 0, width: 1, height: 1 }, (tile) => {
      writeNorm(tile, 0, 0, 0, 1);
    });
    const snap = surface.snapshot();
    surface.forEachWritable({ x: 0, y: 0, width: 1, height: 1 }, (tile) => {
      writeNorm(tile, 0, 0, 0, 0);
    });
    expect(readNorm(snap.store.read(0, 0)!, 0, 0, 0)).toBe(1);
    expect(readNorm(surface.store.read(0, 0)!, 0, 0, 0)).toBe(0);
  });

  it('读出的像素里没有 NaN', () => {
    const surface = new TiledSurface({ size: 64, format: 'f32' });
    surface.drawCanvas(solid(8, 8, 'rgb(10, 20, 30)'), 0, 0);
    const out = ctx2d(surface.toCanvas({ x: 0, y: 0, width: 8, height: 8 })).getImageData(0, 0, 8, 8);
    expect([...out.data].some((v) => Number.isNaN(v))).toBe(false);
  });
});
