/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect } from 'vitest';
import {
  buildSnapContext,
  snapPoint,
  snapRectTranslate,
  SNAP_TOLERANCE,
  GRID_SPACING,
} from './snapping';
import type { Guide } from '../types';

describe('snapping', () => {
  const zoom = 1;

  describe('buildSnapContext', () => {
    it('disabled 为 true 时返回 null', () => {
      expect(
        buildSnapContext({
          guides: [],
          showGuides: false,
          showGrid: true,
          zoom,
          disabled: true,
        }),
      ).toBeNull();
    });

    it('没有任何吸附目标时返回 null', () => {
      expect(
        buildSnapContext({
          guides: [],
          showGuides: false,
          showGrid: false,
          zoom,
        }),
      ).toBeNull();
    });

    it('网格可见时设置 grid 间距', () => {
      const ctx = buildSnapContext({
        guides: [],
        showGuides: false,
        showGrid: true,
        zoom,
      });
      expect(ctx?.grid).toBe(GRID_SPACING);
    });

    it('网格不可见时 grid 为 0', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 50 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom,
      });
      expect(ctx?.grid).toBe(0);
    });

    it('参考线可见时加入 x 和 y 候选', () => {
      const guides: Guide[] = [
        { id: '1', orientation: 'v', position: 50 },
        { id: '2', orientation: 'h', position: 30 },
      ];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom,
      });
      expect(ctx?.x).toContain(50);
      expect(ctx?.y).toContain(30);
    });

    it('参考线不可见时不加入 x 和 y', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 50 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: false,
        showGrid: true,
        zoom,
      });
      // 参考线不可见，x 应该为空
      expect(ctx?.x).toEqual([]);
    });

    it('按 zoom 折算容差', () => {
      const ctx = buildSnapContext({
        guides: [],
        showGuides: false,
        showGrid: true,
        zoom: 2,
      });
      expect(ctx?.slack).toBe(SNAP_TOLERANCE / 2);
    });
  });

  describe('snapPoint', () => {
    it('吸附到参考线', () => {
      const guides: Guide[] = [
        { id: '1', orientation: 'v', position: 100 },
        { id: '2', orientation: 'h', position: 50 },
      ];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      // 距离参考线 3px，在阈值内
      const snapped = snapPoint({ x: 97, y: 52 }, ctx);
      expect(snapped).toEqual({ x: 100, y: 50 });
    });

    it('超出阈值不吸附', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 100 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      // 距离 10px，超出默认阈值 8px
      const point = { x: 110, y: 50 };
      const snapped = snapPoint(point, ctx);
      expect(snapped.x).not.toBe(100);
    });

    it('吸附到网格线', () => {
      const ctx = buildSnapContext({
        guides: [],
        showGuides: false,
        showGrid: true,
        zoom: 1,
      })!;
      // GRID_SPACING = 20，22 距离 20 只有 2px
      const snapped = snapPoint({ x: 22, y: 42 }, ctx);
      expect(snapped).toEqual({ x: 20, y: 40 });
    });

    it('参考线优先于网格', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 50 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: true,
        zoom: 1,
      })!;
      // 51 距离参考线 50 只有 1px，距离网格线 40/60 都是 9px 以上
      const snapped = snapPoint({ x: 51, y: 10 }, ctx);
      expect(snapped.x).toBe(50);
    });

    it('放大后容差跟着缩小，手感与缩放无关', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 100 }];
      const args = { guides, showGuides: true, showGrid: false };
      // 100% 时差 6px 在容差内
      expect(snapPoint({ x: 94, y: 0 }, buildSnapContext({ ...args, zoom: 1 })!).x).toBe(100);
      // 400% 时容差只剩 2 文档像素，同样的 6px 够不着
      expect(snapPoint({ x: 94, y: 0 }, buildSnapContext({ ...args, zoom: 4 })!).x).toBe(94);
    });

    it('吸附结果没有 NaN', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'h', position: 0 }];
      const ctx = buildSnapContext({ guides, showGuides: true, showGrid: true, zoom: 1 })!;
      const snapped = snapPoint({ x: 0.5, y: 0.5 }, ctx);
      expect(Number.isNaN(snapped.x)).toBe(false);
      expect(Number.isNaN(snapped.y)).toBe(false);
    });
  });

  describe('snapRectTranslate', () => {
    it('平移矩形贴近参考线', () => {
      const guides: Guide[] = [
        { id: '1', orientation: 'v', position: 100 },
      ];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      // 矩形左边 50，右边 150，离参考线 100 最近的是右边（距离 50）
      // 但超出阈值所以不吸附
      const rect = { x: 50, y: 50, width: 100, height: 100 };
      const snapped = snapRectTranslate(rect, ctx);
      // 超出阈值，不吸附
      expect(snapped).toEqual(rect);
    });

    it('吸附矩形右边到参考线', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 100 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      // 右边 103，距离参考线 100 只有 3px
      const rect = { x: 13, y: 50, width: 90, height: 100 };
      const snapped = snapRectTranslate(rect, ctx);
      // 右边吸到 100，左边变成 10
      expect(snapped.x).toBe(10);
      expect(snapped.width).toBe(90);
    });

    it('保持尺寸不变', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'h', position: 50 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      const rect = { x: 100, y: 48, width: 80, height: 60 };
      const snapped = snapRectTranslate(rect, ctx);
      expect(snapped.width).toBe(80);
      expect(snapped.height).toBe(60);
    });

    it('两条边都够不着参考线时原样返回', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 300 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      const rect = { x: 55, y: 55, width: 80, height: 60 };
      expect(snapRectTranslate(rect, ctx)).toEqual(rect);
    });

    it('一条边够不着不会挡住另一条边吸附', () => {
      // 左边 13 离参考线 100 有 87px，够不着；右边 103 只差 3px，应该吸上
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 100 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      const snapped = snapRectTranslate({ x: 13, y: 50, width: 90, height: 100 }, ctx);
      expect(snapped.x).toBe(10);
      expect(snapped.x + snapped.width).toBe(100);
    });

    it('边已经压在参考线上时不动', () => {
      const guides: Guide[] = [{ id: '1', orientation: 'v', position: 100 }];
      const ctx = buildSnapContext({
        guides,
        showGuides: true,
        showGrid: false,
        zoom: 1,
      })!;
      const rect = { x: 100, y: 50, width: 40, height: 40 };
      expect(snapRectTranslate(rect, ctx)).toEqual(rect);
    });
  });
});
