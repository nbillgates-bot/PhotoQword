/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { readNorm, writeNorm } from '../pixel/buffer';
import { SurfaceStore } from './surfaceStore';
import { TiledSurface } from './tiledSurface';

/** 往表面的 (0,0) 写一个已知值 */
function stamp(surface: TiledSurface, value: number): void {
  surface.forEachWritable({ x: 0, y: 0, width: 1, height: 1 }, (tile) => {
    writeNorm(tile, 0, 0, 0, value);
  });
}

/** 读回 (0,0) 的值，块不存在时返回 null */
function peek(surface: TiledSurface | null): number | null {
  const tile = surface?.store.read(0, 0);
  return tile ? readNorm(tile, 0, 0, 0) : null;
}

describe('SurfaceStore 基础', () => {
  it('新建为空', () => {
    const store = new SurfaceStore();
    expect(store.size).toBe(0);
    expect(store.byteLength()).toBe(0);
    expect(store.ids()).toEqual([]);
  });

  it('get 不隐式创建（拼错 id 不该静默生效）', () => {
    const store = new SurfaceStore();
    expect(store.get('a')).toBeNull();
    expect(store.size).toBe(0);
  });

  it('ensure 建一次，之后返回同一个实例', () => {
    const store = new SurfaceStore();
    const first = store.ensure('a');
    expect(store.ensure('a')).toBe(first);
    expect(store.size).toBe(1);
  });

  it('ensure 出的表面沿用默认块参数', () => {
    const store = new SurfaceStore({ size: 32, format: 'u16', channels: 1 });
    expect(store.ensure('a').size).toBe(32);
    expect(store.ensure('a').store.format).toBe('u16');
  });

  it('delete 之后取不到', () => {
    const store = new SurfaceStore();
    store.ensure('a');
    store.delete('a');
    expect(store.get('a')).toBeNull();
  });

  it('clear 清空全部', () => {
    const store = new SurfaceStore();
    store.ensure('a');
    store.ensure('b');
    store.clear();
    expect(store.size).toBe(0);
  });
});

describe('SurfaceStore 快照与恢复', () => {
  it('快照不复制像素，块被共享', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    expect(snap.get('a')?.store.read(0, 0)).toBe(store.get('a')?.store.read(0, 0));
    expect(store.get('a')?.store.sharedCount(0, 0)).toBe(2);
  });

  it('快照后改当前状态，快照保持原值', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    stamp(store.get('a')!, 0);
    expect(peek(store.get('a'))).toBe(0);
    expect(peek(snap.get('a') ?? null)).toBe(1);
  });

  it('恢复后像素回到快照时的值', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    stamp(store.get('a')!, 0);
    store.restore(snap);
    expect(peek(store.get('a'))).toBe(1);
  });

  it('恢复后继续编辑不会篡改历史条目（关键不变量）', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    store.restore(snap);
    // 恢复之后再改当前状态
    stamp(store.get('a')!, 0);
    // 历史条目里的那份必须还是 1
    expect(peek(snap.get('a') ?? null)).toBe(1);
  });

  it('同一份快照可以反复恢复（撤销重做来回走）', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();

    for (let i = 0; i < 3; i += 1) {
      stamp(store.get('a')!, 0);
      store.restore(snap);
      expect(peek(store.get('a'))).toBe(1);
    }
  });

  it('恢复时删掉快照之后才建的表面', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    store.ensure('later');
    store.restore(snap);
    expect(store.get('later')).toBeNull();
    expect(store.get('a')).not.toBeNull();
  });

  it('恢复时补回快照之后被删的表面', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const snap = store.snapshot();
    store.delete('a');
    store.restore(snap);
    expect(peek(store.get('a'))).toBe(1);
  });

  it('多份快照互不影响', () => {
    const store = new SurfaceStore({ size: 8 });
    stamp(store.ensure('a'), 1);
    const first = store.snapshot();
    stamp(store.get('a')!, 0.5);
    const second = store.snapshot();
    stamp(store.get('a')!, 0);

    expect(peek(first.get('a') ?? null)).toBe(1);
    expect(peek(second.get('a') ?? null)).toBeCloseTo(0.5, 2);
    expect(peek(store.get('a'))).toBe(0);
  });

  it('快照的内存代价只有改动的块，不是整份像素', () => {
    const store = new SurfaceStore({ size: 8 });
    const surface = store.ensure('a');
    // 铺 20 块
    for (let i = 0; i < 20; i += 1) {
      surface.forEachWritable({ x: i * 8, y: 0, width: 1, height: 1 }, () => {});
    }
    const snap = store.snapshot();
    // 只改第一块
    stamp(store.get('a')!, 1);

    // 只有被改的那块脱离了共享，其余 19 块仍共享
    expect(store.get('a')?.store.sharedCount(0, 0)).toBe(1);
    expect(store.get('a')?.store.sharedCount(1, 0)).toBe(2);
    expect(snap.get('a')?.store.tileCount).toBe(20);
  });

  it('set 放入的表面能被取到', () => {
    const store = new SurfaceStore({ size: 8 });
    const external = new TiledSurface({ size: 8 });
    stamp(external, 1);
    store.set('a', external);
    expect(peek(store.get('a'))).toBe(1);
  });

  it('空存储的快照与恢复都成立', () => {
    const store = new SurfaceStore();
    const snap = store.snapshot();
    expect(snap.size).toBe(0);
    store.ensure('a');
    store.restore(snap);
    expect(store.size).toBe(0);
  });
});
