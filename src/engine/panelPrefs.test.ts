/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readPanelWidth, storePanelWidth } from './panelPrefs';
import { DEFAULT_PANEL_WIDTH, maxPanelWidth, MIN_PANEL_WIDTH } from './panelWidth';

const VIEWPORT = 1600;
const PHONE = 390;

beforeEach(() => {
  localStorage.clear();
});

describe('readPanelWidth', () => {
  it('没存过时给默认值', () => {
    expect(readPanelWidth(VIEWPORT)).toBe(DEFAULT_PANEL_WIDTH);
  });

  /*
   * 这两条原来断言「窄屏没存过时给 NARROW_PANEL_WIDTH（210）而不是 288」。
   *
   * 那个分档是为了防止 288 被 clamp 到 234 后把画布压到 100px。窄屏面板体改成
   * 浮层之后，窄屏的面板列恒为轨宽、根本不读 panelWidth，分档反而有害：手机上
   * 打开一次就把存着的桌面宽度改写成 210。所以初值不再分档 —— 断言跟着改成
   * 「窄屏也给 288」，测的是「不因视口而改写用户存的桌面偏好」。
   */
  it('窄屏没存过时也给桌面默认值，不再按视口分档', () => {
    expect(readPanelWidth(PHONE)).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('窄屏存坏了当没存过', () => {
    localStorage.setItem('qword.panelWidth', '不是数字');
    expect(readPanelWidth(PHONE)).toBe(DEFAULT_PANEL_WIDTH);
  });

  /*
   * 已经在窄屏上调过宽度的人，读回来必须是他调的那个值，
   * 不能被「窄屏初值」盖掉 —— 初值只在没存过时生效。
   */
  it('窄屏上存过的宽度优先于默认值', () => {
    // 取 180：在窄屏合法区间（44 ~ 234）内，不会被夹，测到的才是「存过的优先」
    storePanelWidth(180);
    expect(readPanelWidth(PHONE)).toBe(180);
  });

  /*
   * 这条原来是「低于窄屏下限（轨宽 + 120）的值被拉回下限」。窄屏专用下限删了，
   * 60 现在是合法值（下限恒为 44），所以断言改成「照读不改」——
   * 前提变了，不是把断言放宽。真正的下限保护由下面那条负数用例守着。
   */
  it('窄屏上存着的窄值照读，不再被窄屏下限拉回', () => {
    storePanelWidth(60);
    expect(readPanelWidth(PHONE)).toBe(60);
  });

  it('存过的宽度能读回来', () => {
    storePanelWidth(360);
    expect(readPanelWidth(VIEWPORT)).toBe(360);
  });

  /*
   * 上次在宽屏存的宽度，换到窄屏必须重新夹：
   * 不夹的话面板会把画布挤掉大半，而用户没做过任何操作。
   *
   * 存 800 在 1600 上限内（1444），但在 800 上限外（644）。
   */
  it('按当前视口重新夹宽度', () => {
    storePanelWidth(800);
    expect(readPanelWidth(800)).toBe(maxPanelWidth(800));
  });

  it('存坏了当没存过', () => {
    localStorage.setItem('qword.panelWidth', '不是数字');
    expect(readPanelWidth(VIEWPORT)).toBe(DEFAULT_PANEL_WIDTH);
  });

  it('存了负数也要夹回合法区间', () => {
    localStorage.setItem('qword.panelWidth', '-100');
    expect(readPanelWidth(VIEWPORT)).toBe(MIN_PANEL_WIDTH);
  });
});

/*
 * 隐私模式下 localStorage 的存取会直接抛异常。
 * 不兜住的话整个界面起不来 —— 这不是「记不住宽度」，是白屏。
 */
describe('localStorage 不可用时', () => {
  it('读不出来也能给出默认值，不抛异常', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('拒绝访问');
    });
    expect(() => readPanelWidth(VIEWPORT)).not.toThrow();
    expect(readPanelWidth(VIEWPORT)).toBe(DEFAULT_PANEL_WIDTH);
    vi.restoreAllMocks();
  });

  it('存不进去也不抛异常', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('配额用尽');
    });
    expect(() => storePanelWidth(320)).not.toThrow();
    vi.restoreAllMocks();
  });
});
