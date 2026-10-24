/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 稀疏分块存储：只保存被写过的块。
 *
 * 现有 Layer.canvas 是一整张与图层等大的画布，空图层也要按尺寸分配
 * （790×14235 单层 45MB）。改成分块之后，没画过的地方压根不存在，
 * 内存跟实际画了多少像素成正比，而不是跟文档尺寸成正比。
 *
 * ## 写时复制（copy-on-write）
 *
 * 每个块带一个引用计数。快照与当前状态共享同一批块对象，
 * 只有真的要改某块时才复制那一块，其他块继续共享。
 * 于是「存一份快照」的代价从整层像素降到只有被改动的块。
 */

import { clonePixelBuffer, createPixelBuffer } from '../pixel/buffer';
import type { ChannelCount, PixelBuffer } from '../pixel/buffer';
import type { PixelFormat } from '../pixel/format';
import { TILE_SIZE, tileKey } from './tileGeometry';
import type { TileCoord } from './tileGeometry';

/**
 * 一个块。shared 计数为共享者数量，>1 时任何写入都必须先复制。
 * 计数由 TileStore 维护，外部不要直接改。
 */
export interface Tile {
  buffer: PixelBuffer;
  shared: number;
}

export interface TileStoreOptions {
  size?: number;
  format?: PixelFormat;
  channels?: ChannelCount;
}

/** 稀疏块存储。块的坐标可以为负，没有「文档尺寸」的概念 */
export class TileStore {
  readonly size: number;
  readonly format: PixelFormat;
  readonly channels: ChannelCount;
  private tiles = new Map<string, Tile>();

  constructor(options: TileStoreOptions = {}) {
    this.size = options.size ?? TILE_SIZE;
    this.format = options.format ?? 'u8';
    this.channels = options.channels ?? 4;
  }

  /** 已分配的块数。空存储为 0，是「稀疏」的直接证据 */
  get tileCount(): number {
    return this.tiles.size;
  }

  /** 已分配块的坐标清单，顺序为插入序 */
  keys(): TileCoord[] {
    const out: TileCoord[] = [];
    for (const key of this.tiles.keys()) {
      const [tx, ty] = key.split(',');
      out.push({ tx: Number(tx), ty: Number(ty) });
    }
    return out;
  }

  /** 该块是否已分配 */
  has(tx: number, ty: number): boolean {
    return this.tiles.has(tileKey(tx, ty));
  }

  /**
   * 只读取某块，未分配时返回 null（表示全透明）。
   * 读路径绝不分配：否则遍历一遍就把稀疏存储变成密集的了。
   */
  read(tx: number, ty: number): PixelBuffer | null {
    return this.tiles.get(tileKey(tx, ty))?.buffer ?? null;
  }

  /**
   * 取某块的可写缓冲，未分配则就地新建，共享中则先复制（写时复制的落点）。
   *
   * 返回的 buffer 可以直接改；调用方拿到之后这一块就归它独占了。
   */
  write(tx: number, ty: number): PixelBuffer {
    const key = tileKey(tx, ty);
    const existing = this.tiles.get(key);

    if (!existing) {
      const fresh: Tile = {
        buffer: createPixelBuffer(this.size, this.size, this.format, this.channels),
        shared: 1,
      };
      this.tiles.set(key, fresh);
      return fresh.buffer;
    }

    // 还有别人（快照）在用这一块，必须复制后再改，否则会篡改历史
    if (existing.shared > 1) {
      existing.shared -= 1;
      const detached: Tile = { buffer: clonePixelBuffer(existing.buffer), shared: 1 };
      this.tiles.set(key, detached);
      return detached.buffer;
    }
    return existing.buffer;
  }

  /** 丢弃某块（等同于把它整块清成透明），已经没有则什么都不做 */
  drop(tx: number, ty: number): void {
    const key = tileKey(tx, ty);
    const tile = this.tiles.get(key);
    if (!tile) return;
    if (tile.shared > 1) tile.shared -= 1;
    this.tiles.delete(key);
  }

  /** 清空全部块。共享计数要一并让出，否则快照那边会永远认为自己在共享 */
  clear(): void {
    for (const tile of this.tiles.values()) {
      if (tile.shared > 1) tile.shared -= 1;
    }
    this.tiles = new Map();
  }

  /**
   * 生成快照：与本体共享全部块，不复制任何像素。
   *
   * 快照之后双方各自的写入都会触发那一块的复制，互不影响。
   * 这是「历史记录不再按整层存像素」的关键。
   */
  snapshot(): TileStore {
    const copy = new TileStore({ size: this.size, format: this.format, channels: this.channels });
    for (const [key, tile] of this.tiles) {
      tile.shared += 1;
      copy.tiles.set(key, tile);
    }
    return copy;
  }

  /** 估算占用字节数，只算真正分配了的块 */
  byteLength(): number {
    let total = 0;
    for (const tile of this.tiles.values()) total += tile.buffer.data.byteLength;
    return total;
  }

  /** 某块当前的共享者数量，仅供测试与诊断 */
  sharedCount(tx: number, ty: number): number {
    return this.tiles.get(tileKey(tx, ty))?.shared ?? 0;
  }
}
