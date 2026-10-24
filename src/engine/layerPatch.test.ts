/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { touchesPixels } from './layerPatch';
import { createCanvas } from './canvasUtils';

describe('touchesPixels', () => {
  it('空 patch 什么都没改', () => {
    expect(touchesPixels({})).toBe(false);
  });

  it('可见性、不透明度、混合模式、名字、锁都不影响缩略图', () => {
    expect(touchesPixels({ visible: false })).toBe(false);
    expect(touchesPixels({ opacity: 30 })).toBe(false);
    expect(touchesPixels({ blendMode: 'multiply' })).toBe(false);
    expect(touchesPixels({ name: '改名' })).toBe(false);
    expect(touchesPixels({ locked: true })).toBe(false);
    expect(touchesPixels({ lockTransparent: true })).toBe(false);
    expect(touchesPixels({ clipped: true })).toBe(false);
    expect(touchesPixels({ collapsed: true })).toBe(false);
    expect(touchesPixels({ parentId: 'g' })).toBe(false);
    expect(touchesPixels({ color: '#f00' })).toBe(false);
  });

  it('换画布、换蒙版都影响', () => {
    expect(touchesPixels({ canvas: createCanvas(2, 2) })).toBe(true);
    expect(touchesPixels({ mask: createCanvas(2, 2) })).toBe(true);
  });

  /*
   * bounds 变了缩略图也要重画：「图层边界」这一档是按 bounds 取景的，
   * 「整个文档」这一档更是要靠 bounds 定位。
   */
  it('改 bounds 影响', () => {
    expect(touchesPixels({ bounds: { x: 1, y: 1, width: 2, height: 2 } })).toBe(true);
  });

  it('没登记的字段一律按「影响」处理，宁可多刷也不能留旧图', () => {
    expect(touchesPixels({ effects: {} })).toBe(true);
    expect(touchesPixels({ maskEnabled: false })).toBe(true);
  });

  it('混了一个不安全字段就算影响', () => {
    expect(touchesPixels({ visible: false, canvas: createCanvas(2, 2) })).toBe(true);
  });
});
