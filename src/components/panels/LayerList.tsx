/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, useState } from 'react';
import { Layers as LayersIcon, SearchX } from 'lucide-react';
import styles from './Panels.module.css';
import LayerItem from './LayerItem';
import ContextMenu from '../ui/ContextMenu';
import { useEditorStore } from '../../store';
import { panelRows } from '../../engine/layerTree';
import { normalizeSelection, soloVisibleIds } from '../../engine/layerSelection';
import { clipInfoOf } from '../../engine/clipping';
import { filterLayers, isFilterActive } from '../../engine/layerFilter';
import { useLayerRowHandlers } from '../../hooks/useLayerRowHandlers';
import { useLayerDrag } from '../../hooks/useLayerDrag';
import { layerMenuItems } from './layerMenuDefs';
import { useT } from '../../hooks/useT';

/**
 * 图层列表本体：行渲染、拖拽排序、右键菜单。
 *
 * 过滤生效时列表变成平铺的命中结果，并禁掉拖拽——
 * 看不到全貌时拖出来的顺序不可预期，PS 在过滤状态下也不让拖。
 *
 * 行上的回调全部来自 useLayerRowHandlers 那一份恒定对象，
 * 这里不写内联箭头函数：内联的话每次渲染都是新函数，
 * LayerItem 的 memo 会全部失效，几百个图层时选一下就卡。
 */
export default function LayerList() {
  const t = useT();
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  // visualRevision 包含像素变化和可见性变化，缩略图只跟像素走
  const pixelRevision = useEditorStore((state) => state.pixelRevision);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const soloLayerId = useEditorStore((state) => state.soloLayerId);
  const filter = useEditorStore((state) => state.layerFilter);

  const rowHandlers = useLayerRowHandlers();
  const drag = useLayerDrag();
  const [menu, setMenu] = useState<{ layerId: string; x: number; y: number } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtering = isFilterActive(filter);
  /*
   * 过滤时不走 panelRows：命中的层要平铺显示，深度一律归零，
   * 否则结果还会藏在折叠的组里（原因见 layerFilter.filterLayers）。
   */
  const rows = filtering
    ? filterLayers(layers, filter)
        .map((layer) => ({ layer, depth: 0 }))
        .reverse()
    : panelRows(layers);
  // 每行都判一次 includes 是 O(n²)，先收成 Set
  const selectedIds = new Set(normalizeSelection(layers, selectedLayerIds, activeLayerId));
  // 同理，剪贴信息一趟算完，不要每行各扫一遍图层表
  const clipInfo = clipInfoOf(layers);
  // 单独显示时哪些行的眼睛要画成"被 solo 压住"的样子
  const soloKept = soloLayerId ? soloVisibleIds(layers, soloLayerId) : null;

  /*
   * 活动图层变化时滚动到可见位置。
   *
   * 折叠组里的图层由 selectLayer 负责展开（见 revealAncestors），这里只管滚。
   * 过滤生效时活动层可能确实不在列表里，那时找不到元素就什么都不做——
   * 这是正常情况，不是错误。
   *
   * rows.length 也进依赖：过滤条件一改行数就变，之前藏起来的活动层
   * 这时候才第一次出现在 DOM 里，得补一次滚动。
   */
  useEffect(() => {
    if (!activeLayerId || !listRef.current) return;
    const element = listRef.current.querySelector(`[data-layer-id="${activeLayerId}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeLayerId, rows.length]);

  return (
    <div
      ref={listRef}
      className={`${styles.layerList} ${filtering ? styles.filterActive : ''}`}
      role="listbox"
      aria-label={t('panel.layers')}
    >
      {rows.length === 0 ? (
        <div className={styles.empty}>
          {filtering ? <SearchX size={20} /> : <LayersIcon size={20} />}
          <span>{t(filtering ? 'layerList.noMatch' : 'layerList.empty')}</span>
        </div>
      ) : (
        rows.map(({ layer, depth }) => (
          <LayerItem
            key={layer.id}
            layer={layer}
            pixelRevision={pixelRevision}
            depth={depth}
            active={layer.id === activeLayerId}
            selected={selectedIds.has(layer.id)}
            dimmed={Boolean(soloKept) && !soloKept!.has(layer.id)}
            // 标了 clipped 但找不到基底时不画箭头：标记留着，但剪贴关系确实没生效
            clipped={clipInfo.get(layer.id)?.clipped ?? false}
            canClipHere={clipInfo.get(layer.id)?.canClipHere ?? false}
            draggable={!filtering}
            dropHint={drag.dropTarget?.id === layer.id ? drag.dropTarget.position : null}
            handlers={rowHandlers}
            dragHandlers={drag.handlers}
            onContextMenu={setMenu}
            onDrop={drag.applyDrop}
          />
        ))
      )}

      {/*
       * 末尾落点区：组内图层要能拖回最外层。
       * 只在拖拽进行中才占位，平时不留空白。
       */}
      {drag.draggingId ? (
        <div
          className={`${styles.rootDropZone} ${drag.rootDrop ? styles.rootDropActive : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            // 每次都重读 altKey：Alt 是拖动途中按的，光标要跟着变成复制
            event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
            drag.onRootDragOver();
          }}
          onDrop={(event) => {
            event.preventDefault();
            drag.dropToRoot(event.altKey);
          }}
        >
          <span className={styles.rootDropLabel}>{t('layerList.dropToRoot')}</span>
        </div>
      ) : null}

      {/*
       * 菜单项用 getState() 现取而不是订阅：
       * 它要读十几个 action 和整套图层状态，订阅等于每次改动都重建菜单，
       * 而菜单只在弹出的那一刻需要一份快照。
       */}
      {menu ? <LayerContextMenu {...menu} onClose={() => setMenu(null)} /> : null}
    </div>
  );
}

function LayerContextMenu({
  layerId,
  x,
  y,
  onClose,
}: {
  layerId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const store = useEditorStore.getState();
  const t = useT();
  const layer = store.layers.find((item) => item.id === layerId);
  if (!layer) return null;
  return <ContextMenu items={layerMenuItems(store, layer, t)} x={x} y={y} onClose={onClose} />;
}
