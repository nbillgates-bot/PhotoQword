/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect, ShapeData, ShapeKind } from '../types';
import { clearCanvas, ctx2d } from './canvasUtils';

/** 生成星形顶点 */
function starPath(context: CanvasRenderingContext2D, rect: Rect, points: number): void {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const outerX = rect.width / 2;
  const outerY = rect.height / 2;
  const step = Math.PI / points;
  context.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const ratio = i % 2 === 0 ? 1 : 0.45;
    const angle = i * step - Math.PI / 2;
    const x = cx + Math.cos(angle) * outerX * ratio;
    const y = cy + Math.sin(angle) * outerY * ratio;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

/** 圆角矩形 */
function roundRectPath(context: CanvasRenderingContext2D, rect: Rect, radius: number): void {
  const r = Math.min(radius, Math.abs(rect.width) / 2, Math.abs(rect.height) / 2);
  context.beginPath();
  context.roundRect(rect.x, rect.y, rect.width, rect.height, r);
}

/** 生成正多边形顶点 */
function polygonPath(context: CanvasRenderingContext2D, rect: Rect, sides: number): void {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const rx = rect.width / 2;
  const ry = rect.height / 2;
  context.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * rx;
    const y = cy + Math.sin(angle) * ry;
    if (i === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

/** 按形状种类构建路径 */
export function shapePath(context: CanvasRenderingContext2D, data: ShapeData): void {
  const { rect, kind } = data;
  switch (kind) {
    case 'rect':
      if (data.radius > 0) roundRectPath(context, rect, data.radius);
      else {
        context.beginPath();
        context.rect(rect.x, rect.y, rect.width, rect.height);
      }
      break;
    case 'ellipse':
      context.beginPath();
      context.ellipse(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
        Math.abs(rect.width / 2),
        Math.abs(rect.height / 2),
        0,
        0,
        Math.PI * 2,
      );
      break;
    case 'line':
      context.beginPath();
      context.moveTo(rect.x, rect.y);
      context.lineTo(rect.x + rect.width, rect.y + rect.height);
      break;
    case 'triangle':
      polygonPath(context, rect, 3);
      break;
    case 'star':
      starPath(context, rect, Math.max(3, data.points));
      break;
    case 'polygon':
      polygonPath(context, rect, Math.max(3, data.points));
      break;
  }
}

/** 把形状绘制到给定上下文 */
export function drawShape(context: CanvasRenderingContext2D, data: ShapeData): void {
  context.save();
  shapePath(context, data);
  if (data.filled && data.kind !== 'line') {
    context.fillStyle = data.fill;
    context.fill();
  }
  if (data.strokeWidth > 0) {
    context.strokeStyle = data.stroke;
    context.lineWidth = data.strokeWidth;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.stroke();
  }
  context.restore();
}

/** 渲染形状图层（清空后重绘，支持再编辑） */
export function renderShape(canvas: HTMLCanvasElement, data: ShapeData): void {
  clearCanvas(canvas);
  drawShape(ctx2d(canvas), data);
}

/** label 存词条 key —— engine 不认识语言，翻译由 UI 层做（I18N.md §2.3）*/
export const SHAPE_KINDS: { value: ShapeKind; label: string }[] = [
  { value: 'rect', label: 'shape.rect' },
  { value: 'ellipse', label: 'shape.ellipse' },
  { value: 'line', label: 'shape.line' },
  { value: 'triangle', label: 'shape.triangle' },
  { value: 'star', label: 'shape.star' },
  { value: 'polygon', label: 'shape.polygon' },
];
