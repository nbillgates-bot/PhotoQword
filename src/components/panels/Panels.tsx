/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import PanelsSplitView from './PanelsSplitView';
import MobilePanels from './MobilePanels';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { WIDE_LAYOUT_QUERY } from '../../engine/inputCapability';

/**
 * 右侧面板栏。
 *
 * 宽屏（≥820px）：上下分栏（历史组 / 图层组），与 PS 一致。
 * 窄屏（<820px）：五个面板合并成一个区域 + 44px 图标轨，见 MobilePanels。
 *
 * 断点走 WIDE_LAYOUT_QUERY 而不是写死字符串：css 里的覆盖块用的是同一个 820，
 * 两边必须是同一条查询，否则会出现「渲染了窄屏结构但样式按宽屏算」这类错位。
 *
 * 面板清单在 panelDefs，两条分支消费的是同一份 render()。
 */
export default function Panels() {
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);

  return (
    <div className={styles.panels}>{isWide ? <PanelsSplitView /> : <MobilePanels />}</div>
  );
}
