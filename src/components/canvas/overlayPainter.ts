/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Rect, Selection, ToolId, Guide } from '../../types';
import type { ToolOptions } from '../../types/tools';
import type { BrushRing } from '../../engine/brushRing';
import { ringForTool } from '../../tools/brushCursorDefs';
import { currentDraft, currentDraftRect, currentPolygonSession } from '../../tools/selectionTools';
import { currentGradientDraft } from '../../tools/fillTools';
import { currentShapeDraft, draftShapeData } from '../../tools/shapeTool';
import { currentCropDraft } from '../../tools/viewTools';
import { cloneSourcePoint } from '../../tools/cloneTool';
import { drawShape } from '../../engine/shapeRender';
import type { OutlineSegment } from '../../engine/selectionOutline';
import { selectionOutline } from '../../engine/selectionOutline';
import { getTool } from '../../tools/registry';
import { createToolContext } from '../../tools/toolContext';
import { floatDragActive } from '../../tools/moveTool';
import {
  centerOf,
  cornerPositions,
  handlePositions,
  type TransformState,
} from '../../engine/transformBox';

interface PaintArgs {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  zoom: number;
  tool: ToolId;
  selection: Selection | null;
  toolOptions: ToolOptions;
  foreground: string;
  background: string;
  shiftKey: boolean;
  /** 当前文档 id。仿制源标记要靠它判断取样点是不是本文档的 */
  docId: string;
  /** 已确认的裁剪框，有它时优先于首次拖拽的草稿 */
  cropRect: Rect | null;
  /** 自由变换状态。与工具无关——变换会话开着就该画 */
  transformState: TransformState | null;
  /** 指针位置（文档坐标）。笔刷环画在这里，指针移出画布时为 null */
  cursorPos: Point | null;
  /** 参考线列表 */
  guides: Guide[];
  /** 是否显示参考线 */
  showGuides: boolean;
}

/**
 * 笔刷环：跟着指针走的轮廓，提示这一笔会覆盖多大范围。
 *
 * 双描边（白底黑线）保证在任何画面上都看得见——只画一条黑线在深色图上就没了。
 * 环画在覆盖层而不是用 CSS 光标，因为它要跟着笔刷尺寸和缩放实时变，
 * 而各浏览器的 CSS 光标图像有 32px 上限，大笔刷画不出来。
 */
function paintBrushRing(
  context: CanvasRenderingContext2D,
  at: Point,
  ring: BrushRing,
  zoom: number,
): void {
  context.save();
  context.lineWidth = 1 / zoom;
  const trace = () => {
    context.beginPath();
    if (ring.square) {
      context.rect(at.x - ring.radius, at.y - ring.radius, ring.radius * 2, ring.radius * 2);
    } else {
      context.arc(at.x, at.y, ring.radius, 0, Math.PI * 2);
    }
  };
  trace();
  context.strokeStyle = 'rgba(255,255,255,0.9)';
  context.stroke();
  trace();
  context.strokeStyle = 'rgba(0,0,0,0.65)';
  context.setLineDash([3 / zoom, 3 / zoom]);
  context.stroke();
  context.restore();
}

/** 画蚂蚁线：白底 + 黑虚线，任何背景上都看得见 */
function marchingRect(context: CanvasRenderingContext2D, rect: Rect, zoom: number): void {
  const dash = 4 / zoom;
  context.save();
  context.lineWidth = 1 / zoom;
  context.strokeStyle = '#ffffff';
  context.setLineDash([]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.strokeStyle = '#000000';
  context.setLineDash([dash, dash]);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

/**
 * 沿选区实际轮廓画 PS 风格蚂蚁线：白色实线底 + 黑色行进虚线。
 *
 * 描的是 selectionOutline 给出的每一段边，不是外接矩形，
 * 所以互不相连的多块选区各自成框（"添加到选区"画两个矩形时该有的样子）。
 * lineDashOffset 随时间变化产生行进动画。
 *
 * dash 长度从 4 改成 2.5，让虚线更密集，更接近 PS 的精细感。
 */
function marchingAnts(
  context: CanvasRenderingContext2D,
  segments: OutlineSegment[],
  zoom: number,
): void {
  if (segments.length === 0) return;
  const dash = 2.5 / zoom;

  const trace = () => {
    context.beginPath();
    for (const s of segments) {
      context.moveTo(s.x1, s.y1);
      context.lineTo(s.x2, s.y2);
    }
  };

  context.save();
  context.lineWidth = 1 / zoom;

  // 白色实线底：让蚂蚁线在深色画面上也看得见
  context.strokeStyle = '#ffffff';
  context.setLineDash([]);
  trace();
  context.stroke();

  // 黑色虚线压在白底上，交替处露出白色，就是 PS 的黑白蚂蚁
  context.strokeStyle = '#000000';
  context.setLineDash([dash, dash]);
  context.lineDashOffset = -(Date.now() / 50) % (dash * 2);
  trace();
  context.stroke();

  context.restore();
}

/**
 * 轮廓缓存。蚂蚁线要靠每帧重绘产生行进动画，但轮廓本身只在选区变了才需要重算，
 * 不缓存就是每帧一次 getImageData，大选区拖动时会明显掉帧。
 * 选区是不可变对象（改动一律换新对象），所以拿 mask 引用当键就够。
 */
let outlineCache: { mask: HTMLCanvasElement; segments: OutlineSegment[] } | null = null;

function cachedOutline(selection: Selection): OutlineSegment[] {
  if (outlineCache?.mask === selection.mask) return outlineCache.segments;
  const segments = selectionOutline(selection.mask, selection.bounds);
  outlineCache = { mask: selection.mask, segments };
  return segments;
}

/**
 * 画选区的蚂蚁线。PS 只有线，没有填充色，所以这里也只画线。
 * 之前叠加的半透明白色会让选区内图像变亮，与 PS 不符，已去掉。
 */
function paintSelection(
  context: CanvasRenderingContext2D,
  selection: Selection,
  zoom: number,
): void {
  marchingAnts(context, cachedOutline(selection), zoom);
}

/** 裁剪预览：暗化保留区之外 */
/**
 * 画八个控制点。裁剪框和自由变换框共用，
 * 位置必须与 engine/handleBox 的 hitTest 判定一致，否则看得见却拖不动。
 */
function paintHandles(context: CanvasRenderingContext2D, rect: Rect, zoom: number): void {
  const size = 7 / zoom;
  const half = size / 2;
  const mx = rect.x + rect.width / 2;
  const my = rect.y + rect.height / 2;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const points = [
    { x: rect.x, y: rect.y },
    { x: mx, y: rect.y },
    { x: right, y: rect.y },
    { x: right, y: my },
    { x: right, y: bottom },
    { x: mx, y: bottom },
    { x: rect.x, y: bottom },
    { x: rect.x, y: my },
  ];

  context.save();
  context.lineWidth = 1 / zoom;
  points.forEach((point) => {
    context.fillStyle = '#ffffff';
    context.fillRect(point.x - half, point.y - half, size, size);
    context.strokeStyle = '#000000';
    context.strokeRect(point.x - half, point.y - half, size, size);
  });
  context.restore();
}

/**
 * 自由变换框：实线四边形 + 八个控制点 + 中心参考点。
 * 不压暗画布（变换不像裁剪那样要强调取舍）。
 *
 * 画四边形而不是 strokeRect：框可能带旋转和斜切，那时它不是轴对齐矩形。
 * 顶点和控制点位置都由 engine 算，这里只描边。
 */
function paintTransformBox(
  context: CanvasRenderingContext2D,
  state: TransformState,
  zoom: number,
): void {
  const corners = cornerPositions(state);
  context.save();
  context.lineWidth = 1 / zoom;
  context.strokeStyle = '#4a9eff';
  context.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.closePath();
  context.stroke();

  // 中心参考点，PS 也画它，用来提示旋转和斜切绕哪转
  const center = centerOf(state.rect);
  const radius = 3 / zoom;
  context.beginPath();
  context.moveTo(center.x - radius, center.y);
  context.lineTo(center.x + radius, center.y);
  context.moveTo(center.x, center.y - radius);
  context.lineTo(center.x, center.y + radius);
  context.stroke();
  context.restore();

  const size = 7 / zoom;
  const half = size / 2;
  context.save();
  context.lineWidth = 1 / zoom;
  handlePositions(state).forEach(({ point }) => {
    context.fillStyle = '#ffffff';
    context.fillRect(point.x - half, point.y - half, size, size);
    context.strokeStyle = '#000000';
    context.strokeRect(point.x - half, point.y - half, size, size);
  });
  context.restore();
}

/**
 * 清空整张覆盖层。
 *
 * 必须先把变换矩阵复位:带矩阵的 clearRect 只能清到文档那块区域,
 * 而覆盖层现在是视口尺寸的,文档之外那一圈会留着上一帧的残影
 * (缩小时表现为画布外侧挂着几条断掉的蚂蚁线)。
 */
function clearAll(context: CanvasRenderingContext2D): void {
  const saved = context.getTransform();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.setTransform(saved);
}

function paintCrop(
  context: CanvasRenderingContext2D,
  rect: Rect,
  width: number,
  height: number,
  zoom: number,
): void {
  context.save();
  context.fillStyle = 'rgba(0,0,0,0.5)';
  context.beginPath();
  context.rect(0, 0, width, height);
  context.rect(rect.x, rect.y, rect.width, rect.height);
  context.fill('evenodd');
  context.restore();

  marchingRect(context, rect, zoom);

  // 三分线
  context.save();
  context.strokeStyle = 'rgba(255,255,255,0.4)';
  context.lineWidth = 1 / zoom;
  for (let i = 1; i < 3; i += 1) {
    const x = rect.x + (rect.width / 3) * i;
    const y = rect.y + (rect.height / 3) * i;
    context.beginPath();
    context.moveTo(x, rect.y);
    context.lineTo(x, rect.y + rect.height);
    context.moveTo(rect.x, y);
    context.lineTo(rect.x + rect.width, y);
    context.stroke();
  }
  context.restore();

  paintHandles(context, rect, zoom);
}

/**
 * 在覆盖层上绘制所有工具的实时反馈。
 *
 * 所有坐标都是**文档坐标**，缩放由调用方装在 context 上的变换矩阵负责
 * （见 engine/viewportRender.ts）。线宽一律写 `1 / zoom`，
 * 乘上矩阵之后正好是 1 个 CSS 像素——蚂蚁线、控制点这类 UI 元素
 * 在任何缩放下都该是同样的粗细，与 PS 一致。
 */
export function paintOverlay(args: PaintArgs): void {
  const { context, width, height, zoom, tool, selection, toolOptions } = args;
  clearAll(context);

  /*
   * 现有选区。两种情况要跳过：
   * 一是拖动浮动块期间，store 里的选区还在原位（要等抬手才更新），
   * 这里再画一份就会和 moveTool 跟着块走的那份同时出现，画面上两个框；
   * 二是变换会话开着时，PS 只显示变换框，蚂蚁线还留在原位会让人以为选区没跟着变。
   */
  if (selection && !floatDragActive() && !args.transformState) {
    paintSelection(context, selection, zoom);
  }

  // 选框类工具的拖拽草稿
  if (tool === 'marquee-rect' || tool === 'marquee-ellipse') {
    const draft = currentDraft();
    if (draft) {
      const rect = currentDraftRect(args.shiftKey, args.toolOptions);
      if (tool === 'marquee-rect') {
        marchingRect(context, rect, zoom);
      } else {
        context.save();
        context.lineWidth = 1 / zoom;
        context.strokeStyle = '#ffffff';
        context.beginPath();
        context.ellipse(
          rect.x + rect.width / 2,
          rect.y + rect.height / 2,
          rect.width / 2,
          rect.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
        context.setLineDash([4 / zoom, 4 / zoom]);
        context.strokeStyle = '#000000';
        context.stroke();
        context.restore();
      }
    }
  }

  // 套索轨迹
  if (tool === 'lasso') {
    const draft = currentDraft();
    if (draft && draft.points.length > 1) {
      context.save();
      context.lineWidth = 1 / zoom;
      context.strokeStyle = '#ffffff';
      context.beginPath();
      context.moveTo(draft.points[0].x, draft.points[0].y);
      draft.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      context.stroke();
      context.setLineDash([4 / zoom, 4 / zoom]);
      context.strokeStyle = '#000000';
      context.stroke();
      context.restore();
    }
  }

  // 多边形套索：已放置的点连线 + 鼠标悬停预览
  if (tool === 'polygon-lasso') {
    const session = currentPolygonSession();
    if (session && session.points.length > 0) {
      context.save();
      context.lineWidth = 1 / zoom;
      context.strokeStyle = '#ffffff';
      context.beginPath();
      context.moveTo(session.points[0].x, session.points[0].y);
      session.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
      // 画到鼠标当前位置的预览线
      if (args.cursorPos) {
        context.lineTo(args.cursorPos.x, args.cursorPos.y);
      }
      context.stroke();
      context.setLineDash([4 / zoom, 4 / zoom]);
      context.strokeStyle = '#000000';
      context.stroke();
      context.restore();

      // 起点标记（绿色小圆），点击它闭合选区
      if (session.points.length > 2) {
        const first = session.points[0];
        context.save();
        context.fillStyle = '#00ff00';
        context.beginPath();
        context.arc(first.x, first.y, 4 / zoom, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    }
  }

  // 裁剪框。已确认的框（cropRect）优先，否则画首次拖拽的草稿
  if (tool === 'crop') {
    const rect = args.cropRect ?? currentCropDraft();
    if (rect && rect.width > 0) paintCrop(context, rect, width, height, zoom);
  }

  // 自由变换框
  if (args.transformState) paintTransformBox(context, args.transformState, zoom);

  // 渐变方向指示
  if (tool === 'gradient') {
    const draft = currentGradientDraft();
    if (draft) {
      context.save();
      context.lineWidth = 1.5 / zoom;
      context.strokeStyle = '#ffffff';
      context.setLineDash([6 / zoom, 3 / zoom]);
      context.beginPath();
      context.moveTo(draft.start.x, draft.start.y);
      context.lineTo(draft.current.x, draft.current.y);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#ffffff';
      [draft.start, draft.current].forEach((point) => {
        context.beginPath();
        context.arc(point.x, point.y, 3 / zoom, 0, Math.PI * 2);
        context.fill();
      });
      context.restore();
    }
  }

  // 形状预览
  if (tool === 'shape') {
    const draft = currentShapeDraft();
    if (draft) {
      const data = draftShapeData(
        draft.start,
        draft.current,
        args.shiftKey,
        toolOptions,
        args.foreground,
        toolOptions.shapeStrokeWidth > 0 ? args.background : args.foreground,
      );
      context.save();
      context.globalAlpha = 0.85;
      drawShape(context, data);
      context.restore();
    }
  }

  // 仿制源标记
  if (tool === 'clone') {
    const source = cloneSourcePoint(args.docId);
    if (source) {
      context.save();
      context.strokeStyle = '#4a9eff';
      context.lineWidth = 1.5 / zoom;
      const r = 6 / zoom;
      context.beginPath();
      context.moveTo(source.x - r, source.y);
      context.lineTo(source.x + r, source.y);
      context.moveTo(source.x, source.y - r);
      context.lineTo(source.x, source.y + r);
      context.stroke();
      context.restore();
    }
  }

  // 笔刷环放最后：它是跟手的反馈，被别的东西盖住就失去意义
  if (args.cursorPos) {
    const ring = ringForTool(tool, toolOptions, zoom);
    if (ring) paintBrushRing(context, args.cursorPos, ring, zoom);
  }

  // 参考线（Guides）：PS 里从标尺拖出的辅助线，用于对齐
  if (args.showGuides && args.guides.length > 0) {
    context.save();
    context.strokeStyle = '#00ffff'; // PS 默认青色
    context.lineWidth = 1 / zoom; // 恒为 1 屏幕像素，与 PS 一致
    context.setLineDash([]); // 实线
    for (const guide of args.guides) {
      context.beginPath();
      if (guide.orientation === 'h') {
        // 水平线：画在 y + 0.5 位置让浏览器渲染出锐利的 1px 线
        const y = Math.floor(guide.position) + 0.5;
        context.moveTo(0, y);
        context.lineTo(width, y);
      } else {
        // 垂直线：同样偏移 0.5 保证锐利
        const x = Math.floor(guide.position) + 0.5;
        context.moveTo(x, 0);
        context.lineTo(x, height);
      }
      context.stroke();
    }
    context.restore();
  }

  // 工具自己的 overlay 绘制（例如移动工具的浮动块）
  const handler = getTool(tool);
  if (handler.drawOverlay) {
    handler.drawOverlay(context, createToolContext(() => {}), zoom);
  }
}
