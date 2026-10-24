/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Guide } from '../types';
import { guideAtPoint, guideOutsideDoc, remapGuidesAfterCrop } from './guides';

const guide = (id: string, orientation: 'h' | 'v', position: number): Guide => ({
  id,
  orientation,
  position,
});

describe('guideOutsideDoc', () => {
  const doc = { width: 200, height: 100 };

  it('水平线按高度判定，垂直线按宽度判定', () => {
    expect(guideOutsideDoc('h', 150, doc)).toBe(true);
    expect(guideOutsideDoc('v', 150, doc)).toBe(false);
  });

  it('负数一律算在外面（拖回标尺就是这种情形）', () => {
    expect(guideOutsideDoc('h', -1, doc)).toBe(true);
    expect(guideOutsideDoc('v', -1, doc)).toBe(true);
  });

  it('贴边不算在外面', () => {
    expect(guideOutsideDoc('h', 0, doc)).toBe(false);
    expect(guideOutsideDoc('h', 100, doc)).toBe(false);
    expect(guideOutsideDoc('v', 200, doc)).toBe(false);
  });
});

describe('remapGuidesAfterCrop', () => {
  const rect = { x: 40, y: 30, width: 100, height: 60 };

  it('参考线跟着新原点平移', () => {
    const out = remapGuidesAfterCrop([guide('a', 'v', 60), guide('b', 'h', 50)], rect);
    expect(out.map((g) => g.position)).toEqual([20, 20]);
  });

  it('压在裁剪框边上的线落到新文档的边缘', () => {
    const out = remapGuidesAfterCrop(
      [guide('left', 'v', 40), guide('right', 'v', 140), guide('top', 'h', 30)],
      rect,
    );
    expect(out.map((g) => [g.id, g.position])).toEqual([
      ['left', 0],
      ['right', 100],
      ['top', 0],
    ]);
  });

  it('落在裁掉区域里的线被丢弃', () => {
    const out = remapGuidesAfterCrop(
      [guide('before', 'v', 10), guide('after', 'v', 200), guide('keep', 'v', 100)],
      rect,
    );
    expect(out.map((g) => g.id)).toEqual(['keep']);
  });

  it('水平线只看 y，垂直线只看 x', () => {
    // x 方向能留下的位置，放到 y 方向就超界了（rect 高 60，宽 100）
    const out = remapGuidesAfterCrop([guide('v', 'v', 130), guide('h', 'h', 120)], rect);
    expect(out.map((g) => g.id)).toEqual(['v']);
  });

  it('id 与方向保持不变', () => {
    const out = remapGuidesAfterCrop([guide('a', 'h', 50)], rect);
    expect(out[0]).toEqual({ id: 'a', orientation: 'h', position: 20 });
  });

  it('原点不动的裁剪不改变位置', () => {
    const guides = [guide('a', 'v', 10), guide('b', 'h', 20)];
    const out = remapGuidesAfterCrop(guides, { x: 0, y: 0, width: 100, height: 100 });
    expect(out).toEqual(guides);
  });

  it('空列表返回空列表', () => {
    expect(remapGuidesAfterCrop([], rect)).toEqual([]);
  });

  it('不修改传入的数组', () => {
    const guides = [guide('a', 'v', 60)];
    remapGuidesAfterCrop(guides, rect);
    expect(guides[0].position).toBe(60);
  });
});

describe('guideAtPoint', () => {
  const guides = [guide('a', 'v', 50), guide('b', 'h', 80)];

  it('压在线上时命中', () => {
    expect(guideAtPoint(guides, { x: 50, y: 10 }, 1)?.id).toBe('a');
    expect(guideAtPoint(guides, { x: 10, y: 80 }, 1)?.id).toBe('b');
  });

  it('容差内命中，容差外不命中', () => {
    expect(guideAtPoint(guides, { x: 53, y: 10 }, 1)?.id).toBe('a');
    expect(guideAtPoint(guides, { x: 60, y: 10 }, 1)).toBeNull();
  });

  it('容差按屏幕像素折算：放大后文档坐标上的容差变小', () => {
    // zoom=4 时 4 屏幕像素只等于 1 文档像素，偏 3 文档像素就抓不到了
    expect(guideAtPoint(guides, { x: 51, y: 10 }, 4)?.id).toBe('a');
    expect(guideAtPoint(guides, { x: 53, y: 10 }, 4)).toBeNull();
  });

  it('缩小后容差在文档坐标上放大', () => {
    // zoom=0.25 时 4 屏幕像素等于 16 文档像素
    expect(guideAtPoint(guides, { x: 62, y: 10 }, 0.25)?.id).toBe('a');
  });

  it('空列表返回 null', () => {
    expect(guideAtPoint([], { x: 0, y: 0 }, 1)).toBeNull();
  });

  it('重合时返回最后一条（画在最上面的那条）', () => {
    const stacked = [guide('under', 'v', 50), guide('over', 'v', 50)];
    expect(guideAtPoint(stacked, { x: 50, y: 0 }, 1)?.id).toBe('over');
  });
});
