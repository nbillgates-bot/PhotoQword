/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { memo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CornerLeftDown,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
} from 'lucide-react';
import styles from './Panels.module.css';
import type { Layer } from '../../types';
import type { SelectMode } from '../../engine/layerSelection';
import type { LayerRowHandlers } from '../../hooks/useLayerRowHandlers';
import { THUMB_BOX } from '../../engine/thumbSize';
import { useEditorStore } from '../../store';
import LayerThumbs from './LayerThumbs';
import LayerName from './LayerName';
import LayerLockMark from './LayerLockMark';
import { layerRowDragProps } from './layerRowDrag';
import { useEffectiveModifiers } from '../../hooks/useEffectiveModifiers';
import { useT } from '../../hooks/useT';

/** 拖拽相关的行回调，与 useLayerDrag 的 handlers 对应 */
export interface LayerDragHandlers {
  onDragStart: (id: string) => void;
  onDragOver: (id: string, position: 'before' | 'after' | 'inside') => void;
  onDragEnd: () => void;
}

interface LayerItemProps {
  layer: Layer;
  /** 活动图层：绘制的目标，顶部混合模式/不透明度显示的是它 */
  active: boolean;
  /** 在多选集合里。活动层必然也是 selected */
  selected: boolean;
  /** 正在单独显示，且这一层不在保留集合里（眼睛画成半透明提示状态） */
  dimmed: boolean;
  /** 是剪贴组的成员（有基底可剪），面板上要缩进并画向下的箭头 */
  clipped: boolean;
  /** 同级里它下面还有层，可以与下方建立剪贴关系 */
  canClipHere: boolean;
  /** store 的 pixelRevision，只在像素变了以后才重画缩略图 */
  pixelRevision: number;
  /** 嵌套层级，0 为最外层。用来算缩进 */
  depth: number;
  /** 能不能拖着排序。过滤生效时关掉（原因见 LayerList） */
  draggable: boolean;
  /** 拖到组行正中时高亮整行，表示"放进这个组里" */
  dropHint: 'before' | 'after' | 'inside' | null;
  /**
   * 全部行共用的一份操作回调（每个都带图层 id）。
   * 不拆成十几个零参回调是为了让引用恒定，memo 才拦得住重渲染。
   */
  handlers: LayerRowHandlers;
  dragHandlers: LayerDragHandlers;
  onContextMenu: (menu: { layerId: string; x: number; y: number }) => void;
  /** copy 为真表示松手时按住了 Alt，要复制而不是移动 */
  onDrop: (copy: boolean) => void;
}

/**
 * 点击时的修饰键 → 选择方式，与 PS 一致。
 *
 * shiftKey 传的是「并进了触摸快捷方式之后」的值，所以 iPad 上锁定 Shift
 * 再点也能选一段。ctrlKey 没有触屏等价物 —— 控件只有 Alt/Shift 两档
 * （docs/TODO_MOBILE.md 的已定决策），所以「Ctrl+点击加减选」在触屏上
 * 暂时只能靠长按菜单里的选择项走。
 */
function modeFor(event: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): SelectMode {
  if (event.shiftKey) return 'range';
  // Mac 上是 Command
  if (event.ctrlKey || event.metaKey) return 'toggle';
  return 'set';
}

/**
 * 图层面板的一行。
 *
 * 用 memo 包住：几百个图层时选一下图层只有涉及的两行需要重画，
 * 前提是 handlers / dragHandlers 引用恒定（见 useLayerRowHandlers）。
 */
function LayerItem({
  layer,
  active,
  selected,
  dimmed,
  clipped,
  canClipHere,
  pixelRevision,
  depth,
  draggable,
  dropHint,
  handlers,
  dragHandlers,
  onContextMenu,
  onDrop,
}: LayerItemProps) {
  const t = useT();
  const thumbSize = useEditorStore((state) => state.layerThumbSize);
  // 触屏上的 Alt/Shift 来自屏幕控件，这里把它并进事件（见 useEffectiveModifiers）
  const { modifiersOf, consume } = useEffectiveModifiers();
  const isGroup = layer.type === 'group';
  // 剪贴成员再往右缩一点，与 PS 一样让它明显挂在基底之下
  const indent = depth * 14 + (clipped ? 8 : 0);
  // 组的文件夹图标要跟着缩略图档位一起变，否则组行与像素行不等高
  const thumbBox = THUMB_BOX[thumbSize];

  const hintClass =
    dropHint === 'before'
      ? styles.dropBefore
      : dropHint === 'after'
        ? styles.dropAfter
        : dropHint === 'inside'
          ? styles.dropInside
          : '';

  const stateClass = [
    active ? styles.layerActive : '',
    // 选中但不是活动层：底色浅一些，PS 也是这样区分的
    selected && !active ? styles.layerSelected : '',
    hintClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      data-layer-id={layer.id}
      className={`${styles.layerItem} ${stateClass}`}
      style={{ paddingLeft: `${indent}px` }}
      onClick={(event) => {
        handlers.onSelect(layer.id, modeFor({ ...event, ...modifiersOf(event) }));
        consume();
      }}
      /*
       * PS 里双击图层行打开图层样式，双击名字才是重命名——
       * LayerName 自己 stopPropagation，所以这里不用再排除它。
       * 调整图层双击打开参数对话框。
       */
      onDoubleClick={() => {
        if (!selected) handlers.onSelect(layer.id, 'set');
        if (layer.type === 'adjustment' && layer.adjustmentData) {
          if (layer.adjustmentData.kind === 'brightness-contrast') {
            useEditorStore.getState().openDialog('adjustment-brightness-contrast');
          }
        } else {
          handlers.onOpenStyle();
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        // 右键没选中它时先选中，与 PS 一致：菜单作用于右键的那一层
        if (!selected) handlers.onSelect(layer.id, 'set');
        onContextMenu({ layerId: layer.id, x: event.clientX, y: event.clientY });
      }}
      {...layerRowDragProps({
        id: layer.id,
        isGroup,
        draggable,
        handlers: dragHandlers,
        onDrop,
      })}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          handlers.onSelect(layer.id, modeFor(event));
        }
      }}
    >
      {/* 颜色标记贴在行最左侧，与 PS 的色条位置一致 */}
      {layer.color ? (
        <span className={styles.colorMarker} style={{ background: layer.color }} aria-hidden="true" />
      ) : null}

      {/*
        * 行底边的窄热区：Alt+点这里 = 与下方图层建立/解除剪贴，
        * 也就是 PS 里 Alt+点两行之间那条分界线。
        * 只在能剪贴时挂上，否则 Alt 划过整个面板底边都会变光标，误导。
        */}
      {canClipHere ? (
        <span
          className={styles.clipHotzone}
          title={t('layerRow.altClipHint')}
          onClick={(event) => {
            if (!modifiersOf(event).altKey) return;
            event.stopPropagation();
            handlers.onToggleClip(layer.id);
            consume();
          }}
        />
      ) : null}

      {/* 眼睛放最左，与 PS 图层面板一致 */}
      <button
        type="button"
        className={`${styles.miniButton} ${layer.visible ? '' : styles.eyeClosed} ${dimmed ? styles.eyeDimmed : ''}`}
        title={
          layer.visible
            ? t('layerRow.hideHint')
            : t('layerRow.showHint')
        }
        aria-label={t(layer.visible ? 'layerRow.hide' : 'layerRow.show')}
        aria-pressed={!layer.visible}
        onClick={(event) => {
          event.stopPropagation();
          // Alt+点击 = 单独显示，与 PS 一致
          if (modifiersOf(event).altKey) handlers.onSolo(layer.id);
          else handlers.onToggleVisible(layer.id);
          consume();
        }}
      >
        {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
      </button>

      {/*
        * 剪贴成员：下折箭头 + 整行缩进（缩进走 style 里的 paddingLeft）。
        * 与 PS 一致，标记在眼睛右侧、缩略图左侧，组和普通图层都一样。
        */}
      {clipped ? (
        <span className={styles.clipMark} title={t('layerRow.clippedTo')}>
          <CornerLeftDown size={11} />
        </span>
      ) : null}

      {isGroup ? (
        <>
          <button
            type="button"
            className={styles.collapseButton}
            title={t(layer.collapsed ? 'layerRow.expandGroup' : 'layerRow.collapseGroup')}
            aria-label={t(layer.collapsed ? 'layerRow.expandGroup' : 'layerRow.collapseGroup')}
            aria-expanded={!layer.collapsed}
            onClick={(event) => {
              event.stopPropagation();
              handlers.onToggleCollapsed(layer.id);
            }}
          >
            {layer.collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          {/* 组没有像素缩略图，用文件夹图标顶替，与 PS 一致 */}
          {thumbBox > 0 ? (
            <div
              className={styles.groupIcon}
              style={{ width: `${thumbBox + 2}px`, height: `${thumbBox + 2}px` }}
              aria-hidden="true"
            >
              {layer.collapsed ? (
                <Folder size={thumbBox - 5} />
              ) : (
                <FolderOpen size={thumbBox - 5} />
              )}
            </div>
          ) : null}
        </>
      ) : (
        <>
          <span className={styles.collapseSpacer} aria-hidden="true" />
          {/*
            * 这里的内联箭头无害：LayerThumbs 是 LayerItem 的子节点，
            * LayerItem 被 memo 拦住不重渲染时它根本不会重新求值。
            */}
          <LayerThumbs
            layer={layer}
            pixelRevision={pixelRevision}
            onSelectPixels={() => handlers.onSelectPixels(layer.id)}
            onSelectMask={() => handlers.onSelectMask(layer.id)}
            onToggleMask={() => handlers.onToggleMask(layer.id)}
          />
        </>
      )}

      <div className={styles.layerInfo}>
        <LayerName layer={layer} onRename={(name) => handlers.onRename(layer.id, name)} />
      </div>

      {/* fx 标记：有图层样式时显示，与 PS 一致 */}
      {layer.effects ? (
        <span className={styles.layerBadge} title={t('layerRow.hasStyle')}>
          fx
        </span>
      ) : null}

      {isGroup && layer.blendMode === 'pass-through' ? (
        <span className={styles.layerBadge}>{t('blend.passThrough')}</span>
      ) : null}
      {layer.opacity < 100 ? (
        <span className={styles.layerBadge}>{Math.round(layer.opacity)}%</span>
      ) : null}

      <div className={styles.layerControls}>
        <LayerLockMark layer={layer} onToggle={() => handlers.onToggleLocked(layer.id)} />
      </div>
    </div>
  );
}

export default memo(LayerItem);
