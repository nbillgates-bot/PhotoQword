/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler, ToolPointer, ToolContext } from './types';
import type { Point } from '../types';
import { ctx2d } from '../engine/canvasUtils';
import { strokeSegment, type BrushConfig } from '../engine/brush';
import { hexToRgb } from '../engine/color';
import { pixelBlockReason } from '../engine/layerLock';
import { pressureSize } from '../engine/pointerPressure';

/** 一次描边的进行中状态 */
interface StrokeState {
  buffer: HTMLCanvasElement;
  last: Point;
  carry: number;
  config: BrushConfig;
}

let stroke: StrokeState | null = null;

/**
 * 蒙版是灰度通道，只认黑白灰，alpha 应当恒为 255。
 * 所以画在蒙版上时要改写笔刷行为：
 * - 颜色一律折算成灰度，避免彩色笔刷在蒙版上产生莫名的亮度；
 * - 橡皮不能用 destination-out（那会打出透明洞而不是黑色），改成画白色。
 *   PS 里在蒙版上用橡皮同样是"擦回显示"，语义一致。
 */
function maskStroke(
  config: BrushConfig,
  operation: 'source-over' | 'destination-out',
): { config: BrushConfig; operation: 'source-over' | 'destination-out' } {
  if (operation === 'destination-out') {
    return { config: { ...config, color: '#ffffff' }, operation: 'source-over' };
  }
  return { config: { ...config, color: toGray(config.color) }, operation };
}

/** 取颜色的 Rec.601 亮度，返回等亮度的灰色 */
function toGray(color: string): string {
  const { r, g, b } = hexToRgb(color);
  const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  return `rgb(${luma},${luma},${luma})`;
}

/** 起笔：申请缓冲并盖下第一个笔尖 */
function beginStroke(
  pointer: ToolPointer,
  ctx: ToolContext,
  config: BrushConfig,
  operation: 'source-over' | 'destination-out',
  opacity: number,
): void {
  const { store } = ctx;
  const layer = store.activeLayer();
  if (!layer) return;
  /*
   * 画蒙版时不受图层像素锁的限制：锁的是图层像素，蒙版是另一张画布。
   * 「全部锁定」才连蒙版一起挡住，与 PS 一致。
   */
  const onMask = store.isPaintingMask();
  const blocked = onMask ? (layer.locked ? 'toast.layerLocked' : null) : pixelBlockReason(layer);
  if (blocked) {
    store.showToast(blocked, 'error');
    return;
  }
  const resolved = onMask ? maskStroke(config, operation) : { config, operation };
  const buffer = store.beginOverlay({
    targetLayerId: layer.id,
    operation: resolved.operation,
    opacity,
    clipToSelection: true,
    target: onMask ? 'mask' : 'canvas',
  });
  if (!buffer) return;
  stroke = { buffer, last: pointer.point, carry: 0, config: resolved.config };
  const context = ctx2d(buffer);
  /*
   * 起笔这一下也要按压感缩放。
   * 之前这里用的是原始 size、只有 extendStroke 乘压感，于是用手写笔轻轻落笔时
   * 第一个笔尖是全尺寸的，后面才细下去 —— 每一笔的起点都有个疙瘩。
   */
  const size = pressureSize(resolved.config.size, pointer.pressure);
  stroke.carry = strokeSegment(
    context,
    pointer.point,
    pointer.point,
    { ...resolved.config, size },
    0,
  );
  ctx.requestOverlayRepaint();
}

/** 移动：把线段补齐到当前点 */
function extendStroke(pointer: ToolPointer, ctx: ToolContext): void {
  if (!stroke) return;
  // 压感影响笔尖直径。只有手写笔报真值，鼠标/触屏一律按满压（见 pointerPressure）
  const size = pressureSize(stroke.config.size, pointer.pressure);
  const context = ctx2d(stroke.buffer);
  stroke.carry = strokeSegment(
    context,
    stroke.last,
    pointer.point,
    { ...stroke.config, size },
    stroke.carry,
  );
  stroke.last = pointer.point;
  ctx.requestOverlayRepaint();
}

/** 抬手：合入图层 */
function endStroke(ctx: ToolContext, label: string): void {
  if (!stroke) return;
  stroke = null;
  ctx.store.commitOverlay(label);
}

/** 画笔 */
export const brushTool: ToolHandler = {
  id: 'brush',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    const { toolOptions, foreground } = ctx.store;
    beginStroke(
      pointer,
      ctx,
      {
        size: toolOptions.brushSize,
        hardness: toolOptions.brushHardness,
        opacity: 100,
        color: foreground,
        shape: toolOptions.brushShape,
      },
      'source-over',
      toolOptions.brushOpacity,
    );
  },
  onPointerMove: extendStroke,
  onPointerUp: (_pointer, ctx) => endStroke(ctx, 'tool.brush'),
  onDeactivate: (ctx) => {
    if (stroke) {
      stroke = null;
      ctx.store.cancelOverlay();
    }
  },
};

/** 铅笔：硬边、不透明 */
export const pencilTool: ToolHandler = {
  id: 'pencil',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    const { toolOptions, foreground } = ctx.store;
    beginStroke(
      pointer,
      ctx,
      {
        size: toolOptions.brushSize,
        hardness: 100,
        opacity: 100,
        color: foreground,
        shape: 'square',
      },
      'source-over',
      100,
    );
  },
  onPointerMove: extendStroke,
  onPointerUp: (_pointer, ctx) => endStroke(ctx, 'tool.pencil'),
  onDeactivate: brushTool.onDeactivate,
};

/** 橡皮：以 destination-out 合成实现擦除 */
export const eraserTool: ToolHandler = {
  id: 'eraser',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    const { toolOptions } = ctx.store;
    beginStroke(
      pointer,
      ctx,
      {
        size: toolOptions.eraserSize,
        hardness: toolOptions.eraserHardness,
        opacity: 100,
        // 颜色不影响擦除结果，只用其 alpha 通道
        color: '#000000',
        shape: 'round',
      },
      'destination-out',
      toolOptions.eraserOpacity,
    );
  },
  onPointerMove: extendStroke,
  onPointerUp: (_pointer, ctx) => endStroke(ctx, 'tool.eraser'),
  onDeactivate: brushTool.onDeactivate,
};
