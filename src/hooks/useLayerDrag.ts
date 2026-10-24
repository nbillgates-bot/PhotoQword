/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store';
import { childrenOf } from '../engine/layerTree';

export type DropPosition = 'before' | 'after' | 'inside';

interface DropTarget {
  id: string;
  position: DropPosition;
}

/**
 * 图层面板的拖拽排序状态与落点换算。
 *
 * 正在拖谁放在 store（垃圾桶在兄弟组件 LayerToolbar 里要用），
 * 落点高亮是纯视觉的，留在这里当局部状态。
 */
export function useLayerDrag() {
  const draggingId = useEditorStore((state) => state.draggingLayerId);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // 拖到列表末尾空白处 = 移出所有组，落到最外层最底
  const [rootDrop, setRootDrop] = useState(false);

  const clear = useCallback(() => {
    useEditorStore.getState().endLayerDrag();
    setDropTarget(null);
    setRootDrop(false);
  }, []);

  /*
   * 拖拽一结束就收掉落点高亮。
   *
   * 不能只靠行上的 onDragEnd：拖到垃圾桶时那一行当场被删掉，
   * 元素已经卸载，dragend 不会再来，插入线就永远留在面板上。
   */
  useEffect(() => {
    if (draggingId) return;
    setDropTarget(null);
    setRootDrop(false);
  }, [draggingId]);

  /*
   * 这一组回调要发给每一行，必须恒定不变，否则 LayerItem 的 memo 全废。
   * 所以内部一律 getState() 现取，依赖为空。
   */
  const handlers = useMemo(
    () => ({
      onDragStart: (id: string) => useEditorStore.getState().beginLayerDrag(id),
      onDragOver: (id: string, position: DropPosition) => {
        setRootDrop(false);
        setDropTarget({ id, position });
      },
      onDragEnd: clear,
    }),
    [clear],
  );

  /**
   * 把拖拽结果换算成目标父级与位置并落位。
   *
   * copy 为真时复制一份落过去（PS 里按住 Alt 拖动），原图层留在原处。
   * 是不是复制按松手那一刻的 Alt 判断，与 PS 一致——拖到一半改主意还来得及。
   */
  const applyDrop = useCallback(
    (copy = false) => {
      const store = useEditorStore.getState();
      const dragId = store.draggingLayerId;
      /*
       * 复制时允许落到自己身上：那就是「在原位上方复制一份」，
       * PS 也认。普通移动落到自己身上才是无意义的。
       */
      if (!dragId || !dropTarget || (!copy && dragId === dropTarget.id)) {
        clear();
        return;
      }

      const { layers } = store;
      const target = layers.find((layer) => layer.id === dropTarget.id);
      if (!target) {
        clear();
        return;
      }
      const place = copy ? store.copyLayerTo : store.moveLayerTo;

      if (dropTarget.position === 'inside') {
        // 放进组里，落到组内最顶端
        place(dragId, target.id, childrenOf(layers, target.id).length);
        clear();
        return;
      }

      // 插到目标的前后：父级跟目标一致，位置按目标在同级中的下标算
      const parentId = target.parentId ?? null;
      const siblings = childrenOf(layers, parentId);
      const at = siblings.findIndex((layer) => layer.id === dropTarget.id);
      // 面板是倒序的：视觉上的 before 对应栈里更靠上（索引更大）
      let to = dropTarget.position === 'before' ? at + 1 : at;
      /*
       * 同级内前移时自己会先被摘掉，目标下标要减一。
       * 复制不摘原层，同级数量不变，所以这条不适用。
       */
      if (!copy) {
        const fromIndex = siblings.findIndex((layer) => layer.id === dragId);
        if (fromIndex >= 0 && fromIndex < to) to -= 1;
      }

      place(dragId, parentId, to);
      clear();
    },
    [dropTarget, clear],
  );

  /** 悬停在末尾空白处：取消行内落点，改成落到最外层 */
  const onRootDragOver = useCallback(() => {
    setDropTarget(null);
    setRootDrop(true);
  }, []);

  /** 拖到末尾空白处：移出所有组，落到最外层最底。copy 为真时复制过去 */
  const dropToRoot = useCallback(
    (copy = false) => {
      const store = useEditorStore.getState();
      const id = store.draggingLayerId;
      if (id) {
        if (copy) store.copyLayerTo(id, null, 0);
        else store.moveLayerTo(id, null, 0);
      }
      clear();
    },
    [clear],
  );

  return { draggingId, dropTarget, rootDrop, handlers, applyDrop, onRootDragOver, dropToRoot };
}
