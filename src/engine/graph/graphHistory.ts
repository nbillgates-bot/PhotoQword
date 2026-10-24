/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 基于分块快照的历史记录。
 *
 * 现有 historySlice 走的是「影子副本 + 像素差分」：每步扫描图层算出变化的
 * 矩形，再存那块像素。能用，但要维护一份全量影子，且每次提交都要 getImageData
 * 扫一遍所有图层。
 *
 * 换成写时复制的分块之后，「存一份快照」退化成共享块并递增引用计数——
 * 不扫描、不复制、不算差分。代价只有之后真被改动的那些块。
 *
 * 这里只管历史栈的语义（压入、撤销、重做、上限、分支截断），
 * 像素归 SurfaceStore，结构归 LayerGraph。
 */

import type { LayerGraph } from '../../types/graph';
import type { SurfaceStore } from '../tiles/surfaceStore';
import type { TiledSurface } from '../tiles/tiledSurface';

export interface GraphHistoryEntry {
  label: string;
  /** 这一步之后的图结构。不可变对象，直接存引用即可 */
  graph: LayerGraph;
  /** 这一步之后各表面的分块快照 */
  surfaces: Map<string, TiledSurface>;
  /** 文档尺寸也要存，否则裁剪/旋转这类操作无法撤销 */
  width: number;
  height: number;
}

/** 与现有 historySlice 的 HISTORY_LIMIT 保持一致 */
const DEFAULT_LIMIT = 30;

export interface PushArgs {
  label: string;
  graph: LayerGraph;
  width: number;
  height: number;
}

export class GraphHistory {
  private entries: GraphHistoryEntry[] = [];
  private cursor = -1;
  private readonly limit: number;

  constructor(limit = DEFAULT_LIMIT) {
    this.limit = Math.max(1, limit);
  }

  get length(): number {
    return this.entries.length;
  }

  /** 当前所处的步序号，-1 表示还没有任何记录 */
  get index(): number {
    return this.cursor;
  }

  get current(): GraphHistoryEntry | null {
    return this.entries[this.cursor] ?? null;
  }

  labels(): string[] {
    return this.entries.map((entry) => entry.label);
  }

  /**
   * 压入一步。
   *
   * 在当前位置之后还有记录时（撤销过又做了新操作），后面那些被丢弃——
   * 与 PS 一致，历史是线性的，没有分支。
   */
  push(store: SurfaceStore, args: PushArgs): void {
    const kept = this.entries.slice(0, this.cursor + 1);
    kept.push({
      label: args.label,
      graph: args.graph,
      surfaces: store.snapshot(),
      width: args.width,
      height: args.height,
    });

    const overflow = Math.max(0, kept.length - this.limit);
    this.entries = overflow > 0 ? kept.slice(overflow) : kept;
    this.cursor = this.entries.length - 1;
  }

  canUndo(): boolean {
    // 第 0 步是文档创建时的初始快照，恒为可回退的起点，本身不能再退
    return this.cursor > 0;
  }

  canRedo(): boolean {
    return this.cursor < this.entries.length - 1;
  }

  /** 回退一步，返回该步的记录；退不动时返回 null */
  undo(store: SurfaceStore): GraphHistoryEntry | null {
    if (!this.canUndo()) return null;
    return this.jump(store, this.cursor - 1);
  }

  /** 前进一步 */
  redo(store: SurfaceStore): GraphHistoryEntry | null {
    if (!this.canRedo()) return null;
    return this.jump(store, this.cursor + 1);
  }

  /**
   * 跳到指定步并把像素恢复到那一步的状态。
   *
   * 跳到当前所在的这一步也是有意义的操作：语义是「丢弃尚未提交的改动」，
   * PS 里点击历史面板当前那一行就是这个效果。
   */
  jump(store: SurfaceStore, index: number): GraphHistoryEntry | null {
    const entry = this.entries[index];
    if (!entry) return null;
    store.restore(entry.surfaces);
    this.cursor = index;
    return entry;
  }

  /** 清空（文档关闭、切换时调用） */
  clear(): void {
    this.entries = [];
    this.cursor = -1;
  }
}
