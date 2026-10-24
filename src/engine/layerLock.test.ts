/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { createCanvas } from './canvasUtils';
import {
  isLocked,
  LOCK_FIELD,
  LOCK_LABEL,
  moveBlockReason,
  pixelBlockReason,
  shownAsLocked,
  transformBlockReason,
} from './layerLock';

function layer(patch: Partial<Layer> = {}): Layer {
  return {
    id: 'l1',
    name: '图层 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas: createCanvas(2, 2),
    ...patch,
  } as Layer;
}

describe('isLocked', () => {
  it('四个开关各读各自的字段', () => {
    expect(isLocked(layer({ lockTransparent: true }), 'transparent')).toBe(true);
    expect(isLocked(layer({ lockPixels: true }), 'pixels')).toBe(true);
    expect(isLocked(layer({ lockPosition: true }), 'position')).toBe(true);
    expect(isLocked(layer({ locked: true }), 'all')).toBe(true);
  });

  it('没设过的细分锁读出来是 false 而不是 undefined', () => {
    expect(isLocked(layer(), 'transparent')).toBe(false);
    expect(isLocked(layer(), 'pixels')).toBe(false);
    expect(isLocked(layer(), 'position')).toBe(false);
  });

  it('全部锁定不会串到细分锁的读取上', () => {
    // 读的是各自字段；「显示为锁上」是 shownAsLocked 的事
    expect(isLocked(layer({ locked: true }), 'transparent')).toBe(false);
  });
});

describe('LOCK_FIELD / LOCK_LABEL', () => {
  it('每个 kind 都有字段名和标签词条 key', () => {
    for (const kind of ['transparent', 'pixels', 'position', 'all'] as const) {
      expect(LOCK_FIELD[kind]).toBeTruthy();
      expect(LOCK_LABEL[kind]).toBeTruthy();
    }
  });

  it('字段名与 Layer 上的属性对得上', () => {
    expect(LOCK_FIELD.transparent).toBe('lockTransparent');
    expect(LOCK_FIELD.pixels).toBe('lockPixels');
    expect(LOCK_FIELD.position).toBe('lockPosition');
    expect(LOCK_FIELD.all).toBe('locked');
  });
});

describe('pixelBlockReason', () => {
  it('没锁时放行', () => {
    expect(pixelBlockReason(layer())).toBeNull();
  });

  it('全部锁定挡住像素编辑', () => {
    expect(pixelBlockReason(layer({ locked: true }))).toBe('toast.layerLocked');
  });

  it('锁定图像像素挡住像素编辑', () => {
    expect(pixelBlockReason(layer({ lockPixels: true }))).toBe('toast.pixelsLocked');
  });

  it('锁定透明像素不挡：它允许下笔，只在合入时裁掉透明区', () => {
    expect(pixelBlockReason(layer({ lockTransparent: true }))).toBeNull();
  });

  it('锁定位置不挡像素', () => {
    expect(pixelBlockReason(layer({ lockPosition: true }))).toBeNull();
  });

  it('没有活动层时返回 null，由调用方自己判空', () => {
    expect(pixelBlockReason(null)).toBeNull();
    expect(pixelBlockReason(undefined)).toBeNull();
  });
});

describe('moveBlockReason', () => {
  it('锁定位置挡住移动', () => {
    expect(moveBlockReason(layer({ lockPosition: true }))).toBe('toast.positionLocked');
  });

  it('全部锁定也挡住移动', () => {
    expect(moveBlockReason(layer({ locked: true }))).toBe('toast.layerLocked');
  });

  it('锁定像素不挡移动，与 PS 一致', () => {
    expect(moveBlockReason(layer({ lockPixels: true }))).toBeNull();
  });
});

describe('transformBlockReason', () => {
  it('像素锁和位置锁任一都挡住变换', () => {
    expect(transformBlockReason(layer({ lockPixels: true }))).toBe('toast.pixelsLocked');
    expect(transformBlockReason(layer({ lockPosition: true }))).toBe('toast.positionLocked');
  });

  it('都没锁时放行', () => {
    expect(transformBlockReason(layer())).toBeNull();
  });

  it('锁定透明像素不挡变换', () => {
    expect(transformBlockReason(layer({ lockTransparent: true }))).toBeNull();
  });
});

describe('shownAsLocked', () => {
  it('全部锁定时另外三个也显示为锁上', () => {
    const all = layer({ locked: true });
    expect(shownAsLocked(all, 'transparent')).toBe(true);
    expect(shownAsLocked(all, 'pixels')).toBe(true);
    expect(shownAsLocked(all, 'position')).toBe(true);
    expect(shownAsLocked(all, 'all')).toBe(true);
  });

  it('只锁细分项时全部锁定那个按钮不亮', () => {
    const one = layer({ lockPixels: true });
    expect(shownAsLocked(one, 'pixels')).toBe(true);
    expect(shownAsLocked(one, 'all')).toBe(false);
    expect(shownAsLocked(one, 'transparent')).toBe(false);
  });
});
