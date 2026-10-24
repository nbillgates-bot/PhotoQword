/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useMemo } from 'react';
import { useEditorStore } from '../store';
import type { SelectMode } from '../engine/layerSelection';

/** 图层行上的操作。每个都带 id，这样整套回调可以全图层共用一份 */
export interface LayerRowHandlers {
  onToggleClip: (id: string) => void;
  onToggleCollapsed: (id: string) => void;
  onSelect: (id: string, mode: SelectMode) => void;
  onSolo: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onSelectPixels: (id: string) => void;
  onSelectMask: (id: string) => void;
  onToggleMask: (id: string) => void;
  onOpenStyle: () => void;
}

/**
 * 一整套恒定不变的图层行回调。
 *
 * 为什么不在 LayerList 里写内联箭头函数：那样每次渲染都是新函数，
 * LayerItem 上的 memo 全部失效，选一下图层就要重渲染全部行。
 * 这里靠 getState() 现取状态，依赖为空，对象一辈子只建一次。
 */
export function useLayerRowHandlers(): LayerRowHandlers {
  return useMemo(() => {
    const store = () => useEditorStore.getState();
    return {
      onToggleClip: (id) => store().toggleLayerClipped(id),
      onToggleCollapsed: (id) => store().toggleGroupCollapsed(id),
      onSelect: (id, mode) => store().selectLayer(id, mode),
      onSolo: (id) => store().toggleSolo(id),

      onToggleVisible: (id) => {
        const layer = store().layers.find((item) => item.id === id);
        if (!layer) return;
        store().updateLayer(id, { visible: !layer.visible });

        /*
         * layerIds: [] 表示「这一步没动任何图层的像素」。
         * 不带 hint 的话 pushHistory 会对每个图层 getImageData 全幅再逐字节 diff，
         * 大 PSD 上就是几十次全幅扫描——点一下眼睛卡住的另一半原因。
         */
        store().pushHistory(layer.visible ? 'action.hideLayer' : 'action.showLayer', { layerIds: [] });
      },

      onToggleLocked: (id) => {
        const layer = store().layers.find((item) => item.id === id);
        if (!layer) return;
        store().updateLayer(id, { locked: !layer.locked });
      },

      onRename: (id, name) => {
        store().updateLayer(id, { name });
        // 同上：改名不动像素
        store().pushHistory('action.renameLayer', { layerIds: [] });
      },

      onSelectPixels: (id) => {
        store().selectLayer(id);
        store().setMaskSelected(id, false);
      },

      onSelectMask: (id) => {
        store().selectLayer(id);
        store().setMaskSelected(id, true);
      },

      onToggleMask: (id) => store().toggleMaskEnabled(id),
      onOpenStyle: () => store().openDialog('layer-style'),
    };
  }, []);
}
