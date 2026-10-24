/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { GraphNode, LayerGraph } from '../../types/graph';
import { readNorm, writeNorm } from '../pixel/buffer';
import { SurfaceStore } from '../tiles/surfaceStore';
import { GraphHistory } from './graphHistory';

const W = 8;
const H = 8;

function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    kind: 'pixel',
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    parentId: null,
    surfaceId: `${id}-s`,
    bounds: { x: 0, y: 0, width: W, height: H },
    ...extra,
  } as GraphNode;
}

function graphOf(...nodes: GraphNode[]): LayerGraph {
  const map: Record<string, GraphNode> = {};
  for (const item of nodes) map[item.id] = item;
  return { nodes: map, order: nodes.map((item) => item.id) };
}

/** 往表面写一个已知值 */
function stamp(store: SurfaceStore, id: string, value: number): void {
  store.ensure(id).forEachWritable({ x: 0, y: 0, width: 1, height: 1 }, (tile) => {
    writeNorm(tile, 0, 0, 0, value);
  });
}

function peek(store: SurfaceStore, id: string): number | null {
  const tile = store.get(id)?.store.read(0, 0);
  return tile ? readNorm(tile, 0, 0, 0) : null;
}

function newStore(): SurfaceStore {
  return new SurfaceStore({ size: W });
}

const base = { width: W, height: H };

describe('GraphHistory 栈语义', () => {
  it('新建时为空且不能撤销', () => {
    const history = new GraphHistory();
    expect(history.length).toBe(0);
    expect(history.index).toBe(-1);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
    expect(history.current).toBeNull();
  });

  it('第 0 步是初始快照，本身不能再退', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '新建', graph: graphOf(node('a')), ...base });
    expect(history.index).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('压入第二步后可以撤销', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '新建', graph: graphOf(node('a')), ...base });
    history.push(store, { label: '画笔', graph: graphOf(node('a')), ...base });
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });

  it('撤销后可以重做', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '新建', graph: graphOf(node('a')), ...base });
    history.push(store, { label: '画笔', graph: graphOf(node('a')), ...base });
    history.undo(store);
    expect(history.canRedo()).toBe(true);
    expect(history.index).toBe(0);
    history.redo(store);
    expect(history.index).toBe(1);
  });

  it('撤销到底之后再撤销返回 null，不越界', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '新建', graph: graphOf(node('a')), ...base });
    expect(history.undo(store)).toBeNull();
    expect(history.index).toBe(0);
  });

  it('重做到顶之后再重做返回 null', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '新建', graph: graphOf(node('a')), ...base });
    expect(history.redo(store)).toBeNull();
  });

  it('撤销后压入新步会截断后面的分支（历史是线性的）', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '1', graph: graphOf(node('a')), ...base });
    history.push(store, { label: '2', graph: graphOf(node('a')), ...base });
    history.push(store, { label: '3', graph: graphOf(node('a')), ...base });
    history.undo(store);
    history.undo(store);
    history.push(store, { label: '新分支', graph: graphOf(node('a')), ...base });

    expect(history.labels()).toEqual(['1', '新分支']);
    expect(history.canRedo()).toBe(false);
  });

  it('超上限时丢弃最旧的，长度不无限增长', () => {
    const store = newStore();
    const history = new GraphHistory(3);
    for (let i = 1; i <= 5; i += 1) {
      history.push(store, { label: `${i}`, graph: graphOf(node('a')), ...base });
    }
    expect(history.length).toBe(3);
    expect(history.labels()).toEqual(['3', '4', '5']);
    expect(history.index).toBe(2);
  });

  it('上限为 1 时也成立（边界值）', () => {
    const store = newStore();
    const history = new GraphHistory(1);
    history.push(store, { label: '1', graph: graphOf(node('a')), ...base });
    history.push(store, { label: '2', graph: graphOf(node('a')), ...base });
    expect(history.length).toBe(1);
    expect(history.labels()).toEqual(['2']);
  });

  it('clear 之后回到初始状态', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '1', graph: graphOf(node('a')), ...base });
    history.clear();
    expect(history.length).toBe(0);
    expect(history.index).toBe(-1);
  });

  it('jump 到不存在的下标返回 null 且不改变位置', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '1', graph: graphOf(node('a')), ...base });
    expect(history.jump(store, 5)).toBeNull();
    expect(history.jump(store, -1)).toBeNull();
    expect(history.index).toBe(0);
  });
});

describe('GraphHistory 像素恢复', () => {
  it('撤销把像素恢复到上一步', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '第一步', graph: graphOf(node('a')), ...base });

    stamp(store, 'a', 0);
    history.push(store, { label: '第二步', graph: graphOf(node('a')), ...base });

    history.undo(store);
    expect(peek(store, 'a')).toBe(1);
  });

  it('重做把像素推回去', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '第一步', graph: graphOf(node('a')), ...base });
    stamp(store, 'a', 0);
    history.push(store, { label: '第二步', graph: graphOf(node('a')), ...base });

    history.undo(store);
    history.redo(store);
    expect(peek(store, 'a')).toBe(0);
  });

  it('来回撤销重做多次结果稳定，不累积误差', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '一', graph: graphOf(node('a')), ...base });
    stamp(store, 'a', 0);
    history.push(store, { label: '二', graph: graphOf(node('a')), ...base });

    for (let i = 0; i < 5; i += 1) {
      history.undo(store);
      expect(peek(store, 'a')).toBe(1);
      history.redo(store);
      expect(peek(store, 'a')).toBe(0);
    }
  });

  it('恢复后继续编辑不会篡改历史条目', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '一', graph: graphOf(node('a')), ...base });
    stamp(store, 'a', 0);
    history.push(store, { label: '二', graph: graphOf(node('a')), ...base });

    history.undo(store);
    // 回到第一步后继续画
    stamp(store, 'a', 0.25);
    // 第一步的快照必须还是 1
    history.jump(store, 0);
    expect(peek(store, 'a')).toBe(1);
  });

  it('撤销新建图层：那一步之后建的表面被删掉', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '一层', graph: graphOf(node('a')), ...base });

    stamp(store, 'b', 1);
    history.push(store, { label: '加一层', graph: graphOf(node('a'), node('b')), ...base });

    history.undo(store);
    expect(store.get('b')).toBeNull();
    expect(peek(store, 'a')).toBe(1);
  });

  it('撤销删除图层：表面被补回来', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    stamp(store, 'b', 1);
    history.push(store, { label: '两层', graph: graphOf(node('a'), node('b')), ...base });

    store.delete('b');
    history.push(store, { label: '删一层', graph: graphOf(node('a')), ...base });

    history.undo(store);
    expect(peek(store, 'b')).toBe(1);
  });

  it('图结构与文档尺寸随记录一起回退', () => {
    const store = newStore();
    const history = new GraphHistory();
    history.push(store, { label: '一层', graph: graphOf(node('a')), width: 8, height: 8 });
    history.push(store, {
      label: '裁剪并加层',
      graph: graphOf(node('a'), node('b')),
      width: 4,
      height: 4,
    });

    const entry = history.undo(store);
    expect(entry?.width).toBe(8);
    expect(entry?.height).toBe(8);
    expect(Object.keys(entry?.graph.nodes ?? {})).toEqual(['a']);
  });

  it('jump 到当前步语义是「丢弃未提交的改动」', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 1);
    history.push(store, { label: '一', graph: graphOf(node('a')), ...base });

    // 提交之后又画了几笔，但没有 push
    stamp(store, 'a', 0);
    history.jump(store, history.index);
    expect(peek(store, 'a')).toBe(1);
  });

  it('快照的代价只有改动的块（这是换掉整层快照的理由）', () => {
    const store = newStore();
    const history = new GraphHistory();
    const surface = store.ensure('a');
    // 铺 20 块
    for (let i = 0; i < 20; i += 1) {
      surface.forEachWritable({ x: i * W, y: 0, width: 1, height: 1 }, () => {});
    }
    history.push(store, { label: '一', graph: graphOf(node('a')), ...base });

    // 只改第一块
    stamp(store, 'a', 1);

    // 被改的那块脱离共享，其余 19 块仍与历史条目共享
    expect(store.get('a')?.store.sharedCount(0, 0)).toBe(1);
    expect(store.get('a')?.store.sharedCount(1, 0)).toBe(2);
  });

  it('多步历史下未改动的块始终只有一份', () => {
    const store = newStore();
    const history = new GraphHistory();
    const surface = store.ensure('a');
    // 块 (5,0) 建好之后再也不动
    surface.forEachWritable({ x: 5 * W, y: 0, width: 1, height: 1 }, () => {});

    for (let step = 0; step < 10; step += 1) {
      stamp(store, 'a', step / 10);
      history.push(store, { label: `第 ${step} 步`, graph: graphOf(node('a')), ...base });
    }

    // 10 步历史 + 当前状态共享同一个未改动块，而不是各存一份
    const shared = store.get('a')?.store.sharedCount(5, 0) ?? 0;
    expect(shared).toBeGreaterThan(1);

    /*
     * 刚 push 完时被改写的块也还与最新快照共享（共享数 2）——
     * 分离发生在「下一次写入」那一刻，不是 push 那一刻。
     * 再写一次即可看到它脱离共享，只剩当前状态独占。
     */
    expect(store.get('a')?.store.sharedCount(0, 0)).toBe(2);
    stamp(store, 'a', 1);
    expect(store.get('a')?.store.sharedCount(0, 0)).toBe(1);
  });

  it('像素里没有 NaN', () => {
    const store = newStore();
    const history = new GraphHistory();
    stamp(store, 'a', 0.5);
    history.push(store, { label: '一', graph: graphOf(node('a')), ...base });
    history.jump(store, 0);
    const tile = store.get('a')?.store.read(0, 0);
    expect([...(tile?.data ?? [])].some((v) => Number.isNaN(v))).toBe(false);
  });
});
