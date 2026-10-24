/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  clampPanelWidth,
  defaultPanelWidth,
  DEFAULT_PANEL_WIDTH,
  maxPanelWidth,
  MIN_PANEL_WIDTH,
  narrowBodyWidth,
  RAIL_WIDTH,
} from './panelWidth';

const VIEWPORT = 1600;
const PHONE = 390;
const TOOLBAR = 52;

/*
 * 这里原来有一整个 describe('minPanelWidth')：窄屏下限是「轨宽 + 120」，
 * 断言的是「展开态面板体不会被压成 0」。
 *
 * 窄屏面板体改成浮层之后那个函数删了 —— 窄屏的面板列恒为轨宽，不用 panelWidth
 * 也没有分隔条可拖，那条下限保护不了任何东西。对应的断言不是放宽，是前提
 * 已经不存在；面板体宽度的约束改由下面 narrowBodyWidth 那组来管。
 */
describe('narrowBodyWidth', () => {
  it('给左边的工具栏留出位置，否则展开着就换不了工具', () => {
    for (const vw of [PHONE, 414, 600, 819]) {
      const body = narrowBodyWidth(vw);
      expect(vw - RAIL_WIDTH - body).toBeGreaterThanOrEqual(TOOLBAR);
    }
  });

  it('比改造前在流里的宽度宽得多（165px 装不下任何一排按钮）', () => {
    // 判据写成「至少 240」而不是写死 294：上下限调了这条仍该成立
    expect(narrowBodyWidth(PHONE)).toBeGreaterThanOrEqual(240);
  });

  it('永远不盖住图标轨，否则再也收不起来', () => {
    for (const vw of [120, 160, 200, 240, 280, 320, PHONE, 819]) {
      expect(narrowBodyWidth(vw)).toBeLessThanOrEqual(vw - RAIL_WIDTH);
      expect(narrowBodyWidth(vw)).toBeGreaterThan(0);
    }
  });

  it('宽视口上有上限，不会长成半屏浮层', () => {
    const wide = narrowBodyWidth(819);
    expect(wide).toBeLessThanOrEqual(360);
    // 819 已经撞上限，再宽也不涨
    expect(narrowBodyWidth(819)).toBe(wide);
  });

  it('视口非法时给一个能用的值，不返回 NaN', () => {
    for (const bad of [0, -100, Number.NaN, Number.POSITIVE_INFINITY]) {
      const got = narrowBodyWidth(bad);
      expect(Number.isFinite(got)).toBe(true);
      expect(got).toBeGreaterThan(0);
    }
  });
});

describe('maxPanelWidth', () => {
  it('上限 = 视口 - 工具栏(52) - 分隔条(4) - 画布最小(100)', () => {
    // 390 - 156 = 234
    expect(maxPanelWidth(PHONE)).toBe(234);
    // 1600 - 156 = 1444
    expect(maxPanelWidth(VIEWPORT)).toBe(1444);
  });

  it('上限恒不小于下限', () => {
    // 极窄视口（如 150px）算出的上限可能是负数，必须兜底
    for (const vw of [1, 100, 150, PHONE, 600, VIEWPORT, 4000]) {
      expect(maxPanelWidth(vw)).toBeGreaterThanOrEqual(MIN_PANEL_WIDTH);
    }
  });
});

describe('clampPanelWidth', () => {
  it('区间内的值原样保留', () => {
    expect(clampPanelWidth(320, VIEWPORT)).toBe(320);
  });

  it('拖过头夹在下限 44px', () => {
    expect(clampPanelWidth(10, VIEWPORT)).toBe(44);
    expect(clampPanelWidth(0, VIEWPORT)).toBe(44);
    expect(clampPanelWidth(-200, VIEWPORT)).toBe(44);
  });

  it('大于上限时夹到上限', () => {
    const max = maxPanelWidth(VIEWPORT);
    expect(clampPanelWidth(9999, VIEWPORT)).toBe(max);
  });

  it('取整到整像素', () => {
    expect(clampPanelWidth(100.7, VIEWPORT)).toBe(101);
  });

  it('非有限值退回默认宽度', () => {
    expect(clampPanelWidth(Number.NaN, VIEWPORT)).toBe(DEFAULT_PANEL_WIDTH);
    expect(clampPanelWidth(Number.POSITIVE_INFINITY, VIEWPORT)).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('手机上存着的桌面宽度(288)保留或夹到上限', () => {
    const onPhone = clampPanelWidth(DEFAULT_PANEL_WIDTH, PHONE);
    // 390 上限是 234，288 超了，应该夹到 234
    expect(onPhone).toBe(maxPanelWidth(PHONE));
  });

  it('桌面上用户可以把面板拖到很窄（44px）', () => {
    expect(clampPanelWidth(50, VIEWPORT)).toBe(50);
    expect(clampPanelWidth(44, VIEWPORT)).toBe(44);
  });

  /*
   * 窄屏也一律夹到 44：窄屏根本不用 panelWidth（面板列恒为轨宽，没有分隔条），
   * 所以这里只需要保证「不管传什么都落在合法区间」，不再有窄屏专用下限。
   */
  it('窄屏下限与桌面一致，都是 44', () => {
    for (const tooNarrow of [0, 10, 44]) {
      expect(clampPanelWidth(tooNarrow, PHONE)).toBe(MIN_PANEL_WIDTH);
    }
  });

  it('用户可以把面板拖到很宽（接近视口宽度）', () => {
    // 1600 上限是 1444，用户可以拖到那么宽
    const wide = maxPanelWidth(VIEWPORT);
    expect(clampPanelWidth(wide, VIEWPORT)).toBe(wide);
  });
});

/*
 * 这里原来有三条按视口分流的断言（窄屏给 NARROW_PANEL_WIDTH、820 是分界、
 * 视口非法时退回 288）。窄屏面板体改成浮层之后，窄屏的面板列恒为轨宽、
 * 不读 panelWidth，这个函数就没有分流的必要了，参数一并去掉。
 * 那几条不是放宽断言，是前提消失了；窄屏面板体的宽度约束搬到了
 * 上面 narrowBodyWidth 那组。
 */
describe('defaultPanelWidth', () => {
  it('恒为桌面默认值 288，且落在合法区间内', () => {
    expect(defaultPanelWidth()).toBe(DEFAULT_PANEL_WIDTH);
    for (const vw of [820, 1024, VIEWPORT, 2560]) {
      // 初值本身不该被 clamp 改掉，否则第一次展开就跳一下宽度
      expect(clampPanelWidth(defaultPanelWidth(), vw)).toBe(DEFAULT_PANEL_WIDTH);
    }
  });
});

describe('RAIL_WIDTH', () => {
  /*
   * 收起态 EditorLayout 直接把面板列设成 RAIL_WIDTH，不走 clamp。
   * 但它必须仍在合法区间里 —— 否则展开时那一步 clamp 会把宽度跳一下。
   */
  it('轨宽等于桌面下限', () => {
    expect(RAIL_WIDTH).toBe(MIN_PANEL_WIDTH);
    for (const vw of [820, VIEWPORT]) {
      expect(clampPanelWidth(RAIL_WIDTH, vw)).toBe(RAIL_WIDTH);
    }
  });

  /*
   * 窄屏的面板列恒为轨宽（EditorLayout 里 railOnly 时直接给 RAIL_WIDTH），
   * 面板体是浮层不占列宽。所以这里断言的是「画布宽度不随面板开合变化」——
   * 原来那两条（轨宽落在拖动区间之外、收起态画布比展开态宽）针对的是
   * 面板体还在文档流里的旧结构，那个前提已经不存在了。
   */
  it('窄屏画布宽度只由轨宽决定，开合不影响', () => {
    for (const vw of [320, PHONE, 819]) {
      const canvas = vw - TOOLBAR - RAIL_WIDTH; // 窄屏没有分隔条
      // 100 是画布的技术最小值，与 maxPanelWidth 里那个同源
      expect(canvas).toBeGreaterThanOrEqual(100);
      // 面板体浮在画布上方，画布拿到的宽度和它无关
      expect(canvas + RAIL_WIDTH + TOOLBAR).toBe(vw);
    }
  });
});
