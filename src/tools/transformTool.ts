/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler, ToolContext } from './types';
import type { Point } from '../types';
import { hitTransform, type BoxHandle, type TransformState } from '../engine/transformBox';
import { cursorHintFor, dragTransform, type CursorHint } from '../engine/transformDrag';
import { CURSORS } from './cursors';

/**
 * 自由变换工具（Ctrl+T）。
 *
 * 变换会话的状态在 store.transformSession 里，这里只负责把指针事件
 * 翻译成"拖了哪个控制点、拖到哪"。会话本身由 beginTransform 开启——
 * 快捷键和菜单都要能开，所以不能放在工具里。
 *
 * 数学全在 engine/transformBox 和 engine/transformDrag：命中判定、
 * 旋转、斜切、Shift 等比、Alt 中心缩放都是纯函数，这里不重复实现。
 * 裁剪仍用 handleBox（轴对齐足够），两者不共用是因为裁剪框不能旋转。
 */
let drag: {
  handle: BoxHandle;
  anchor: Point;
  start: TransformState;
  /**
   * 当前是否按着 Ctrl（斜切）。每次移动都刷新，因为 PS 允许拖到一半才按下
   * 修饰键切换行为，光标要跟着变。
   */
  ctrl: boolean;
} | null = null;

/** 语义方向 → CSS 光标。旋转用自绘 SVG（8 个方向），CSS 没有对应关键字 */
const CURSOR_BY_HINT: Record<CursorHint, string> = {
  ns: 'ns-resize',
  ew: 'ew-resize',
  nwse: 'nwse-resize',
  nesw: 'nesw-resize',
  move: 'move',
  'rotate-n': CURSORS['rotate-n'],
  'rotate-ne': CURSORS['rotate-ne'],
  'rotate-e': CURSORS['rotate-e'],
  'rotate-se': CURSORS['rotate-se'],
  'rotate-s': CURSORS['rotate-s'],
  'rotate-sw': CURSORS['rotate-sw'],
  'rotate-w': CURSORS['rotate-w'],
  'rotate-nw': CURSORS['rotate-nw'],
  none: 'default',
};

/**
 * 悬停时的光标。cursorPos 每次移动都会写 store，所以渲染期读它就能跟手。
 *
 * 拖拽中锁定成起笔那个控制点的光标：旋转时框在指针下面转，命中判定会
 * 从 rotate 跳到 inside 再跳回来，光标跟着闪。PS 在整段拖拽里光标是不变的。
 * 旋转的光标方向也锁定在起笔位置：拖到一半框转了 180°，光标不能跟着反过来。
 */
function hoverCursor(ctx: ToolContext): string {
  const { transformSession, cursorPos, zoom } = ctx.store;
  if (!transformSession) return 'default';
  if (drag) {
    return CURSOR_BY_HINT[cursorHintFor(drag.handle, drag.start, drag.ctrl, drag.anchor)];
  }
  if (!cursorPos) return 'default';
  const handle = hitTransform(transformSession.state, cursorPos, zoom);
  return CURSOR_BY_HINT[cursorHintFor(handle, transformSession.state, false, cursorPos)];
}

export const transformTool: ToolHandler = {
  id: 'transform',
  cursor: hoverCursor,

  onPointerDown: (pointer, ctx) => {
    const session = ctx.store.transformSession;
    // 没有会话时按下即开启，省得用户必须先按 Ctrl+T
    if (!session) {
      ctx.store.beginTransform();
      return;
    }
    const handle = hitTransform(session.state, pointer.point, ctx.store.zoom);
    if (handle) {
      drag = { handle, anchor: pointer.point, start: session.state, ctrl: pointer.ctrlKey };
    }
  },

  onPointerMove: (pointer, ctx) => {
    if (!drag) return;
    drag.ctrl = pointer.ctrlKey;
    const aspectLocked = ctx.store.transformAspectLocked;
    ctx.store.updateTransform(
      dragTransform({
        start: drag.start,
        anchor: drag.anchor,
        current: pointer.point,
        handle: drag.handle,
        // Shift 或工具栏按钮锁定都会等比
        shift: pointer.shiftKey || aspectLocked,
        alt: pointer.altKey,
        ctrl: pointer.ctrlKey,
      }),
    );
  },

  onPointerUp: () => {
    drag = null;
  },

  onDoubleClick: (pointer, ctx) => {
    const session = ctx.store.transformSession;
    if (!session) return;
    // 双击框内确认，与 PS 一致。旋转区在框外，不算确认
    const handle = hitTransform(session.state, pointer.point, ctx.store.zoom);
    if (handle && handle !== 'rotate') ctx.store.commitTransform();
  },

  onDeactivate: (ctx) => {
    drag = null;
    /*
     * 切走工具默认放弃变换。切到移动工具的情形不会走到这里的实际取消——
     * setTool 已经先调 commitTransform 把 session 清了，这一句成了空操作。
     */
    ctx.store.cancelTransform();
  },
};
