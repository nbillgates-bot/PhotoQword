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
import { showsThumb, THUMB_BOX, THUMB_SIZE_OPTIONS, thumbBoxOf } from './thumbSize';

function layer(patch: Partial<Layer> = {}): Layer {
  return {
    id: 'l1',
    name: '图层 1',
    type: 'raster',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas: createCanvas(4, 4),
    bounds: { x: 0, y: 0, width: 4, height: 4 },
    ...patch,
  };
}

describe('THUMB_BOX / 选项表', () => {
  it('四档尺寸自小到大递增，「无」为 0', () => {
    expect(THUMB_BOX.none).toBe(0);
    expect(THUMB_BOX.small).toBeLessThan(THUMB_BOX.medium);
    expect(THUMB_BOX.medium).toBeLessThan(THUMB_BOX.large);
  });

  it('选项表与尺寸表一一对应，不多不少', () => {
    expect(THUMB_SIZE_OPTIONS).toHaveLength(Object.keys(THUMB_BOX).length);
    for (const option of THUMB_SIZE_OPTIONS) {
      expect(THUMB_BOX[option.value]).toBeDefined();
    }
  });

  it('thumbBoxOf 就是查表', () => {
    for (const option of THUMB_SIZE_OPTIONS) {
      expect(thumbBoxOf(option.value)).toBe(THUMB_BOX[option.value]);
    }
  });
});

describe('showsThumb', () => {
  it('「无」这一档谁都不画', () => {
    expect(showsThumb(layer(), 'none')).toBe(false);
    expect(showsThumb(layer({ type: 'group' }), 'none')).toBe(false);
  });

  it('组不画像素缩略图，它用文件夹图标', () => {
    expect(showsThumb(layer({ type: 'group' }), 'small')).toBe(false);
  });

  it('像素/文字/形状图层在非「无」档都画', () => {
    for (const type of ['raster', 'text', 'shape'] as const) {
      expect(showsThumb(layer({ type }), 'small')).toBe(true);
      expect(showsThumb(layer({ type }), 'large')).toBe(true);
    }
  });
});
