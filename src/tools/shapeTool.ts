/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { shapeLayerName } from '../i18n/defaultNames';
import type { ToolHandler } from './types';
import type { Point, Rect, ShapeData } from '../types';
import { renderShape } from '../engine/shapeRender';

let draft: { start: Point; current: Point } | null = null;

export function currentShapeDraft(): { start: Point; current: Point } | null {
  return draft;
}

/** 由起止点算出矩形，shift 锁定等比 */
function rectFrom(start: Point, current: Point, shift: boolean): Rect {
  let dx = current.x - start.x;
  let dy = current.y - start.y;
  if (shift) {
    const size = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx) * size;
    dy = Math.sign(dy) * size;
  }
  return { x: start.x, y: start.y, width: dx, height: dy };
}

/** 供覆盖层预览用的形状数据 */
export function draftShapeData(
  start: Point,
  current: Point,
  shift: boolean,
  options: {
    shapeKind: ShapeData['kind'];
    shapeFilled: boolean;
    shapeStrokeWidth: number;
    shapeRadius: number;
    shapePoints: number;
  },
  fill: string,
  stroke: string,
): ShapeData {
  return {
    kind: options.shapeKind,
    rect: rectFrom(start, current, shift),
    fill,
    stroke,
    strokeWidth: options.shapeStrokeWidth,
    filled: options.shapeFilled,
    radius: options.shapeRadius,
    points: options.shapePoints,
  };
}

/**
 * 形状工具。抬手时新建一个形状图层，
 * 形状参数保留在 layer.shapeData 上，之后可在属性面板里继续改。
 */
export const shapeTool: ToolHandler = {
  id: 'shape',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    if (!ctx.store.doc) return;
    draft = { start: pointer.point, current: pointer.point };
  },
  onPointerMove: (pointer, ctx) => {
    if (!draft) return;
    draft.current = pointer.point;
    ctx.requestOverlayRepaint();
  },
  onPointerUp: (pointer, ctx) => {
    if (!draft) return;
    const { start, current } = draft;
    draft = null;
    const { toolOptions, foreground, background } = ctx.store;
    const rect = rectFrom(start, current, pointer.shiftKey);
    if (Math.abs(rect.width) < 2 && Math.abs(rect.height) < 2) {
      ctx.requestOverlayRepaint();
      return;
    }

    // 用 insertLayer 而不是 addLayer：新建图层与画上形状要合成一条历史，
    // 否则撤销一次只擦掉形状、留下一个空图层
    const layer = ctx.store.insertLayer('shape', shapeLayerName(ctx.store.locale));
    if (!layer) return;
    const shapeData = draftShapeData(
      start,
      current,
      pointer.shiftKey,
      toolOptions,
      foreground,
      // 未开描边时描边色不生效，这里仍记录背景色便于之后调整
      toolOptions.shapeStrokeWidth > 0 ? background : foreground,
    );
    renderShape(layer.canvas, shapeData);
    ctx.store.updateLayer(layer.id, { shapeData });
    ctx.store.pushHistory('action.drawShape');
    ctx.store.bumpRevision();
  },
  onDeactivate: () => {
    draft = null;
  },
};
