/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useState } from 'react';
import { ArrowLeftRight, RotateCcw } from 'lucide-react';
import styles from './Toolbar.module.css';
import { TOOL_GROUPS, findToolDef, type ToolDef } from './toolDefs';
import ToolGroupButton from './ToolGroupButton';
import ColorPicker from '../ui/ColorPicker';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import type { ToolId } from '../../types';
import { useT } from '../../hooks/useT';
import { useForegroundSink } from '../../hooks/useTextColorSink';

/** 每组默认显示的工具（初始为组内第一个） */
function initialDisplay(): Record<string, ToolId> {
  return TOOL_GROUPS.reduce<Record<string, ToolId>>((map, group) => {
    map[group[0].group] = group[0].id;
    return map;
  }, {});
}

export default function Toolbar() {
  const activeTool = useEditorStore((state) => state.activeTool);
  const setTool = useEditorStore((state) => state.setTool);
  const foreground = useEditorStore((state) => state.foreground);
  const background = useEditorStore((state) => state.background);
  const setBackground = useEditorStore((state) => state.setBackground);
  const swapColors = useEditorStore((state) => state.swapColors);
  const resetColors = useEditorStore((state) => state.resetColors);
  const setForegroundAndText = useForegroundSink();
  const t = useT();

  // 记住每组内最近一次选择，切回该组时保持
  const [display, setDisplay] = useState<Record<string, ToolId>>(initialDisplay);

  const handleSelect = (id: ToolId) => {
    const def = findToolDef(id);
    setDisplay((prev) => ({ ...prev, [def.group]: id }));
    setTool(id);
  };

  const displayFor = (group: ToolDef[]): ToolDef => {
    const id = display[group[0].group] ?? group[0].id;
    return group.find((tool) => tool.id === id) ?? group[0];
  };

  // 工具被外部（快捷键、菜单）切换时，同步该组的显示图标
  useEffect(() => {
    const def = findToolDef(activeTool);
    setDisplay((prev) => (prev[def.group] === activeTool ? prev : { ...prev, [def.group]: activeTool }));
  }, [activeTool]);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label={t('toolbar.label')}>
      {TOOL_GROUPS.map((group, index) => (
        <div key={group[0].group} style={{ display: 'contents' }}>
          <ToolGroupButton
            group={group}
            activeTool={activeTool}
            displayTool={displayFor(group)}
            onSelect={handleSelect}
          />
          {/* 在功能类别之间插入分隔线 */}
          {[3, 6, 8, 9].includes(index) ? <span className={styles.divider} /> : null}
        </div>
      ))}

      <div className={styles.colors}>
        <div className={styles.colorPair}>
          <span className={styles.fgSlot}>
            {/* 编辑文字时改前景色会同时染文字，逻辑在 useForegroundSink */}
            <ColorPicker
              color={foreground}
              label={t('toolbar.foreground')}
              size={22}
              keepTextEdit
              onChange={setForegroundAndText}
            />
          </span>
          <span className={styles.bgSlot}>
            <ColorPicker color={background} label={t('toolbar.background')} size={22} onChange={setBackground} />
          </span>
        </div>
        <div className={styles.swapRow}>
          <IconButton label={t('toolbar.swapColors')} onClick={swapColors}>
            <ArrowLeftRight size={13} />
          </IconButton>
          <IconButton label={t('toolbar.resetColors')} onClick={resetColors}>
            <RotateCcw size={13} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
