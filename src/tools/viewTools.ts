/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler, ToolContext } from './types';
import type { Point, Rect } from '../types';
import { flatten } from '../engine/compositor';
import { ctx2d } from '../engine/canvasUtils';
import { rgbToHex } from '../engine/color';
import { cursorFor, dragTo, hitTest, normalize, type Handle } from '../engine/handleBox';
import { CURSORS } from './cursors';
import { buildSnapContext, snapPoint, snapRectTranslate, type SnapContext } from '../engine/snapping';


/** 吸管：取合成后的颜色；alt 键设为背景色 */
export const eyedropperTool: ToolHandler = {
  id: 'eyedropper',
  cursor: CURSORS.eyedropper,
  onPointerDown: (pointer, ctx) => {
    const { doc, layers } = ctx.store;
    if (!doc) return;
    const x = Math.floor(pointer.point.x);
    const y = Math.floor(pointer.point.y);
    if (x < 0 || y < 0 || x >= doc.width || y >= doc.height) return;

    const merged = flatten(layers, doc.width, doc.height);
    const [r, g, b] = ctx2d(merged).getImageData(x, y, 1, 1).data;
    const hex = rgbToHex({ r, g, b });
    if (pointer.altKey) ctx.store.setBackground(hex);
    else ctx.store.setForeground(hex);
    ctx.store.showToast('toast.pickedColor', 'info', { hex });
  },
};

/** 抓手：拖动画布 */
let panStart: { pointer: Point; pan: Point } | null = null;

export const handTool: ToolHandler = {
  id: 'hand',
  /*
   * 拖拽中变成握紧的手：没有这个反馈，用户分不清自己按住了没有。
   *
   * panStart 是模块级状态，React 看不见它的变化，所以按下但还没移动的
   * 那一瞬间光标仍是张开的手——第一次移动会调 setPan，store 变了就重算。
   * 抓手的"握紧"本来就是拖动中的反馈，这一帧的差在实际使用里看不出来，
   * 不值得为它往 store 里加一个只服务光标的字段。
   */
  cursor: () => (panStart ? 'grabbing' : 'grab'),
  onPointerDown: (pointer, ctx) => {
    panStart = {
      pointer: pointer.screen,
      pan: { x: ctx.store.panX, y: ctx.store.panY },
    };
    // 拖动中降一档重采样质量。抬手是确定的，所以不用滚轮那套超时判定
    ctx.store.setViewInteracting(true);
  },
  onPointerMove: (pointer, ctx) => {
    if (!panStart) return;
    // 必须用视口坐标：文档坐标本身受 pan 影响，会导致自激
    ctx.store.setPan(
      panStart.pan.x + (pointer.screen.x - panStart.pointer.x),
      panStart.pan.y + (pointer.screen.y - panStart.pointer.y),
    );
  },
  onPointerUp: (_pointer, ctx) => {
    panStart = null;
    ctx.store.setViewInteracting(false);
  },
  // 拖动中途切走工具（或按 Esc）也要复位，否则质量档会一直卡在 low
  onDeactivate: (ctx) => {
    panStart = null;
    ctx.store.setViewInteracting(false);
  },
};

/** 缩放工具：单击放大，alt 单击缩小 */
export const zoomTool: ToolHandler = {
  id: 'zoom',
  // 按住 Alt 就是缩小，光标必须跟着变成 zoom-out，
  // 否则显示放大却执行缩小，等于骗用户
  cursor: (ctx) => (ctx.store.altPressed ? 'zoom-out' : 'zoom-in'),
  onPointerDown: (pointer, ctx) => {
    // 以点击处为基点，与 PS 的缩放工具一致。screen 已是视口内坐标
    if (pointer.altKey) ctx.store.zoomOut(pointer.screen);
    else ctx.store.zoomIn(pointer.screen);
  },
};

/**
 * 裁剪工具。
 *
 * 与 PS 一致的两段式：先拖出裁剪框（此时**不裁**），框留在画布上，
 * 之后可以拖边、拖角、拖框内平移反复调整，双击框内或按 Enter 才真正落刀。
 * 裁剪框本身存在 store 的 cropRect 里，不再是工具的模块级草稿——
 * 因为它要跨多次指针交互存活，而且覆盖层和快捷键都要读它。
 */

/** 正在拖的控制点；null 表示没在拖 */
let cropDrag: { handle: Handle; anchor: Point; start: Rect } | null = null;
/** 尚未确认成裁剪框的首次拖拽 */
let cropDraft: { start: Point; current: Point } | null = null;

export function currentCropDraft(): Rect | null {
  if (!cropDraft) return null;
  const { start, current } = cropDraft;
  return normalize({
    x: start.x,
    y: start.y,
    width: current.x - start.x,
    height: current.y - start.y,
  });
}

/**
 * 为裁剪构建吸附上下文。可吸的目标是参考线和网格线（文档四边不参与，
 * 否则小文档上四条边永远落在容差内，就没法裁掉最外面那几像素了）。
 * 一个目标都没有时返回 null。
 */
function cropSnapContext(ctx: ToolContext, ctrlPressed: boolean): SnapContext | null {
  const { guides, showGuides, showGrid, zoom } = ctx.store;
  return buildSnapContext({
    guides,
    showGuides,
    showGrid,
    zoom,
    disabled: ctrlPressed,
  });
}

export const cropTool: ToolHandler = {
  id: 'crop',
  /**
   * 光标跟着悬停位置变：边角给出对应的缩放箭头、框内给移动、框外给十字。
   * 与 hitTest 用同一套判定，所以"看到可拖的箭头"就一定真的拖得动。
   */
  cursor: (ctx) => {
    const rect = ctx.store.cropRect;
    const { cursorPos } = ctx.store;
    if (!rect || !cursorPos) return 'crosshair';
    const handle = hitTest(rect, cursorPos, ctx.store.zoom);
    // 框外还没定下裁剪范围，保持十字方便重新拖一个
    return handle ? cursorFor(handle) : 'crosshair';
  },

  onPointerDown: (pointer, ctx) => {
    const existing = ctx.store.cropRect;
    // 已有裁剪框：判定是否点在控制点或框内，是则进入调整
    if (existing) {
      const handle = hitTest(existing, pointer.point, ctx.store.zoom);
      if (handle) {
        cropDrag = { handle, anchor: pointer.point, start: existing };
        return;
      }
      // 点在框外：重新拖一个新框
      ctx.store.setCropRect(null);
    }
    cropDraft = { start: pointer.point, current: pointer.point };
  },

  onPointerMove: (pointer, ctx) => {
    // 按住 Ctrl 临时关掉吸附，与 PS 一致——用于在参考线附近做微调
    const snap = cropSnapContext(ctx, pointer.ctrlKey);

    if (cropDrag) {
      /*
       * 拖控制点时吸的是**指针**而不是算好的矩形：
       * 指针只驱动用户正在拖的那条（两条）边，没在拖的边不会因为
       * 恰好靠近某条参考线就自己跳走。拖框内平移是例外，见下面。
       */
      const moving = cropDrag.handle === 'inside';
      const current = snap && !moving ? snapPoint(pointer.point, snap) : pointer.point;
      let rect = dragTo({
        start: cropDrag.start,
        anchor: cropDrag.anchor,
        current,
        handle: cropDrag.handle,
        shift: pointer.shiftKey,
        alt: pointer.altKey,
      });
      // 平移整个框时吸的是框的边：指针落在框内哪个位置是随意的，吸指针没意义
      if (snap && moving) rect = snapRectTranslate(rect, snap);
      ctx.store.setCropRect(rect);
      return;
    }

    if (!cropDraft) return;
    cropDraft.current = snap ? snapPoint(pointer.point, snap) : pointer.point;
    ctx.requestOverlayRepaint();
  },

  onPointerUp: (_pointer, ctx) => {
    if (cropDrag) {
      cropDrag = null;
      return;
    }
    const rect = currentCropDraft();
    cropDraft = null;
    if (!rect || rect.width < 2 || rect.height < 2) {
      ctx.requestOverlayRepaint();
      return;
    }
    // 只是建立裁剪框，等用户确认
    ctx.store.setCropRect(rect);
    ctx.store.showToast('toast.cropHint');
  },

  onDoubleClick: (pointer, ctx) => {
    const rect = ctx.store.cropRect;
    if (!rect) return;
    // 双击框内确认，与 PS 一致
    if (hitTest(rect, pointer.point, ctx.store.zoom)) ctx.store.commitCrop();
  },

  onDeactivate: (ctx) => {
    cropDraft = null;
    cropDrag = null;
    /*
     * 切走工具默认放弃裁剪。切到移动工具的情形不会走到这里的实际取消——
     * setTool 已经先调 commitCrop 把 cropRect 清了，这一句成了空操作。
     */
    ctx.store.cancelCrop();
  },
};
