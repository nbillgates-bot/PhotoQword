/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Merge,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import styles from './Panels.module.css';
import IconButton from '../ui/IconButton';
import { useEditorStore } from '../../store';
import { childrenOf, descendantIds } from '../../engine/layerTree';
import { normalizeSelection } from '../../engine/layerSelection';
import { useLayerDropTarget } from '../../hooks/useLayerDropTarget';
import { useT } from '../../hooks/useT';

/**
 * 图层面板底部操作条，对应 PS 图层面板底部那一排按钮。
 * 按钮的可用性判断都要和 store 里对应 action 的前置条件一致，
 * 否则出现「按钮亮着但点了弹报错」或者「明明能做却被禁用」。
 */
export default function LayerToolbar() {
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const selectedLayerIds = useEditorStore((state) => state.selectedLayerIds);
  const selection = useEditorStore((state) => state.selection);
  const addLayer = useEditorStore((state) => state.addLayer);
  const addGroup = useEditorStore((state) => state.addGroup);
  const groupSelectedLayers = useEditorStore((state) => state.groupSelectedLayers);
  const ungroup = useEditorStore((state) => state.ungroup);
  const mergeGroup = useEditorStore((state) => state.mergeGroup);
  const duplicateSelectedLayers = useEditorStore((state) => state.duplicateSelectedLayers);
  const deleteSelectedLayers = useEditorStore((state) => state.deleteSelectedLayers);
  const reorderLayer = useEditorStore((state) => state.reorderLayer);
  const mergeDown = useEditorStore((state) => state.mergeDown);
  const addMask = useEditorStore((state) => state.addMask);
  const openDialog = useEditorStore((state) => state.openDialog);
  const dropLayerToTrash = useEditorStore((state) => state.dropLayerToTrash);
  const dropLayerToCopy = useEditorStore((state) => state.dropLayerToCopy);
  const t = useT();

  /*
   * 三个按钮都收拖拽落点，与 PS 一致（拖到垃圾桶删、拖到新建按钮复制）。
   * 我们把新建和复制拆成两个按钮，两个都接受，免得用户按 PS 的肌肉记忆
   * 拖到「新建图层」上却什么都没发生。
   */
  const trash = useLayerDropTarget(dropLayerToTrash);
  const copy = useLayerDropTarget(dropLayerToCopy, 'copy');
  const newLayer = useLayerDropTarget(dropLayerToCopy, 'copy');
  const dragging = trash.dragging;

  const active = layers.find((layer) => layer.id === activeLayerId) ?? null;
  const isGroup = active?.type === 'group';
  // 多选时按钮标签要带上数量，否则用户不知道会影响几层
  const count = normalizeSelection(layers, selectedLayerIds, activeLayerId).length;
  const many = count > 1;

  /*
   * 与 deleteLayer 的判断保持一致：看「删完之后还剩不剩像素图层」。
   * 按图层总数判断会误禁——删一个空组不影响任何像素图层，应当允许。
   */
  const canDelete = (() => {
    if (!active) return false;
    const ids = normalizeSelection(layers, selectedLayerIds, activeLayerId);
    const doomed = new Set(ids.flatMap((id) => [id, ...descendantIds(layers, id)]));
    return layers.some((layer) => !doomed.has(layer.id) && layer.type !== 'group');
  })();

  // 组要走「合并组」；向下合并还要求同级里它下面真有图层
  const canMergeDown = (() => {
    if (!active || isGroup) return false;
    const siblings = childrenOf(layers, active.parentId ?? null);
    return siblings.findIndex((layer) => layer.id === active.id) > 0;
  })();

  return (
    <div className={styles.layerToolbar}>
      <IconButton
        label={dragging ? t('layerBar.dropCopy') : t('layerBar.newLayer')}
        className={newLayer.hot ? styles.dropHot : undefined}
        onClick={() => addLayer('raster')}
        {...newLayer.props}
      >
        <Plus size={14} />
      </IconButton>
      {/* 新建空组，与「编组」分开：PS 底部也是两个独立入口 */}
      <IconButton label={t('layerBar.newGroup')} onClick={() => addGroup()}>
        <FolderPlus size={14} />
      </IconButton>
      <IconButton
        // 单选到组时是取消编组；多选时一律是「把这些打成一组」
        label={
          many
            ? t('layerBar.groupMany', { count })
            : isGroup
              ? t('layerBar.ungroup')
              : t('layerBar.group')
        }
        disabled={!active}
        onClick={() => {
          if (!active) return;
          if (!many && isGroup) ungroup(active.id);
          else groupSelectedLayers();
        }}
      >
        {!many && isGroup ? <FolderOpen size={14} /> : <FolderInput size={14} />}
      </IconButton>
      <IconButton
        label={
          dragging
            ? t('layerBar.dropCopy')
            : many
              ? t('layerBar.duplicateMany', { count })
              : t('layerBar.duplicate')
        }
        // 拖拽进行中一律可用：禁用的按钮在多数浏览器里收不到 drop 事件
        disabled={!active && !dragging}
        className={copy.hot ? styles.dropHot : undefined}
        onClick={() => duplicateSelectedLayers()}
        {...copy.props}
      >
        <Copy size={14} />
      </IconButton>
      {/* fx：图层样式，与 PS 面板底部的位置一致（蒙版按钮左侧） */}
      <IconButton label={t('layerBar.style')} disabled={!active} onClick={() => openDialog('layer-style')}>
        <Sparkles size={14} />
      </IconButton>
      <IconButton
        label={
          active?.mask ? t('layerBar.maskExists') : selection ? t('layerBar.maskFromSelection') : t('layerBar.addMask')
        }
        disabled={!active || Boolean(active.mask)}
        onClick={() => active && addMask(active.id, selection ? 'selection' : 'reveal')}
      >
        <Circle size={14} />
      </IconButton>
      <IconButton
        label={isGroup ? t('layerBar.mergeGroup') : t('layerBar.mergeDown')}
        disabled={isGroup ? false : !canMergeDown}
        onClick={() => {
          if (!active) return;
          if (isGroup) mergeGroup(active.id);
          else mergeDown(active.id);
        }}
      >
        <Merge size={14} />
      </IconButton>
      <span className={styles.toolbarGap} />
      <IconButton
        label={t('layerBar.raise')}
        disabled={!active}
        onClick={() => active && reorderLayer(active.id, 'up')}
      >
        <ChevronUp size={14} />
      </IconButton>
      <IconButton
        label={t('layerBar.lower')}
        disabled={!active}
        onClick={() => active && reorderLayer(active.id, 'down')}
      >
        <ChevronDown size={14} />
      </IconButton>
      <IconButton
        label={
          dragging
            ? t('layerBar.dropTrash')
            : many
              ? t('layerBar.deleteMany', { count })
              : isGroup
                ? t('layerBar.deleteGroup')
                : t('layerBar.delete')
        }
        /*
         * 拖拽进行中一律可用：禁用的按钮在多数浏览器里收不到 drop 事件，
         * 而且此刻该不该删要看被拖的那一层，不是看当前选中集合。
         * 真删不了（会删光文档）时由 store 弹提示，与点按钮的路径一致。
         */
        disabled={!canDelete && !dragging}
        className={trash.hot ? styles.dropHot : undefined}
        onClick={() => deleteSelectedLayers()}
        {...trash.props}
      >
        <Trash2 size={14} />
      </IconButton>
    </div>
  );
}
