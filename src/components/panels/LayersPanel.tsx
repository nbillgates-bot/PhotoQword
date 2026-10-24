/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import LayerList from './LayerList';
import LayerToolbar from './LayerToolbar';
import LayerLockBar from './LayerLockBar';
import LayerFilterBar from './LayerFilterBar';
import LayerPanelMenu from './LayerPanelMenu';
import Slider from '../ui/Slider';
import Select from '../ui/Select';
import { useEditorStore } from '../../store';
import { blendOptionsFor } from '../../types';
import { useT } from '../../hooks/useT';
import { useTranslatedOptions } from '../../hooks/useTranslatedOptions';

/**
 * 图层面板，结构对齐 PS：
 * 顶部过滤栏，然后混合模式 + 不透明度、锁定栏，中间可滚动图层列表，
 * 底部一排操作按钮。右上角是面板菜单（缩览图选项）。
 */
export default function LayersPanel() {
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const setSelectedOpacity = useEditorStore((state) => state.setSelectedOpacity);
  const setSelectedBlend = useEditorStore((state) => state.setSelectedBlend);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const t = useT();
  const active = layers.find((layer) => layer.id === activeLayerId) ?? null;
  // 穿透只在组上列出来，普通图层选了没反应反而误导
  const blendOptions = useTranslatedOptions(blendOptionsFor(active?.type ?? 'raster'));

  return (
    <div className={styles.layersPanel}>
      {/* 过滤栏 + 面板菜单，对应 PS 图层面板最上面那一条 */}
      <div className={styles.panelHead}>
        <LayerFilterBar />
        <LayerPanelMenu />
      </div>

      {/* 混合模式与不透明度 */}
      <div className={styles.blendRow}>
        <Select
          label={t('panel.blendMode')}
          value={active?.blendMode ?? 'normal'}
          options={blendOptions}
          onChange={(mode) => active && setSelectedBlend(mode)}
        />
        {/* 多选时顶栏显示活动层的值，改动应用到全部选中层，与 PS 一致 */}
        <Slider
          label={t('panel.opacity')}
          min={0}
          max={100}
          unit="%"
          value={active?.opacity ?? 100}
          onChange={(value) => active && setSelectedOpacity(value)}
          onCommit={() => pushHistory('action.opacity', { layerIds: [] })}

        />
      </div>

      <LayerLockBar />
      <LayerList />
      <LayerToolbar />
    </div>
  );
}
