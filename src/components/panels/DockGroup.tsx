/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import { findPanelDef } from './panelDefs';
import type { PanelTab } from '../../store/types';
import { useT } from '../../hooks/useT';

interface DockGroupProps {
  /** 这一组里有哪些面板标签 */
  tabs: readonly PanelTab[];
  /** 当前选中的标签 */
  active: PanelTab;
  onChange: (tab: PanelTab) => void;
  /** 无障碍名称的词条 key */
  label: string;
}

/**
 * PS 风格的停靠组：一排标签 + 内容区。
 *
 * 两个 DockGroup 上下排列（中间夹 GroupSplitter）就得到 PS 右侧那种分区面板栏。
 * 高度由父容器的 grid-template-rows 控制（见 PanelsSplitView），
 * 所以这里不再需要 grow / collapsed —— 拖分隔条就是调高度，不需要"折叠"那一档。
 *
 * 面板清单在 panelDefs，这里只做渲染与标签切换。
 */
export default function DockGroup({ tabs, active, onChange, label }: DockGroupProps) {
  const t = useT();
  const current = findPanelDef(active);

  return (
    <section className={styles.dockGroup} aria-label={t(label)}>
      <div className={styles.dockTabs} role="tablist" aria-label={t(label)}>
        {tabs.map((tab) => {
          const def = findPanelDef(tab);
          const Icon = def.icon;
          const isActive = tab === active;

          return (
            <button
              type="button"
              key={tab}
              role="tab"
              aria-selected={isActive}
              title={t(def.label)}
              className={`${styles.dockTab} ${isActive ? styles.dockTabActive : ''}`}
              onClick={() => onChange(tab)}
            >
              <Icon size={13} />
              <span>{t(def.label)}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.dockBody} role="tabpanel">
        {current.render()}
      </div>
    </section>
  );
}
