/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler } from './types';
import type { Point } from '../types';
import { cloneCanvas, createCanvas, ctx2d } from '../engine/canvasUtils';
import { pixelBlockReason } from '../engine/layerLock';
import { CURSORS } from './cursors';

/**
 * 仿制图章。alt + 单击设定取样点，
 * 之后拖拽时按"当前点 - 取样点"的固定偏移搬运像素。
 */
let session: {
  origin: HTMLCanvasElement;
  offset: Point;
  layerId: string;
  /** 文档坐标 -> 画布坐标要加的量，等于 -bounds.x/-bounds.y */
  shift: Point;
} | null = null;

/**
 * 取样点连同它所属的文档 id 一起记。
 * 取样点是文档坐标，换了文档就没有意义了，但工具切换时应当保留（PS 也是如此），
 * 所以不能在 onDeactivate 里清掉，只能靠 docId 判断它是否还有效。
 */
let source: { point: Point; docId: string } | null = null;

/** 当前文档里有效的取样点，跨文档的旧取样点视为不存在 */
function sourceFor(docId: string | undefined): Point | null {
  if (!source || !docId || source.docId !== docId) return null;
  return source.point;
}

export function cloneSourcePoint(docId?: string): Point | null {
  // 不传 docId 时沿用旧行为，供覆盖层直接取点
  if (docId === undefined) return source?.point ?? null;
  return sourceFor(docId);
}

/** 文档坐标 -> 画布坐标 */
function shifted(point: Point, shift: Point): Point {
  return { x: point.x + shift.x, y: point.y + shift.y };
}

/** 在一处盖下仿制笔迹。所有坐标都是画布坐标 */
function stamp(
  target: HTMLCanvasElement,
  origin: HTMLCanvasElement,
  at: Point,
  offset: Point,
  size: number,
): void {
  const patch = createCanvas(size, size);
  const patchCtx = ctx2d(patch);
  patchCtx.drawImage(
    origin,
    at.x - offset.x - size / 2,
    at.y - offset.y - size / 2,
    size,
    size,
    0,
    0,
    size,
    size,
  );
  // 圆形软边蒙版
  patchCtx.globalCompositeOperation = 'destination-in';
  const radius = size / 2;
  const gradient = patchCtx.createRadialGradient(radius, radius, radius * 0.5, radius, radius, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  patchCtx.fillStyle = gradient;
  patchCtx.fillRect(0, 0, size, size);

  ctx2d(target).drawImage(patch, at.x - radius, at.y - radius);
}

export const cloneTool: ToolHandler = {
  id: 'clone',
  cursor: CURSORS.stamp,
  onPointerDown: (pointer, ctx) => {
    const layer = ctx.store.activeLayer();
    const doc = ctx.store.doc;
    if (!layer || !doc) return;

    // alt 单击：设定取样点
    if (pointer.altKey) {
      source = { point: pointer.point, docId: doc.id };
      ctx.store.showToast('toast.cloneSourceSet');
      ctx.requestOverlayRepaint();
      return;
    }
    const origin = sourceFor(doc.id);
    if (!origin) {
      ctx.store.showToast('error.clone.noSource', 'error');
      return;
    }
    const blocked = pixelBlockReason(layer);
    if (blocked) {
      ctx.store.showToast(blocked, 'error');
      return;
    }

    // 取样与落笔都在文档坐标系里，先把图层撑到覆盖文档，再换算到画布坐标
    const grown = ctx.store.expandLayerForEdit(layer.id);
    if (!grown) return;
    const shift: Point = { x: -grown.bounds.x, y: -grown.bounds.y };

    session = {
      origin: cloneCanvas(grown.canvas),
      offset: { x: pointer.point.x - origin.x, y: pointer.point.y - origin.y },
      layerId: layer.id,
      shift,
    };
    stamp(grown.canvas, session.origin, shifted(pointer.point, shift), session.offset, ctx.store.toolOptions.brushSize);
    ctx.store.bumpRevision();
  },

  onPointerMove: (pointer, ctx) => {
    if (!session) return;
    const layer = ctx.store.layers.find((item) => item.id === session?.layerId);
    if (!layer) return;
    stamp(
      layer.canvas,
      session.origin,
      shifted(pointer.point, session.shift),
      session.offset,
      ctx.store.toolOptions.brushSize,
    );
    ctx.store.bumpRevision();
  },

  onPointerUp: (_pointer, ctx) => {
    if (!session) return;
    session = null;
    const target = ctx.store.activeLayer();
    ctx.store.pushHistory('action.cloneStamp', target ? { layerIds: [target.id] } : undefined);
  },

  onDeactivate: () => {
    session = null;
  },
};
