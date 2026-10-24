/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import { Ellipsis } from 'lucide-react';
import styles from './Options.module.css';
import { useEditorStore } from '../../store';
import { findToolDef } from '../toolbar/toolDefs';
import { TOOL_OPTIONS } from './optionsDefs';
import BottomSheet from '../ui/BottomSheet';
import { useOverflowing } from '../../hooks/useOverflowing';
import { useT } from '../../hooks/useT';

/**
 * 工具选项栏。按当前工具渲染对应的参数组件，
 * 这里只做分发，具体参数由 optionsDefs 里的映射表决定。
 *
 * 装不下时在右端给一个「更多」，点开是同一套参数的竖排版
 * （**收进去不等于删掉**）。面板里那份和栏里那份是同一个组件、
 * 同一份 store 状态，两处改任意一个都立刻同步，不存在"移动版少几个参数"。
 *
 * 判据只有「这条栏装不下」，与视口宽度无关 —— 布局对所有设备是同一套，
 * 那这个入口也该按同一个条件出现。桌面正常宽度下装得下所以看不到它；
 * 窗口拖到很窄时会出现，那时候有个出口总比把参数挤没了好。
 */
export default function OptionsBar() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const def = findToolDef(activeTool);
  const Icon = def.icon;
  const Options = TOOL_OPTIONS[activeTool];
  const { ref, overflowing } = useOverflowing(activeTool);
  const [sheetOpen, setSheetOpen] = useState(false);
  const t = useT();

  /*
   * 只看装不装得下，不看视口宽度。
   *
   * 原来这里是 `!wide && overflowing` —— 布局分两套的时候宽屏永远不给这个入口。
   * 现在三栏是唯一布局，那就该按同一个条件判：桌面正常宽度装得下所以看不见它，
   * 窗口拖到很窄时它出现，这是对的。
   */
  const showMore = overflowing;

  return (
    <div className={styles.bar}>
      <span className={styles.toolName}>
        <Icon size={15} />
        {t(def.label)}
      </span>
      {/* 参数区自己滚动，「更多」按钮才能钉在右端不被推走 */}
      <div className={styles.scroller} ref={ref}>
        <Options />
      </div>
      {showMore ? (
        <button
          type="button"
          className={styles.moreButton}
          aria-label={t('mobile.moreOptions')}
          aria-haspopup="dialog"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          <Ellipsis size={18} />
        </button>
      ) : null}

      {sheetOpen ? (
        <BottomSheet title={`${t(def.label)} · ${t('mobile.options')}`} onClose={() => setSheetOpen(false)}>
          {/* 竖排：栏里是一行挤不下，面板里每个参数占一行，全都看得见 */}
          <div className={styles.optionsStack}>
            <Options />
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}
