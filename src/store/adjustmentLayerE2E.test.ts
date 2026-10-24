/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { newDoc, reset, store } from '../tools/testKit';
import { ctx2d } from '../engine/canvasUtils';
import { flatten } from '../engine/compositor';

describe('调整图层端到端', () => {
  beforeEach(() => {
    reset();
  });

  it('创建亮度/对比度调整图层能改变画面', () => {
    // 创建文档和底层
    newDoc();
    const base = store().addLayer('raster', '底色');
    if (!base) throw new Error('创建图层失败');

    // 底层画红色
    const baseCtx = ctx2d(base.canvas);
    baseCtx.fillStyle = '#ff0000';
    baseCtx.fillRect(0, 0, base.canvas.width, base.canvas.height);
    store().bumpRevision();

    // 添加调整图层：亮度 +100
    const adjust = store().addAdjustmentLayer('brightness-contrast', { brightness: 100, contrast: 0 });
    expect(adjust).not.toBeNull();
    expect(adjust?.type).toBe('adjustment');
    expect(adjust?.adjustmentData?.kind).toBe('brightness-contrast');

    // 合成后应该比原来的红色亮
    const doc = store().doc!;
    const composed = flatten(store().layers, doc.width, doc.height);
    const pixel = ctx2d(composed).getImageData(8, 8, 1, 1).data; // 取中心点

    // 原色 (255, 0, 0) + 亮度 100 => 大约 (255, 100, 100)
    expect(pixel[0]).toBeGreaterThan(250); // R 仍接近 255
    expect(pixel[1]).toBeGreaterThan(90); // G 从 0 变亮
    expect(pixel[2]).toBeGreaterThan(90); // B 从 0 变亮
  });

  it('调整图层不透明度控制效果强度', () => {
    newDoc();
    const base = store().addLayer('raster', '底色');
    if (!base) throw new Error('创建图层失败');

    const baseCtx = ctx2d(base.canvas);
    baseCtx.fillStyle = '#808080'; // 灰色 128
    baseCtx.fillRect(0, 0, base.canvas.width, base.canvas.height);
    store().bumpRevision();

    // 对比度 +100，但不透明度只有 50%
    const adjust = store().addAdjustmentLayer('brightness-contrast', { brightness: 0, contrast: 100 });
    if (adjust) {
      store().setLayerOpacity(adjust.id, 50);
    }

    const doc = store().doc!;
    const composed = flatten(store().layers, doc.width, doc.height);
    const pixel = ctx2d(composed).getImageData(8, 8, 1, 1).data; // 取中心点

    // 50% 不透明度意味着效果只施加一半，所以不会到极端值
    // 灰色 128 经过全强度对比度会变极端，但 50% 应该还在中间范围
    expect(pixel[0]).toBeGreaterThan(100);
    expect(pixel[0]).toBeLessThan(200);
  });
});
