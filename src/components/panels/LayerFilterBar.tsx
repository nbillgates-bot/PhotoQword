/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Power } from 'lucide-react';
import styles from './Panels.module.css';
import Select from '../ui/Select';
import IconButton from '../ui/IconButton';
import LayerFilterValue from './LayerFilterValue';
import { useEditorStore } from '../../store';
import { FILTER_KINDS } from './layerFilterDefs';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

/**
 * 图层过滤栏，对齐 PS 图层面板顶部那一条：
 * 左侧「按什么筛」下拉 + 中间随之变化的条件控件 + 右侧总开关。
 *
 * 开关关掉时条件仍保留（PS 也是这样，再打开还是上次筛的条件）。
 */
export default function LayerFilterBar() {
  const filter = useEditorStore((state) => state.layerFilter);
  const setLayerFilter = useEditorStore((state) => state.setLayerFilter);
  const t = useT();
  const kinds = useTranslatedOptions(FILTER_KINDS);

  return (
    <div className={styles.filterRow}>
      <Select label={t('panel.filterPick')} value={filter.kind} options={kinds} onChange={(kind) => setLayerFilter({ kind })} />

      <div className={styles.filterValue}>
        <LayerFilterValue filter={filter} onChange={setLayerFilter} />
      </div>

      {/*
        * 总开关。PS 用的是一个红色小开关图标，按下去表示"过滤生效中"。
        * 这里用电源图标 + 按下态，语义一致。
        */}
      <IconButton
        label={filter.enabled ? t('panel.filterOff') : t('panel.filterOn')}
        className={styles.filterToggle}
        active={filter.enabled}
        onClick={() => setLayerFilter({ enabled: !filter.enabled })}
      >
        <Power size={13} />
      </IconButton>
    </div>
  );
}
