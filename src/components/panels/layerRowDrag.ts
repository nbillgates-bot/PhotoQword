/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { DragEvent } from 'react';
import type { LayerDragHandlers } from './LayerItem';

/**
 * 图层行上那一套原生拖拽属性。
 *
 * 单独拿出来是因为它全是 DOM 事件的琐碎处理（各浏览器的坑都在这儿），
 * 和行的渲染没有关系，混在 LayerItem 里只会把那个文件撑长。
 */
export function layerRowDragProps(options: {
  id: string;
  isGroup: boolean;
  draggable: boolean;
  handlers: LayerDragHandlers;
  /** copy 为真表示松手时按住了 Alt，要复制而不是移动 */
  onDrop: (copy: boolean) => void;
}) {
  const { id, isGroup, draggable, handlers, onDrop } = options;
  return {
    draggable,

    onDragStart: (event: DragEvent<HTMLElement>) => {
      /*
       * 必须 setData：Firefox 对没带数据的 dragstart 直接不启动拖拽，
       * 表现是按住拖了半天列表毫无反应。值本身用不上，拖的是哪一层由 state 记。
       */
      event.dataTransfer.setData('text/plain', id);
      /*
       * copyMove 而不是 move：拖动途中随时可以按下或松开 Alt 来改主意，
       * 起手时就写死 move 的话浏览器不肯把光标切成复制样式。
       */
      event.dataTransfer.effectAllowed = 'copyMove';
      handlers.onDragStart(id);
    },

    onDragEnd: handlers.onDragEnd,

    onDragOver: (event: DragEvent<HTMLElement>) => {
      // 不能拖时连落点提示都不给，否则拖着文件划过来会画出一条假的插入线
      if (!draggable) return;
      event.preventDefault();
      /*
       * 不设 dropEffect 的话 Safari 会显示禁止光标。
       * 每次 dragover 都重新读 altKey：Alt 是拖动途中按的，只在 dragstart
       * 判一次就永远是移动。按住 Alt 时光标带 + 号，与 PS 一致。
       */
      event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move';
      const box = event.currentTarget.getBoundingClientRect();
      const offset = event.clientY - box.top;
      /*
       * 组行分三段：上下各 1/4 是插到组的前后，中间一半是放进组里。
       * 普通图层只有前后两段。这与 PS 拖进组的手感一致。
       */
      if (isGroup && offset > box.height * 0.25 && offset < box.height * 0.75) {
        handlers.onDragOver(id, 'inside');
        return;
      }
      handlers.onDragOver(id, offset < box.height / 2 ? 'before' : 'after');
    },

    onDrop: (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      onDrop(event.altKey);
    },
  };
}
