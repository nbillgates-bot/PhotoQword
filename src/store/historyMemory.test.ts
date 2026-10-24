/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';
import type { HistoryEntry } from '../types';

/**
 * 内存占用回归测试。
 * 这是整个改造的目的：老实现每步深拷贝全部图层，4000x3000 五图层
 * 单快照 229MB、30 步 6.7GB，浏览器会直接杀掉标签页。
 * 这里用小文档等比验证"每步只存改动区域"，回归到整存会立刻超标。
 */

const store = () => useEditorStore.getState();

/** 统计一条历史记录里像素数据的字节数 */
function entryBytes(entry: HistoryEntry): number {
  let bytes = 0;
  for (const delta of entry.deltas) {
    if (delta.kind === 'region') {
      bytes += delta.before.data.length + delta.after.data.length;
    } else {
      bytes += (delta.before?.data.length ?? 0) + (delta.after?.data.length ?? 0);
    }
  }
  return bytes;
}

function historyBytes(): number {
  return store().history.reduce((sum, entry) => sum + entryBytes(entry), 0);
}

function paint(color: string, x: number, y: number, w: number, h: number): void {
  const layer = store().activeLayer()!;
  const context = ctx2d(layer.canvas);
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

describe('历史记录内存占用', () => {
  beforeEach(() => store().closeDoc());

  it('小笔触只存改动区域，远小于整幅图', () => {
    const size = 200;
    const fullFrame = size * size * 4; // 单图层整幅 160,000 字节
    useEditorStore.getState().createDoc({
      name: '内存测试',
      width: size,
      height: size,
      background: 'white',
    });

    // 20 笔小改动，每笔 10x10
    for (let i = 0; i < 20; i += 1) {
      paint(i % 2 === 0 ? '#ff0000' : '#00ff00', (i * 7) % 180, (i * 11) % 180, 10, 10);
      store().pushHistory(`第 ${i} 笔`);
    }

    const total = historyBytes();
    // 老实现：21 步 x 整幅 = 约 21 倍整幅。
    // 增量实现：初始 1 份整幅 + 20 笔各 2x(10x10) 小块，应远低于 3 倍整幅
    expect(total).toBeLessThan(fullFrame * 3);
  });

  it('单笔改动的记录体积与改动面积成正比，而不是与画布成正比', () => {
    const size = 200;
    useEditorStore.getState().createDoc({
      name: '内存测试',
      width: size,
      height: size,
      background: 'white',
    });

    paint('#ff0000', 50, 50, 10, 10);
    store().pushHistory('小笔触');
    const small = entryBytes(store().history[1]);

    paint('#0000ff', 20, 20, 100, 100);
    store().pushHistory('大笔触');
    const large = entryBytes(store().history[2]);

    // 10x10 存两份 = 800 字节；100x100 存两份 = 80,000 字节
    expect(small).toBe(10 * 10 * 4 * 2);
    expect(large).toBe(100 * 100 * 4 * 2);
    expect(large / small).toBeCloseTo(100, 0);
  });

  it('没有改动时不产生像素开销', () => {
    useEditorStore.getState().createDoc({
      name: '内存测试',
      width: 64,
      height: 64,
      background: 'white',
    });
    const before = historyBytes();
    store().pushHistory('什么都没改');
    // 这一步没有任何像素变化，deltas 应为空
    expect(store().history[store().history.length - 1].deltas).toHaveLength(0);
    expect(historyBytes()).toBe(before);
  });

  it('真实尺寸下总占用不到整存模型的两成', () => {
    const W = 1200;
    const H = 900;
    useEditorStore.getState().createDoc({ name: '对比', width: W, height: H, background: 'white' });
    store().addLayer('raster', '中层');
    const top = store().addLayer('raster', '上层')!;
    store().setActiveLayer(top.id);

    for (let i = 0; i < 30; i += 1) {
      const layer = store().activeLayer()!;
      const context = ctx2d(layer.canvas);
      context.fillStyle = i % 2 === 0 ? '#ff0000' : '#0000ff';
      context.fillRect((i * 31) % 1000, (i * 17) % 700, 60, 60);
      store().pushHistory(`描边 ${i}`, { layerIds: [layer.id] });
    }

    const layerCount = store().layers.length;
    const shadowCost = W * H * 4 * layerCount; // 影子副本是固定开销，一份全量
    const oldModel = W * H * 4 * layerCount * store().history.length;
    // 实测约 13.2MB vs 老实现 370.8MB，降幅 96%
    expect(historyBytes() + shadowCost).toBeLessThan(oldModel * 0.2);
  });

  it('改动接近整幅时退回整存，不会存成两份差不多大的区域', () => {
    const size = 64;
    useEditorStore.getState().createDoc({
      name: '内存测试',
      width: size,
      height: size,
      background: 'white',
    });
    paint('#ff0000', 0, 0, size, size);
    store().pushHistory('涂满');

    const entry = store().history[1];
    expect(entry.deltas[0].kind).toBe('full');
  });
});
