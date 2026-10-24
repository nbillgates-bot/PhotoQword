/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolContext, ToolHandler } from './types';
import type { Point } from '../types';
import { clamp, createCanvas, ctx2d } from '../engine/canvasUtils';
import { convolve, gaussianBlur, KERNELS } from '../engine/filters';
import { pixelBlockReason } from '../engine/layerLock';

/** 修饰类工具：直接改图层像素，抬手时记一次历史 */
let active: { layerId: string; last: Point; label: string } | null = null;

/** 取以 center 为心、size 为直径的区域，限制在画布内 */
function regionOf(canvas: HTMLCanvasElement, center: Point, size: number) {
  const half = size / 2;
  const x = Math.max(0, Math.floor(center.x - half));
  const y = Math.max(0, Math.floor(center.y - half));
  const width = Math.min(canvas.width - x, Math.ceil(size));
  const height = Math.min(canvas.height - y, Math.ceil(size));
  return { x, y, width, height };
}

/**
 * 在圆形软边蒙版内把处理结果贴回原图层。
 * strength 决定叠加的不透明度。
 *
 * 衰减中心必须用光标位置换算到区域内的坐标，不能取区域几何中心：
 * 贴着画布边缘落笔时区域会被裁掉一半，几何中心随之往里偏，
 * 结果就是画布角落永远刷不到。半径同理要用笔尖尺寸而不是裁剪后的尺寸。
 */
function stampRegion(args: {
  target: HTMLCanvasElement;
  processed: HTMLCanvasElement;
  region: { x: number; y: number; width: number; height: number };
  center: Point;
  radius: number;
  strength: number;
}): void {
  const { target, processed, region, center, radius, strength } = args;
  const masked = createCanvas(region.width, region.height);
  const maskCtx = ctx2d(masked);
  maskCtx.drawImage(processed, 0, 0);
  maskCtx.globalCompositeOperation = 'destination-in';
  const cx = center.x - region.x;
  const cy = center.y - region.y;
  const gradient = maskCtx.createRadialGradient(cx, cy, radius * 0.25, cx, cy, radius);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  maskCtx.fillStyle = gradient;
  maskCtx.fillRect(0, 0, region.width, region.height);

  const context = ctx2d(target);
  context.save();
  context.globalAlpha = clamp(strength / 100, 0, 1);
  context.drawImage(masked, region.x, region.y);
  context.restore();
}

/** 处理器：输入区域切片，输出处理后的等尺寸 canvas */
type RegionProcessor = (slice: HTMLCanvasElement, strength: number) => HTMLCanvasElement;

/** 对指定位置施加一次效果 */
function applyAt(
  ctx: ToolContext,
  point: Point,
  size: number,
  strength: number,
  processor: RegionProcessor,
): void {
  // 修饰类工具直接读写图层像素，先确保画布覆盖文档，再把落点换到画布坐标
  const layer = ctx.store.expandLayerForEdit(ctx.store.activeLayerId ?? '');
  if (!layer) return;
  const local: Point = { x: point.x - layer.bounds.x, y: point.y - layer.bounds.y };
  const region = regionOf(layer.canvas, local, size);
  if (region.width < 2 || region.height < 2) return;

  const slice = createCanvas(region.width, region.height);
  ctx2d(slice).drawImage(
    layer.canvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    region.width,
    region.height,
  );
  stampRegion({
    target: layer.canvas,
    processed: processor(slice, strength),
    region,
    center: local,
    radius: size / 2,
    strength,
  });
  ctx.store.bumpRevision();
}

/** 构造一个修饰类工具 */
function makeEffectTool(id: ToolHandler['id'], label: string, processor: RegionProcessor): ToolHandler {
  return {
    id,
    cursor: 'crosshair',
    onPointerDown: (pointer, ctx) => {
      const layer = ctx.store.activeLayer();
      if (!layer) return;
      const blocked = pixelBlockReason(layer);
      if (blocked) {
        ctx.store.showToast(blocked, 'error');
        return;
      }
      active = { layerId: layer.id, last: pointer.point, label };
      const { effectSize, effectStrength } = ctx.store.toolOptions;
      applyAt(ctx, pointer.point, effectSize, effectStrength, processor);
    },
    onPointerMove: (pointer, ctx) => {
      if (!active) return;
      const { effectSize, effectStrength } = ctx.store.toolOptions;
      // 按间距补点，避免快速拖动出现空隙
      const spacing = Math.max(2, effectSize * 0.25);
      const dx = pointer.point.x - active.last.x;
      const dy = pointer.point.y - active.last.y;
      const distance = Math.hypot(dx, dy);
      if (distance < spacing) return;
      const steps = Math.floor(distance / spacing);
      for (let i = 1; i <= steps; i += 1) {
        const t = (i * spacing) / distance;
        applyAt(
          ctx,
          { x: active.last.x + dx * t, y: active.last.y + dy * t },
          effectSize,
          effectStrength,
          processor,
        );
      }
      active.last = pointer.point;
    },
    onPointerUp: (_pointer, ctx) => {
      if (!active) return;
      const usedLabel = active.label;
      active = null;
      const target = ctx.store.activeLayer();
      ctx.store.pushHistory(usedLabel, target ? { layerIds: [target.id] } : undefined);
    },
    onDeactivate: () => {
      active = null;
    },
  };
}

/** 亮度增减（减淡/加深共用） */
function exposureProcessor(direction: 1 | -1): RegionProcessor {
  return (slice, strength) => {
    const context = ctx2d(slice);
    const image = context.getImageData(0, 0, slice.width, slice.height);
    const data = image.data;
    const delta = (strength / 100) * 40 * direction;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      data[i] = clamp(data[i] + delta, 0, 255);
      data[i + 1] = clamp(data[i + 1] + delta, 0, 255);
      data[i + 2] = clamp(data[i + 2] + delta, 0, 255);
    }
    context.putImageData(image, 0, 0);
    return slice;
  };
}

export const blurTool = makeEffectTool('blur', 'tool.blur', (slice, strength) =>
  gaussianBlur(slice, Math.max(1, (strength / 100) * 6)),
);

export const sharpenTool = makeEffectTool('sharpen', 'tool.sharpen', (slice) => {
  const context = ctx2d(slice);
  const image = context.getImageData(0, 0, slice.width, slice.height);
  context.putImageData(convolve(image, KERNELS.sharpen), 0, 0);
  return slice;
});

export const smudgeTool = makeEffectTool('smudge', 'tool.smudge', (slice, strength) =>
  gaussianBlur(slice, Math.max(1, (strength / 100) * 3)),
);

export const dodgeTool = makeEffectTool('dodge', 'tool.dodge', exposureProcessor(1));
export const burnTool = makeEffectTool('burn', 'tool.burn', exposureProcessor(-1));
