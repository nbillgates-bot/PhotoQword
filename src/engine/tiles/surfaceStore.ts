/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 表面注册表：surfaceId → TiledSurface。
 *
 * 图里的节点只存 id（见 types/graph.ts 的理由：节点要能廉价复制），
 * 像素实体统一放这里。历史记录、求值器、工具都通过 id 找像素。
 *
 * 快照是这个类存在的主要理由：一次 snapshot 把所有表面各自快照一遍，
 * 由于 TileStore 是写时复制的，代价只有「之后被改动的块」，
 * 而不是当前做法的「每步一份全量像素」。
 */

import { TiledSurface } from './tiledSurface';
import type { TileStoreOptions } from './tileStore';

export class SurfaceStore {
  private surfaces = new Map<string, TiledSurface>();
  private readonly defaults: TileStoreOptions;

  constructor(defaults: TileStoreOptions = {}) {
    this.defaults = defaults;
  }

  get size(): number {
    return this.surfaces.size;
  }

  ids(): string[] {
    return [...this.surfaces.keys()];
  }

  /** 取表面，不存在返回 null。读路径不隐式创建，避免拼错 id 时静默生效 */
  get(id: string): TiledSurface | null {
    return this.surfaces.get(id) ?? null;
  }

  /** 取表面，不存在就按默认参数建一个 */
  ensure(id: string): TiledSurface {
    const existing = this.surfaces.get(id);
    if (existing) return existing;
    const created = new TiledSurface(this.defaults);
    this.surfaces.set(id, created);
    return created;
  }

  /** 直接放入一个已有的表面（撤销恢复时用） */
  set(id: string, surface: TiledSurface): void {
    this.surfaces.set(id, surface);
  }

  delete(id: string): void {
    this.surfaces.delete(id);
  }

  /** 全部表面的字节数之和。共享的块会被各自算一次，是上界而非实际占用 */
  byteLength(): number {
    let total = 0;
    for (const surface of this.surfaces.values()) total += surface.store.byteLength();
    return total;
  }

  /**
   * 快照全部表面。不复制任何像素，只共享块并递增引用计数。
   * 返回的 Map 可以直接存进历史记录条目。
   */
  snapshot(): Map<string, TiledSurface> {
    const out = new Map<string, TiledSurface>();
    for (const [id, surface] of this.surfaces) out.set(id, surface.snapshot());
    return out;
  }

  /**
   * 从快照恢复。快照里没有的表面会被删掉——
   * 那是「这一步之后新建的表面」，回退到这一步时它就不该存在。
   *
   * 恢复时再快照一次，而不是直接用快照里的实例：
   * 直接用的话，后续对当前状态的写入会分离出新块，
   * 但历史条目持有的正是同一个实例，等于把历史改掉了。
   */
  restore(snapshot: Map<string, TiledSurface>): void {
    const next = new Map<string, TiledSurface>();
    for (const [id, surface] of snapshot) next.set(id, surface.snapshot());
    this.surfaces = next;
  }

  clear(): void {
    this.surfaces = new Map();
  }
}
