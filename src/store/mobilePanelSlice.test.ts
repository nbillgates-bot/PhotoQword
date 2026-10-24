/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';

/**
 * 窄屏面板区的状态机。
 *
 * 只有两个字段，但它们的组合语义容易写错：收起/展开由 mobileIconMode 表达，
 * 「是哪一个面板」由 mobilePanelTab 表达，两者正交。上一版把这两件事挤进
 * 一个可空字段（mobileActivePanel: PanelTab | null），于是「收起」会把
 * 「刚才看的是哪个面板」一起丢掉 —— 再展开时跳回默认面板，不是用户离开时那个。
 */
describe('窄屏面板收起与展开', () => {
  beforeEach(() => {
    // 回到初始态：收起 + 图层
    const state = useEditorStore.getState();
    if (!state.mobileIconMode) state.toggleMobileIconMode();
    useEditorStore.getState().openMobilePanel('layers');
    useEditorStore.getState().toggleMobileIconMode();
  });

  it('初始是收起态，且已选中图层面板', () => {
    expect(useEditorStore.getState().mobileIconMode).toBe(true);
    expect(useEditorStore.getState().mobilePanelTab).toBe('layers');
  });

  it('openMobilePanel 同时选中面板并展开', () => {
    useEditorStore.getState().openMobilePanel('history');
    expect(useEditorStore.getState().mobilePanelTab).toBe('history');
    expect(useEditorStore.getState().mobileIconMode).toBe(false);
  });

  it('展开态下换面板不会把它收起来', () => {
    useEditorStore.getState().openMobilePanel('history');
    useEditorStore.getState().openMobilePanel('adjust');
    expect(useEditorStore.getState().mobilePanelTab).toBe('adjust');
    expect(useEditorStore.getState().mobileIconMode).toBe(false);
  });

  it('收起再展开，回到离开时那个面板而不是默认面板', () => {
    useEditorStore.getState().openMobilePanel('navigator');
    useEditorStore.getState().toggleMobileIconMode(); // 收起
    expect(useEditorStore.getState().mobileIconMode).toBe(true);
    // 收起不该丢掉「看的是哪一个」
    expect(useEditorStore.getState().mobilePanelTab).toBe('navigator');

    useEditorStore.getState().toggleMobileIconMode(); // 再展开
    expect(useEditorStore.getState().mobileIconMode).toBe(false);
    expect(useEditorStore.getState().mobilePanelTab).toBe('navigator');
  });

  it('toggleMobileIconMode 两次回到原状态', () => {
    const before = useEditorStore.getState().mobileIconMode;
    useEditorStore.getState().toggleMobileIconMode();
    useEditorStore.getState().toggleMobileIconMode();
    expect(useEditorStore.getState().mobileIconMode).toBe(before);
  });

  /*
   * tab 永远不为 null。组件按它取 render()，为 null 就得在渲染层
   * 兜一次空判断 —— 那种兜底最后总会漏一处，不如让类型上就不可能。
   */
  it('任何操作之后 tab 都是一个真实面板', () => {
    const tabs = ['properties', 'adjust', 'navigator', 'layers', 'history'] as const;
    for (const tab of tabs) {
      useEditorStore.getState().openMobilePanel(tab);
      useEditorStore.getState().toggleMobileIconMode();
      expect(useEditorStore.getState().mobilePanelTab).toBe(tab);
    }
  });

  /*
   * 收起态不影响桌面那两个字段。窄屏与宽屏共用同一个 store，
   * 在手机上点收起之后把窗口拉宽，桌面的上下分栏必须还是原来那两个标签。
   */
  it('不动桌面的上下分栏标签', () => {
    const upper = useEditorStore.getState().upperPanelTab;
    const lower = useEditorStore.getState().lowerPanelTab;
    useEditorStore.getState().openMobilePanel('adjust');
    useEditorStore.getState().toggleMobileIconMode();
    expect(useEditorStore.getState().upperPanelTab).toBe(upper);
    expect(useEditorStore.getState().lowerPanelTab).toBe(lower);
  });
});
