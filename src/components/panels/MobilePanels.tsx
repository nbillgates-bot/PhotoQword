/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useRef, type CSSProperties } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import styles from './Panels.module.css';
import { PANEL_DEFS, findPanelDef } from './panelDefs';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { useElementRect } from '../../hooks/useElementRect';
import { narrowBodyWidth } from '../../engine/panelWidth';
import type { PanelTab } from '../../store/types';

/**
 * 窄屏（<820px）的面板区：一条 44px 图标轨 + 展开时浮在画布上的面板体。
 *
 * 五个面板**合并成一个区域**，靠图标轨切换，不再上下分栏 —— 窄屏上两个组
 * 各分一半高度，谁都不够用（规约第零节：窄屏允许重排布局，但功能一项不删。
 * 面板体渲染的是 panelDefs 里同一份 render()，与桌面完全同一个组件）。
 *
 * 两个状态，由 mobileIconMode 表达：
 * - 收起：只有图标轨
 * - 展开：图标轨 + 面板体浮层，一次显示一个面板
 *
 * **面板体浮在画布上，不占栅格宽度**（PS 的做法是面板与画布并排各占一块，
 * 390px 屏上两者都放不下 —— 在流里给面板 294px 画布只剩 40px，给画布 290px
 * 面板只剩 165px 而里面每排按钮都折三四行。所以退化成浮层：画布恒为 290px，
 * 面板要用时盖上来，点收起就让开）。宽度算法与理由见 engine/narrowBodyWidth。
 *
 * 轨顶那颗按钮两个方向都能走（这是之前缺的那一半：展开态没有回图标态的入口）。
 * 点当前面板的图标也能收起，与 PS 点已停靠面板的标签会收起同理。
 */

/** 图标顺序：图层、历史、属性、调整、导航。图层在最上，它是主工作区 */
const ICON_ORDER: readonly PanelTab[] = [
  'layers',
  'history',
  'properties',
  'adjust',
  'navigator',
];

/** 面板体的 id，给 aria-controls 用 */
const BODY_ID = 'mobile-panel-body';

export default function MobilePanels() {
  const iconMode = useEditorStore((state) => state.mobileIconMode);
  const activeTab = useEditorStore((state) => state.mobilePanelTab);
  const openPanel = useEditorStore((state) => state.openMobilePanel);
  const toggleIconMode = useEditorStore((state) => state.toggleMobileIconMode);
  const t = useT();

  const viewportWidth = useWindowWidth();
  const railRef = useRef<HTMLDivElement>(null);
  const railRect = useElementRect(railRef);

  const current = findPanelDef(activeTab);
  const collapsed = iconMode;

  /*
   * 浮层的坐标全部从图标轨量出来，一个数字都不写死。
   *
   * 轨的高度正好是面板区那一行的高度，左边缘正好是浮层该贴住的位置，所以
   * 「量轨」一次性解决了栅格行高（44+36/52+26）、触屏下选项栏变高、
   * 以及 #root 上那 1px 边框（Vite 模板遗留）三件事。抄数字进样式表的话，
   * 上游任何一处改动都会让浮层静默错位。
   *
   * 宽度反过来是算出来的：它不取决于任何已有元素，规则（留出工具栏、别盖住轨）
   * 写在 engine/narrowBodyWidth 里，那是纯函数、可单测。
   */
  const bodyStyle: CSSProperties | undefined = railRect
    ? {
        top: railRect.top,
        height: railRect.bottom - railRect.top,
        right: viewportWidth - railRect.left,
        width: narrowBodyWidth(viewportWidth),
      }
    : undefined;

  return (
    <div className={styles.mobilePanels}>
      {/*
        面板体。收起时整块不渲染，画布那一列就能拿到宽度。

        这里**不要**再套一层标题栏：每个面板自己的 sectionHeader 就已经写着标题
        （「历史记录 (3)」这种），外面再加一条就是同一个词显示两遍，还白占 32px
        —— 窄屏上竖向空间比横向更紧。标题的无障碍名用 aria-label 给，不占高度。
      */}
      {/* 量到轨的位置之后才渲染：没有坐标的 fixed 元素会先闪一帧在错的地方 */}
      {!collapsed && bodyStyle && (
        <div
          className={styles.mobileBody}
          id={BODY_ID}
          role="tabpanel"
          aria-label={t(current.label)}
          style={bodyStyle}
        >
          {current.render()}
        </div>
      )}

      {/* 图标轨。始终在最右，收起与展开时图标位置不动；同时是浮层的定位锚点 */}
      <div className={styles.mobileRail} ref={railRef}>
        <button
          type="button"
          className={styles.railToggle}
          onClick={toggleIconMode}
          aria-label={t(collapsed ? 'panel.expandFromIcons' : 'panel.collapseToIcons')}
          title={t(collapsed ? 'panel.expandFromIcons' : 'panel.collapseToIcons')}
          aria-expanded={!collapsed}
        >
          {collapsed ? <PanelRightOpen size={20} /> : <PanelRightClose size={20} />}
        </button>

        <div className={styles.railList} role="tablist" aria-label={t('panel.group')}>
          {ICON_ORDER.map((tab) => {
            const def = PANEL_DEFS.find((d) => d.tab === tab);
            if (!def) return null;
            const Icon = def.icon;
            // 收起态没有面板显示，所以一个 tab 都不算选中
            const selected = !collapsed && activeTab === tab;

            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={BODY_ID}
                className={selected ? styles.railIconActive : styles.railIcon}
                // 点当前面板 = 收起；点别的 = 切到它并展开
                onClick={() => (selected ? toggleIconMode() : openPanel(tab))}
                aria-label={t(def.label)}
                title={t(def.label)}
              >
                <Icon size={20} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
