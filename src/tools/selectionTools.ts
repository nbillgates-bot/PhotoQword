/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler, ToolContext } from './types';
import type { Point, Rect, Selection } from '../types';
import type { SelectionMode } from '../types/tools';
import {
  combineSelection,
  ellipseSelection,
  lassoSelection,
  rectSelection,
  wandSelection,
  type SelectionEdgeOptions,
} from '../engine/selection';
import type { ToolOptions } from '../types/tools';
import { flatten, placedPixels } from '../engine/compositor';
import { translateSelection } from '../engine/translateSelection';
import { ctx2d } from '../engine/canvasUtils';
import { CURSORS } from './cursors';

/**
 * 把工具栏上的「羽化 / 消除锯齿」翻译成引擎的边缘参数。
 * 四个选区工具都要用，抽出来免得各写一遍漏掉其中一项。
 */
function edgeOptions(toolOptions: ToolOptions): SelectionEdgeOptions {
  return { feather: toolOptions.featherRadius, antiAlias: toolOptions.selectionAntiAlias };
}

/** 拖拽中的选区草稿，供覆盖层绘制虚线框 */
interface Draft {
  start: Point;
  current: Point;
  points: Point[];
  /** 按下时决定的运算模式（工具栏 + 修饰键综合结果），抬起时用这个而不是重读工具栏 */
  mode: SelectionMode;
}

/**
 * 移动选区的会话。
 *
 * originalSelection 是按下时的选区快照，每帧都从它平移到当前偏移，
 * 而不是在上一帧结果上累加 —— 累加会让取整误差随拖拽越滚越大。
 */
interface MoveSession {
  originalSelection: Selection;
  startPoint: Point;
}

/**
 * 按下时落在选区内、但还没达到拖拽阈值的待定状态。
 *
 * 为什么需要它：按下那一刻就得决定"这次是移动选区还是画新选区"，
 * 不能等第一次 move 事件才判断 —— 鼠标第一个 move 事件的位移通常不足 1px，
 * 判定条件不成立就退化成画新框，于是选区被一个小框顶掉。
 * 这正是"第一下有时不行、拖几下就失效"的原因。
 *
 * 同时又不能一按下就当移动处理：PS 里在选区内单击（不拖）是取消选区。
 * 所以先记成待定，越过阈值才升级为 MoveSession，没越过就在抬起时按单击处理。
 */
interface PendingMove {
  selection: Selection;
  startPoint: Point;
}

/** 超过这个距离（文档像素）才认为是拖拽而非单击 */
const DRAG_THRESHOLD = 2;

let draft: Draft | null = null;
let moveSession: MoveSession | null = null;
let pendingMove: PendingMove | null = null;

/** 点是否在矩形内 */
function isPointInRect(point: Point, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/**
 * 点是否落在选区内。
 *
 * 先用 bounds 快速排除，再查蒙版实际强度。查蒙版是必须的：
 * 椭圆选区的 bounds 是外接矩形，点在四个角上时 bounds 判定为真但实际没选中，
 * PS 在那里按下是画新选区，不是移动。
 */
function isPointInSelection(point: Point, selection: Selection | null): boolean {
  if (!selection) return false;
  if (!isPointInRect(point, selection.bounds)) return false;
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);
  const { mask } = selection;
  if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false;
  // 半透明（羽化边缘）也算在内，与 PS 一致：羽化区按下同样是移动选区
  return ctx2d(mask).getImageData(x, y, 1, 1).data[3] > 0;
}

/** 从按下点到当前点是否已越过拖拽阈值 */
function passedThreshold(from: Point, to: Point): boolean {
  return Math.abs(to.x - from.x) >= DRAG_THRESHOLD || Math.abs(to.y - from.y) >= DRAG_THRESHOLD;
}


/** 当前草稿的矩形（支持任意方向拖拽，shift 锁定正方形，支持样式选项） */
function draftRect(shift: boolean, options: any): Rect {
  if (!draft) return { x: 0, y: 0, width: 0, height: 0 };

  const { marqueeStyle, marqueeRatioW, marqueeRatioH, marqueeSizeW, marqueeSizeH } = options;

  // 固定大小模式
  if (marqueeStyle === 'fixed-size') {
    return {
      x: draft.start.x,
      y: draft.start.y,
      width: marqueeSizeW,
      height: marqueeSizeH,
    };
  }

  let dx = draft.current.x - draft.start.x;
  let dy = draft.current.y - draft.start.y;

  // 固定比例模式或按住 Shift
  if (marqueeStyle === 'fixed-ratio' || shift) {
    const ratio = marqueeStyle === 'fixed-ratio' ? marqueeRatioW / marqueeRatioH : 1;
    const absW = Math.abs(dx);
    const absH = Math.abs(dy);

    // 按照比例约束较大的方向
    if (absW / ratio > absH) {
      dy = Math.sign(dy) * (absW / ratio);
    } else {
      dx = Math.sign(dx) * (absH * ratio);
    }
  }

  return {
    x: Math.min(draft.start.x, draft.start.x + dx),
    y: Math.min(draft.start.y, draft.start.y + dy),
    width: Math.abs(dx),
    height: Math.abs(dy),
  };
}

/** 导出给画布覆盖层：正在拖拽的选区草稿 */
export function currentDraft(): Draft | null {
  return draft;
}

export function currentDraftRect(shift: boolean, options: any): Rect {
  return draftRect(shift, options);
}

/** 矩形/椭圆选框共用逻辑 */
function makeMarqueeTool(
  id: 'marquee-rect' | 'marquee-ellipse',
  build: typeof rectSelection,
  /** 提示里「矩形选区 / 椭圆选区」那部分的词条 key */
  labelKey: string,
): ToolHandler {
  return {
    id,
    cursor: (ctx: ToolContext) => {
      const { cursorPos, selection, toolOptions } = ctx.store;
      if (!cursorPos) return 'crosshair';

      // 决定当前模式（工具栏 + 假设的修饰键，实际按下时才最终决定）
      // 这里只能做近似判断，因为 cursor 函数拿不到修饰键的实时状态
      // PS 的光标会在按住 Shift/Alt 时立即变化，我们暂时只基于工具栏
      const baseMode = toolOptions.selectionMode;

      // 只有在 'new' 模式下，鼠标在选区内才显示移动光标
      if (baseMode === 'new' && selection && isPointInSelection(cursorPos, selection)) {
        return 'move';
      }

      // PS 会在十字准星右下角加 +/–/× 图标表示模式，纯 CSS cursor 做不到
      // 先用基础十字准星，后续可以用 custom cursor data URI 实现图标叠加
      return 'crosshair';
    },
    onPointerDown: (pointer, ctx) => {
      const { selection, toolOptions } = ctx.store;

      /*
       * PS 的修饰键行为：Shift→add、Alt→subtract、Shift+Alt→intersect，优先级高于工具栏设置。
       * Shift 的双重用途：按下时决定模式（add），拖拽中按住则约束正方形（draftRect 处理）。
       * Shift 仅在有既有选区时才切成 add，否则只起正方形约束作用。
       */
      let resolvedMode: SelectionMode = toolOptions.selectionMode;
      if (pointer.shiftKey && pointer.altKey) {
        resolvedMode = 'intersect';
      } else if (pointer.altKey) {
        resolvedMode = 'subtract';
      } else if (pointer.shiftKey && selection) {
        resolvedMode = 'add';
      }

      /*
       * 按下的瞬间就分流，不留到 move 事件里判断。
       * 只有 resolved 为 new 时在选区内按下才是移动选区；add/subtract/intersect
       * 即使按在选区内也一律画新框去做运算，与 PS 一致。
       */
      if (resolvedMode === 'new' && selection && isPointInSelection(pointer.point, selection)) {
        pendingMove = { selection, startPoint: pointer.point };
        return;
      }
      draft = { start: pointer.point, current: pointer.point, points: [], mode: resolvedMode };
    },
    onPointerMove: (pointer, ctx) => {
      // 待定：越过阈值才升级成真正的移动，避免把单击误判成移动
      if (pendingMove) {
        if (!passedThreshold(pendingMove.startPoint, pointer.point)) return;
        moveSession = {
          originalSelection: pendingMove.selection,
          startPoint: pendingMove.startPoint,
        };
        pendingMove = null;
      }

      if (moveSession) {
        const dx = Math.round(pointer.point.x - moveSession.startPoint.x);
        const dy = Math.round(pointer.point.y - moveSession.startPoint.y);
        // 每帧都从按下时的快照平移，不在上一帧结果上累加
        const next = translateSelection(moveSession.originalSelection, dx, dy);
        // 全部拖出画布时保留上一帧，不把选区抹掉
        if (next) {
          ctx.store.setSelection(next);
          ctx.requestOverlayRepaint();
        }
        return;
      }

      if (!draft) return;
      draft.current = pointer.point;
      ctx.requestOverlayRepaint();
    },
    onPointerUp: (pointer, ctx) => {
      /*
       * 在选区内按下但没拖动：PS 的行为是取消选区。
       * pendingMove 还在说明位移没越过阈值，按单击处理。
       */
      if (pendingMove) {
        pendingMove = null;
        ctx.store.setSelection(null);
        ctx.requestOverlayRepaint();
        return;
      }

      /*
       * 结束移动选区。
       *
       * PS 会把"移动选区"记进历史面板，这里没有压历史：本项目的历史快照只存
       * 图层像素，回退时固定把 selection 置空（见 historySlice），压进去只会得到
       * 一条"撤销后选区消失"的错误记录，还要白白快照一遍全部像素。
       * 要对齐 PS 得先让历史条目带上选区快照，那是独立改动。
       */
      if (moveSession) {
        moveSession = null;
        return;
      }

      // 结束创建选区
      if (!draft) return;
      const rect = draftRect(pointer.shiftKey, ctx.store.toolOptions);
      const resolvedMode = draft.mode; // 用按下时决定的模式，不重读工具栏
      draft = null;
      const { doc, selection } = ctx.store;
      if (!doc) return;
      // 点击而非拖拽：视为取消选区（固定大小模式除外）
      if (ctx.store.toolOptions.marqueeStyle !== 'fixed-size' && (rect.width < 1 || rect.height < 1)) {
        ctx.store.setSelection(null);
        ctx.requestOverlayRepaint();
        return;
      }
      const next = build(doc.width, doc.height, rect, edgeOptions(ctx.store.toolOptions));
      ctx.store.setSelection(combineSelection(selection, next, resolvedMode));
      ctx.store.showToast('toast.selectionMade', 'info', { width: Math.round(rect.width), height: Math.round(rect.height) }, { kind: labelKey });
      ctx.requestOverlayRepaint();
    },
    onDeactivate: () => {
      draft = null;
      moveSession = null;
      pendingMove = null;
    },
  };
}

export const marqueeRectTool = makeMarqueeTool('marquee-rect', rectSelection, 'selection.rect');
export const marqueeEllipseTool = makeMarqueeTool('marquee-ellipse', ellipseSelection, 'selection.ellipse');

/** 套索：记录轨迹点，抬手时闭合成多边形 */
export const lassoTool: ToolHandler = {
  id: 'lasso',
  cursor: CURSORS.lasso,
  onPointerDown: (pointer, ctx) => {
    const { selection, toolOptions } = ctx.store;
    let resolvedMode: SelectionMode = toolOptions.selectionMode;
    if (pointer.shiftKey && pointer.altKey) {
      resolvedMode = 'intersect';
    } else if (pointer.altKey) {
      resolvedMode = 'subtract';
    } else if (pointer.shiftKey && selection) {
      resolvedMode = 'add';
    }
    draft = { start: pointer.point, current: pointer.point, points: [pointer.point], mode: resolvedMode };
  },
  onPointerMove: (pointer, ctx) => {
    if (!draft) return;
    const last = draft.points[draft.points.length - 1];
    // 稀疏采样，控制顶点数量
    if (Math.hypot(pointer.point.x - last.x, pointer.point.y - last.y) < 2) return;
    draft.points.push(pointer.point);
    draft.current = pointer.point;
    ctx.requestOverlayRepaint();
  },
  onPointerUp: (_pointer, ctx) => {
    if (!draft) return;
    const points = draft.points;
    const resolvedMode = draft.mode;
    draft = null;
    const { doc, toolOptions, selection } = ctx.store;
    if (!doc) return;
    if (points.length < 3) {
      ctx.store.setSelection(null);
      ctx.requestOverlayRepaint();
      return;
    }
    const next = lassoSelection(doc.width, doc.height, points, edgeOptions(toolOptions));
    ctx.store.setSelection(combineSelection(selection, next, resolvedMode));
    ctx.requestOverlayRepaint();
  },
  onDeactivate: () => {
    draft = null;
  },
};

/** 多边形套索模式 */
type PolygonMode = 'drawing' | 'closed';

/** 多边形套索的会话状态 */
interface PolygonSession {
  mode: PolygonMode;
  points: Point[];
  /** 运算模式（按下第一个点时决定） */
  selectionMode: SelectionMode;
}

let polygonSession: PolygonSession | null = null;

/** 点击到起点的距离阈值（像素），小于此值视为闭合 */
const CLOSE_THRESHOLD = 8;

/**
 * 多边形套索：点击放置顶点，线段连接，双击/回车/点击起点闭合。
 *
 * PS 的行为：
 * - 单击放点，画直线段到下一点
 * - 双击当前位置闭合
 * - 点击起点附近闭合
 * - Esc 取消
 * - 按住 Shift 锁定 45° 角
 */
export const polygonLassoTool: ToolHandler = {
  id: 'polygon-lasso',
  cursor: CURSORS['polygon-lasso'],
  onPointerDown: (pointer, ctx) => {
    const { selection, toolOptions } = ctx.store;

    // 已有会话：检查是否点击起点闭合
    if (polygonSession && polygonSession.points.length > 2) {
      const first = polygonSession.points[0];
      const dist = Math.hypot(pointer.point.x - first.x, pointer.point.y - first.y);
      if (dist < CLOSE_THRESHOLD) {
        // 闭合并生成选区
        const points = polygonSession.points;
        const mode = polygonSession.selectionMode;
        polygonSession = null;
        const { doc } = ctx.store;
        if (!doc) return;
        const next = lassoSelection(doc.width, doc.height, points, edgeOptions(toolOptions));
        ctx.store.setSelection(combineSelection(selection, next, mode));
        ctx.requestOverlayRepaint();
        return;
      }
    }

    // 新会话或追加点
    if (!polygonSession) {
      let resolvedMode: SelectionMode = toolOptions.selectionMode;
      if (pointer.shiftKey && pointer.altKey) {
        resolvedMode = 'intersect';
      } else if (pointer.altKey) {
        resolvedMode = 'subtract';
      } else if (pointer.shiftKey && selection) {
        resolvedMode = 'add';
      }
      polygonSession = {
        mode: 'drawing',
        points: [pointer.point],
        selectionMode: resolvedMode,
      };
    } else {
      let nextPoint = pointer.point;
      // 按住 Shift：锁定 45° 角
      if (pointer.shiftKey && polygonSession.points.length > 0) {
        const last = polygonSession.points[polygonSession.points.length - 1];
        nextPoint = snapTo45Degrees(last, pointer.point);
      }
      polygonSession.points.push(nextPoint);
    }
    ctx.requestOverlayRepaint();
  },
  onPointerMove: (_pointer, ctx) => {
    // 只在有会话时更新预览鼠标位置
    if (polygonSession) {
      ctx.requestOverlayRepaint();
    }
  },
  onPointerUp: () => {
    // 多边形套索不在 up 时做任何事，全靠 down 和 dblclick
  },
  onDoubleClick: (_pointer, ctx) => {
    // 双击闭合
    if (!polygonSession || polygonSession.points.length < 3) {
      polygonSession = null;
      ctx.requestOverlayRepaint();
      return;
    }
    const points = polygonSession.points;
    const mode = polygonSession.selectionMode;
    const { doc, toolOptions, selection } = ctx.store;
    polygonSession = null;
    if (!doc) return;
    const next = lassoSelection(doc.width, doc.height, points, edgeOptions(toolOptions));
    ctx.store.setSelection(combineSelection(selection, next, mode));
    ctx.requestOverlayRepaint();
  },
  onDeactivate: (ctx) => {
    // 工具切换时清空未完成的会话
    if (polygonSession) {
      polygonSession = null;
      ctx.requestOverlayRepaint();
    }
  },
};

/** 将点吸附到相对参考点的 45° 角线上 */
function snapTo45Degrees(from: Point, to: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const abs_dx = Math.abs(dx);
  const abs_dy = Math.abs(dy);

  // 八个方向：0°, 45°, 90°, 135°, 180°, 225°, 270°, 315°
  if (abs_dx > abs_dy * 2) {
    // 接近水平
    return { x: to.x, y: from.y };
  } else if (abs_dy > abs_dx * 2) {
    // 接近垂直
    return { x: from.x, y: to.y };
  } else {
    // 接近 45° 对角线
    const dist = Math.min(abs_dx, abs_dy);
    return {
      x: from.x + Math.sign(dx) * dist,
      y: from.y + Math.sign(dy) * dist,
    };
  }
}

/** 导出多边形套索的当前会话，供覆盖层绘制 */
export function currentPolygonSession(): PolygonSession | null {
  return polygonSession;
}

/** 魔棒：基于当前图层或所有图层（选项决定）取样 */
export const wandTool: ToolHandler = {
  id: 'wand',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    const { doc, layers, toolOptions, selection } = ctx.store;
    const layer = ctx.store.activeLayer();
    if (!doc || !layer) return;

    let resolvedMode: SelectionMode = toolOptions.selectionMode;
    if (pointer.shiftKey && pointer.altKey) {
      resolvedMode = 'intersect';
    } else if (pointer.shiftKey && selection) {
      resolvedMode = 'add';
    } else if (pointer.altKey && selection) {
      resolvedMode = 'subtract';
    }

    // 取样源：选项决定用当前图层还是所有图层合成
    const source = toolOptions.wandSampleAllLayers
      ? flatten(layers, doc.width, doc.height)
      : placedPixels(layer, doc.width, doc.height);

    const next = wandSelection(source, pointer.point, {
      tolerance: toolOptions.wandTolerance,
      sampleSize: toolOptions.wandSampleSize,
      contiguous: toolOptions.wandContiguous,
      antiAlias: toolOptions.selectionAntiAlias,
    });
    if (!next) {
      ctx.store.showToast('error.selection.noPixels', 'error');
      return;
    }
    ctx.store.setSelection(combineSelection(selection, next, resolvedMode));
    ctx.requestOverlayRepaint();
  },
};
