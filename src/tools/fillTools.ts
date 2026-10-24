/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler } from './types';
import type { Point } from '../types';
import { createCanvas, ctx2d } from '../engine/canvasUtils';
import { floodFill } from '../engine/selection';
import { hexToRgb } from '../engine/color';
import { invalidateMask } from '../engine/mask';
import { pixelBlockReason } from '../engine/layerLock';
import { computeGradientT } from '../engine/gradient';
import { CURSORS } from './cursors';

/** 油漆桶：容差范围内洪水填充；关闭"连续"时填充全图同色像素 */
export const bucketTool: ToolHandler = {
  id: 'bucket',
  cursor: CURSORS.bucket,
  onPointerDown: (pointer, ctx) => {
    const { toolOptions, foreground, selection } = ctx.store;
    const layer = ctx.store.activeLayer();
    if (!layer) return;

    // 选中蒙版时填充落在蒙版上，颜色折算为灰度
    const onMask = ctx.store.isPaintingMask();
    // 蒙版不受图层像素锁限制，同 paintTools
    const blocked = onMask ? (layer.locked ? 'toast.layerLocked' : null) : pixelBlockReason(layer);
    if (blocked) {
      ctx.store.showToast(blocked, 'error');
      return;
    }
    const painted = ctx.store.paintSurface();
    if (!painted) return;
    const surface = painted.canvas;
    const { width, height } = surface;
    const context = ctx2d(surface);
    const image = context.getImageData(0, 0, width, height);
    const data = image.data;
    // 取样点在画布坐标系里，图层被移动过时与文档坐标差一个 offset
    const sx = Math.floor(pointer.point.x + painted.offset.x);
    const sy = Math.floor(pointer.point.y + painted.offset.y);
    if (sx < 0 || sy < 0 || sx >= width || sy >= height) return;

    const base = (sy * width + sx) * 4;
    const target = [data[base], data[base + 1], data[base + 2], data[base + 3]];
    const limit = (toolOptions.bucketTolerance / 100) * 255 * 2;
    const fill = onMask ? grayOf(foreground) : hexToRgb(foreground);

    const matches = (index: number) =>
      Math.abs(data[index] - target[0]) +
        Math.abs(data[index + 1] - target[1]) +
        Math.abs(data[index + 2] - target[2]) +
        Math.abs(data[index + 3] - target[3]) <=
      limit;

    // 先把命中像素画进蒙版，再统一按选区裁剪合入，逻辑与其它工具保持一致
    const patch = createCanvas(width, height);
    const patchCtx = ctx2d(patch);
    const out = patchCtx.createImageData(width, height);

    const paint = (pixel: number) => {
      out.data[pixel] = fill.r;
      out.data[pixel + 1] = fill.g;
      out.data[pixel + 2] = fill.b;
      out.data[pixel + 3] = 255;
    };

    if (toolOptions.bucketContiguous) {
      floodFill(width, height, sx, sy, matches, paint);
    } else {
      for (let i = 0; i < data.length; i += 4) if (matches(i)) paint(i);
    }
    patchCtx.putImageData(out, 0, 0);

    if (selection) {
      patchCtx.globalCompositeOperation = 'destination-in';
      // patch 与 surface 同坐标系，选区蒙版是文档坐标系，要按 offset 摆放
      patchCtx.drawImage(selection.mask, painted.offset.x, painted.offset.y);
    }
    context.drawImage(patch, 0, 0);
    if (onMask) invalidateMask(surface);
    ctx.store.pushHistory('action.bucketFill', { layerIds: [layer.id] });
    ctx.store.bumpRevision();
  },
};

/** 颜色折算成等亮度灰，蒙版只认灰度 */
function grayOf(color: string): { r: number; g: number; b: number } {
  const { r, g, b } = hexToRgb(color);
  const luma = Math.round(r * 0.299 + g * 0.587 + b * 0.114);
  return { r: luma, g: luma, b: luma };
}

/** 渐变工具的拖拽状态 */
let gradientDraft: { start: Point; current: Point } | null = null;

export function currentGradientDraft(): { start: Point; current: Point } | null {
  return gradientDraft;
}

/** 渐变：拖拽定义方向/半径，抬手时填充 */
export const gradientTool: ToolHandler = {
  id: 'gradient',
  cursor: 'crosshair',
  onPointerDown: (pointer, ctx) => {
    const layer = ctx.store.activeLayer();
    if (!layer) return;
    const blocked = pixelBlockReason(layer);
    if (blocked) {
      ctx.store.showToast(blocked, 'error');
      return;
    }
    gradientDraft = { start: pointer.point, current: pointer.point };
  },
  onPointerMove: (pointer, ctx) => {
    if (!gradientDraft) return;
    gradientDraft.current = pointer.point;
    ctx.requestOverlayRepaint();
  },
  onPointerUp: (_pointer, ctx) => {
    if (!gradientDraft) return;
    const { start, current } = gradientDraft;
    gradientDraft = null;

    const { doc, toolOptions, foreground, background, selection } = ctx.store;
    const layer = ctx.store.activeLayer();
    if (!doc || !layer) return;
    if (Math.hypot(current.x - start.x, current.y - start.y) < 2) {
      ctx.requestOverlayRepaint();
      return;
    }

    const onMask = ctx.store.isPaintingMask();
    const painted = ctx.store.paintSurface();
    if (!painted) return;
    const surface = painted.canvas;

    const patch = createCanvas(doc.width, doc.height);
    const patchCtx = ctx2d(patch);

    // 构建渐变像素数据
    const imageData = patchCtx.createImageData(doc.width, doc.height);
    const data = imageData.data;

    const pick = (color: string) => (onMask ? grayOf(color) : hexToRgb(color));
    const fromColor = pick(toolOptions.gradientReverse ? background : foreground);
    const toColor = pick(toolOptions.gradientReverse ? foreground : background);
    const opacity = toolOptions.gradientOpacity / 100;

    for (let y = 0; y < doc.height; y++) {
      for (let x = 0; x < doc.width; x++) {
        const t = computeGradientT(toolOptions.gradientKind, start, current, { x, y });
        const index = (y * doc.width + x) * 4;
        data[index] = Math.round(fromColor.r + (toColor.r - fromColor.r) * t);
        data[index + 1] = Math.round(fromColor.g + (toColor.g - fromColor.g) * t);
        data[index + 2] = Math.round(fromColor.b + (toColor.b - fromColor.b) * t);
        data[index + 3] = Math.round(255 * opacity);
      }
    }

    patchCtx.putImageData(imageData, 0, 0);

    if (selection) {
      patchCtx.globalCompositeOperation = 'destination-in';
      patchCtx.drawImage(selection.mask, 0, 0);
    }

    // 应用混合模式
    const surfaceCtx = ctx2d(surface);
    const prevComposite = surfaceCtx.globalCompositeOperation;
    surfaceCtx.globalCompositeOperation = toolOptions.gradientMode;
    surfaceCtx.drawImage(patch, painted.offset.x, painted.offset.y);
    surfaceCtx.globalCompositeOperation = prevComposite;

    if (onMask) invalidateMask(surface);
    ctx.store.pushHistory('action.gradientFill', { layerIds: [layer.id] });
    ctx.store.bumpRevision();
  },
  onDeactivate: () => {
    gradientDraft = null;
  },
};
