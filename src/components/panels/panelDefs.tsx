/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Compass, History, Layers, Settings2, SlidersHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import LayersPanel from './LayersPanel';
import HistoryPanel from './HistoryPanel';
import AdjustPanel from './AdjustPanel';
import NavigatorPanel from './NavigatorPanel';
import PropertiesPanel from './PropertiesPanel';
import type { PanelTab } from '../../store/types';

/**
 * 面板清单：一处数据定义，由 Panels 的上下停靠组消费（对齐 PS）。
 *
 * 手机与桌面走的是**同一套**三栏布局，只有尺寸不同，所以这里也只有一份
 * render() —— 想让某个面板在手机上"简化版"是做不到的，这是有意的
 * （规约第零节：布局可以重排，功能不许删）。
 *
 * 与 TOOL_GROUPS / MENUS / FILTERS 是同一个模式：数据定义 + 通用渲染器。
 */

export interface PanelDef {
  tab: PanelTab;
  /** 词条 key，由消费方调 t() 取当前语言 */
  label: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
}

/** 全部面板。顺序与 PS 右侧面板栏自上而下一致 */
export const PANEL_DEFS: readonly PanelDef[] = [
  { tab: 'properties', label: 'panel.properties', icon: Settings2, render: () => <PropertiesPanel /> },
  { tab: 'adjust', label: 'panel.adjust', icon: SlidersHorizontal, render: () => <AdjustPanel /> },
  { tab: 'navigator', label: 'panel.navigator', icon: Compass, render: () => <NavigatorPanel /> },
  { tab: 'layers', label: 'panel.layers', icon: Layers, render: () => <LayersPanel /> },
  { tab: 'history', label: 'panel.history', icon: History, render: () => <HistoryPanel /> },
];

function panelsByTabs(tabs: readonly PanelTab[]): PanelDef[] {
  return tabs.map((tab) => PANEL_DEFS.find((panel) => panel.tab === tab)!);
}

/** 宽屏上停靠组：属性/调整/导航，按需切换 */
export const TOP_PANELS = panelsByTabs(['properties', 'adjust', 'navigator']);

/** 宽屏下停靠组：图层常驻，和 PS 一样是最主要的工作区 */
export const BOTTOM_PANELS = panelsByTabs(['layers', 'history']);

/** 按 tab 取面板，取不到回落到图层（抽屉里存了个已删掉的 tab 时不该白屏） */
export function findPanelDef(tab: PanelTab): PanelDef {
  return PANEL_DEFS.find((panel) => panel.tab === tab) ?? PANEL_DEFS[3];
}
