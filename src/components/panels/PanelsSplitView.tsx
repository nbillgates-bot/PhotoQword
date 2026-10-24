/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import DockGroup from './DockGroup';
import GroupSplitter from './GroupSplitter';
import { useEditorStore } from '../../store';
import { PANEL_DEFS } from './panelDefs';
import { useT } from '../../hooks/useT';

/**
 * 面板的上下分栏视图。桌面端一直用这个，手机端切到 PC 模式时也用这个。
 *
 * 上半区（历史组）：历史、属性、调整、导航
 * 下半区（图层组）：图层（未来扩展通道/路径）
 *
 * 中间是可拖动的水平分隔条，默认比例 30/70（历史组占 30%）。
 */
export default function PanelsSplitView() {
  const t = useT();
  const upperTab = useEditorStore((state) => state.upperPanelTab);
  const lowerTab = useEditorStore((state) => state.lowerPanelTab);
  const setUpperTab = useEditorStore((state) => state.setUpperPanelTab);
  const setLowerTab = useEditorStore((state) => state.setLowerPanelTab);
  const ratio = useEditorStore((state) => state.historyGroupRatio);

  // 上组：历史/属性/调整/导航
  const upperTabs = PANEL_DEFS.filter((d) =>
    ['history', 'properties', 'adjust', 'navigator'].includes(d.tab),
  ).map((d) => d.tab);

  // 下组：图层（未来扩展 channels/paths）
  const lowerTabs = PANEL_DEFS.filter((d) => d.tab === 'layers').map((d) => d.tab);

  return (
    <div
      className={styles.splitView}
      style={
        {
          '--history-ratio': ratio,
          '--layers-ratio': 1 - ratio,
        } as React.CSSProperties
      }
    >
      <DockGroup
        tabs={upperTabs}
        active={upperTab}
        onChange={(tab) => setUpperTab(tab as typeof upperTab)}
        label={t('panel.historyGroup')}
      />
      <GroupSplitter />
      <DockGroup
        tabs={lowerTabs}
        active={lowerTab}
        onChange={(tab) => setLowerTab(tab as typeof lowerTab)}
        label={t('panel.layersGroup')}
      />
    </div>
  );
}
