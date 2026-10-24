/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { flyoutHeight, placeAbove, placeRight } from './flyoutPlacement';

/** 竖向工具栏上一个按钮的典型位置：贴左边缘，纵向居中偏上 */
const sideButton = { left: 8, right: 52, top: 200, bottom: 244 };
/** 底部工具条上一个按钮：贴底边 */
const dockButton = { left: 120, right: 164, top: 700, bottom: 744 };
const flyout = { width: 176, height: 128 };
const viewport = { width: 400, height: 800 };

describe('placeRight', () => {
  it('落在按钮右侧，顶边与按钮对齐', () => {
    const pos = placeRight({ button: sideButton, flyout, viewport });
    expect(pos.left).toBeGreaterThanOrEqual(sideButton.right);
    expect(pos.top).toBe(sideButton.top);
  });

  it('按钮靠下时整体上移，不越过视口底边', () => {
    const low = { left: 8, right: 52, top: 760, bottom: 800 };
    const pos = placeRight({ button: low, flyout, viewport });
    expect(pos.top + flyout.height).toBeLessThanOrEqual(viewport.height);
  });

  it('弹出层比视口还宽时贴边而不是给出负坐标', () => {
    const huge = { width: 999, height: 128 };
    const pos = placeRight({ button: sideButton, flyout: huge, viewport });
    expect(pos.left).toBeGreaterThan(0);
  });
});

describe('placeAbove', () => {
  it('整个浮层落在按钮上方，不盖住按钮本身', () => {
    const pos = placeAbove({ button: dockButton, flyout, viewport });
    // 关键点：底部工具条上手指就压在按钮上，浮层盖住按钮等于看不见自己点了什么
    expect(pos.top + flyout.height).toBeLessThanOrEqual(dockButton.top);
  });

  it('左缘与按钮对齐', () => {
    const pos = placeAbove({ button: dockButton, flyout, viewport });
    expect(pos.left).toBe(dockButton.left);
  });

  it('按钮靠右时往左收，不越过视口右边缘', () => {
    const right = { left: 360, right: 396, top: 700, bottom: 744 };
    const pos = placeAbove({ button: right, flyout, viewport });
    expect(pos.left + flyout.width).toBeLessThanOrEqual(viewport.width);
  });

  it('浮层比按钮上方的空间还高时夹在顶部，不给出负坐标', () => {
    const tall = { width: 176, height: 999 };
    const pos = placeAbove({ button: dockButton, flyout: tall, viewport });
    expect(pos.top).toBeGreaterThan(0);
  });

  it('两种落位都不产生 NaN', () => {
    for (const place of [placeRight, placeAbove]) {
      const pos = place({ button: dockButton, flyout, viewport });
      expect(Number.isNaN(pos.left)).toBe(false);
      expect(Number.isNaN(pos.top)).toBe(false);
    }
  });
});

describe('flyoutHeight', () => {
  it('行数越多越高，且含内边距', () => {
    expect(flyoutHeight(3, 30)).toBe(98);
    expect(flyoutHeight(3, 40)).toBeGreaterThan(flyoutHeight(3, 30));
  });

  it('0 行也给出非负高度', () => {
    expect(flyoutHeight(0, 30)).toBeGreaterThanOrEqual(0);
    expect(flyoutHeight(-5, 30)).toBeGreaterThanOrEqual(0);
  });
});

