/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { readNorm, writeNorm } from '../pixel/buffer';
import { TILE_SIZE } from './tileGeometry';
import { TileStore } from './tileStore';

describe('TileStore 稀疏性', () => {
  it('新建时不占任何块，也不占字节', () => {
    const store = new TileStore();
    expect(store.tileCount).toBe(0);
    expect(store.byteLength()).toBe(0);
  });

  it('只读不分配：读没画过的块返回 null 且块数不变', () => {
    const store = new TileStore();
    expect(store.read(0, 0)).toBeNull();
    expect(store.read(100, -50)).toBeNull();
    expect(store.tileCount).toBe(0);
  });

  it('写一块只分配一块，与文档尺寸无关', () => {
    const store = new TileStore();
    store.write(400, 900);
    expect(store.tileCount).toBe(1);
    expect(store.byteLength()).toBe(TILE_SIZE * TILE_SIZE * 4);
  });

  it('分块比整层画布省内存（这就是重构的动机）', () => {
    // 790×14235 的文档只在左上角画了一块
    const store = new TileStore();
    store.write(0, 0);
    const fullLayer = 790 * 14235 * 4;
    expect(store.byteLength()).toBeLessThan(fullLayer / 100);
  });

  it('负块坐标可用，has/keys 一致', () => {
    const store = new TileStore();
    store.write(-1, -2);
    expect(store.has(-1, -2)).toBe(true);
    expect(store.keys()).toEqual([{ tx: -1, ty: -2 }]);
  });
});

describe('TileStore 读写', () => {
  it('写进去的值能读回来', () => {
    const store = new TileStore();
    const tile = store.write(2, 3);
    writeNorm(tile, 10, 20, 0, 1);
    expect(readNorm(store.read(2, 3)!, 10, 20, 0)).toBe(1);
  });

  it('同一块重复 write 返回同一个缓冲，不重复分配', () => {
    const store = new TileStore();
    const first = store.write(0, 0);
    const second = store.write(0, 0);
    expect(second).toBe(first);
    expect(store.tileCount).toBe(1);
  });

  it('块的尺寸与格式跟随构造选项', () => {
    const store = new TileStore({ size: 64, format: 'u16', channels: 1 });
    const tile = store.write(0, 0);
    expect(tile.width).toBe(64);
    expect(tile.height).toBe(64);
    expect(tile.format).toBe('u16');
    expect(tile.channels).toBe(1);
    expect(store.byteLength()).toBe(64 * 64 * 2);
  });

  it('新块是全透明的，且不含 NaN', () => {
    const store = new TileStore({ size: 8, format: 'f32' });
    const tile = store.write(0, 0);
    expect([...tile.data].every((v) => v === 0)).toBe(true);
    expect([...tile.data].some((v) => Number.isNaN(v))).toBe(false);
  });

  it('drop 之后该块视同全透明', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 0, 0, 0, 1);
    store.drop(0, 0);
    expect(store.read(0, 0)).toBeNull();
    expect(store.tileCount).toBe(0);
  });

  it('drop 不存在的块是空操作', () => {
    const store = new TileStore();
    expect(() => store.drop(9, 9)).not.toThrow();
    expect(store.tileCount).toBe(0);
  });

  it('clear 清掉全部块', () => {
    const store = new TileStore();
    store.write(0, 0);
    store.write(1, 1);
    store.clear();
    expect(store.tileCount).toBe(0);
    expect(store.byteLength()).toBe(0);
  });
});

describe('TileStore 写时复制', () => {
  it('快照不复制像素，两边共享同一批块对象', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 1, 1, 0, 1);
    const snap = store.snapshot();
    expect(snap.read(0, 0)).toBe(store.read(0, 0));
    expect(snap.sharedCount(0, 0)).toBe(2);
  });

  it('快照后改本体，只复制被改的那一块，快照保持原值', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 1, 1, 0, 1);
    writeNorm(store.write(1, 0), 1, 1, 0, 1);
    const snap = store.snapshot();

    // 只改块 (0,0)
    writeNorm(store.write(0, 0), 1, 1, 0, 0);

    expect(readNorm(store.read(0, 0)!, 1, 1, 0)).toBe(0);
    // 快照那一块没被篡改
    expect(readNorm(snap.read(0, 0)!, 1, 1, 0)).toBe(1);
    // 没改过的块仍然共享，没有白复制
    expect(snap.read(1, 0)).toBe(store.read(1, 0));
  });

  it('反过来改快照也不影响本体', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 0, 0, 0, 1);
    const snap = store.snapshot();
    writeNorm(snap.write(0, 0), 0, 0, 0, 0);
    expect(readNorm(store.read(0, 0)!, 0, 0, 0)).toBe(1);
  });

  it('复制只发生一次：同一块第二次写不再分离', () => {
    const store = new TileStore();
    store.write(0, 0);
    store.snapshot();
    const detached = store.write(0, 0);
    expect(store.write(0, 0)).toBe(detached);
    expect(store.sharedCount(0, 0)).toBe(1);
  });

  it('多重快照各自独立，互不串味', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 0, 0, 0, 1);
    const a = store.snapshot();
    const b = store.snapshot();
    expect(store.sharedCount(0, 0)).toBe(3);

    writeNorm(store.write(0, 0), 0, 0, 0, 0);
    expect(readNorm(a.read(0, 0)!, 0, 0, 0)).toBe(1);
    expect(readNorm(b.read(0, 0)!, 0, 0, 0)).toBe(1);
    expect(a.read(0, 0)).toBe(b.read(0, 0));
  });

  it('快照的内存代价只有被改动的块，而不是整层', () => {
    const store = new TileStore();
    for (let i = 0; i < 20; i += 1) store.write(i, 0);
    const before = store.byteLength();
    const snap = store.snapshot();

    // 只改一块，此时真实新增开销 = 一块
    store.write(0, 0);
    const perTile = TILE_SIZE * TILE_SIZE * 4;
    // 两边各自报告 20 块（共享的块被双方都算进来了）
    expect(snap.byteLength()).toBe(before);
    expect(store.byteLength()).toBe(before);
    // 真正独占的块只有 1 块
    expect(store.sharedCount(0, 0)).toBe(1);
    expect(store.sharedCount(1, 0)).toBe(2);
    expect(perTile).toBeGreaterThan(0);
  });

  it('本体 drop 掉共享块时，快照仍能读到原像素', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 0, 0, 0, 1);
    const snap = store.snapshot();
    store.drop(0, 0);
    expect(store.read(0, 0)).toBeNull();
    expect(readNorm(snap.read(0, 0)!, 0, 0, 0)).toBe(1);
    expect(snap.sharedCount(0, 0)).toBe(1);
  });

  it('本体 clear 之后快照仍完好，且快照可独占改写', () => {
    const store = new TileStore();
    writeNorm(store.write(0, 0), 0, 0, 0, 1);
    const snap = store.snapshot();
    store.clear();
    expect(readNorm(snap.read(0, 0)!, 0, 0, 0)).toBe(1);
    expect(snap.sharedCount(0, 0)).toBe(1);
    // 计数已让回，此时写入不该再触发复制
    expect(snap.write(0, 0)).toBe(snap.read(0, 0));
  });

  it('快照继承尺寸与格式', () => {
    const store = new TileStore({ size: 32, format: 'u16', channels: 1 });
    const snap = store.snapshot();
    expect(snap.size).toBe(32);
    expect(snap.format).toBe('u16');
    expect(snap.channels).toBe(1);
  });

  it('空存储的快照也是空的', () => {
    expect(new TileStore().snapshot().tileCount).toBe(0);
  });
});
