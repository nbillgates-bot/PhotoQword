/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import { useEditorStore } from '../store';

/**
 * 把图层面板底部的一个按钮变成拖拽落点（PS 支持把图层拖到垃圾桶、新建按钮上）。
 *
 * 抽成 hook 是因为垃圾桶、新建图层、复制三个按钮要的是同一套东西：
 * dragOver 时 preventDefault + 设光标 + 高亮，dragLeave 取消高亮，drop 时执行。
 *
 * effect 是落点的语义：删除和移动都用 'move'，复制用 'copy'，
 * 浏览器据此换光标。这是拖拽反馈唯一的来源，不设的话 Safari 显示禁止光标。
 */
export function useLayerDropTarget(action: () => void, effect: 'move' | 'copy' = 'move') {
  const dragging = useEditorStore((state) => state.draggingLayerId);
  const [hot, setHot] = useState(false);

  return {
    /** 有没有图层正在被拖 */
    dragging: Boolean(dragging),
    /** 指针正悬在这个按钮上，用来加高亮类名 */
    hot,
    props: {
      onDragOver: (event: React.DragEvent<HTMLElement>) => {
        if (!dragging) return;
        // 不 preventDefault 的话浏览器根本不认这里是落点
        event.preventDefault();
        event.dataTransfer.dropEffect = effect;
        setHot(true);
      },
      onDragLeave: () => setHot(false),
      onDrop: (event: React.DragEvent<HTMLElement>) => {
        event.preventDefault();
        setHot(false);
        action();
      },
    },
  };
}
