/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 测试专用：局部缓冲对照用的脚手架。**生产代码不要 import 这个文件。**
 *
 * 单独拆出来是因为对照用例分两份（手写结构 + 随机结构），两份都要用同一套
 * 造图层、渲一帧、逐像素比的逻辑，抄两遍必然走样。
 */
import { compositeInView } from './viewCompositor';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';
import { ctx2d } from './canvasUtils';
import type { BlendMode, Layer } from '../types';

/*
 * 不要写成 `declare const globalThis`：那是在遮蔽全局同名属性，oxlint 会报
 * no-shadow-restricted-names。就地断言成带这个开关的形状即可。
 */
const bufferFlags = globalThis as typeof globalThis & { __qwordFullViewportBuffers?: boolean };

export const DOC_W = 790;
export const DOC_H = 4000;
export const VIEW_W = 300;
export const VIEW_H = 500;

/**
 * 容差 1（预乘后的 8 位通道值，见 bufferDiff 为什么比预乘）。
 *
 * 为什么不是 0：缓冲挪了位置之后落点的整数偏移变了，光栅器按定点步进算源采样
 * 坐标，起点不同末位就可能差一格。这是 drawImage 自身的实现细节，两条路径都
 * 「对」，做不到逐位相同。
 *
 * 为什么 1 够用：这里要防的是「整层不见」，那种差异是 60~255。把 RASTER_BLEED
 * 改成 0 再跑，对照用例在容差 1 下依然会红——容差没有掩盖任何真问题。
 */
export const TOL = 1;

export function fillCanvas(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** 左半白右半黑的蒙版（白=显示），用来验缓冲与蒙版的对齐 */
export function halfMask(width: number, height: number): HTMLCanvasElement {
  const canvas = fillCanvas(width, height, '#000000');
  const context = ctx2d(canvas);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, Math.ceil(canvas.width / 2), canvas.height);
  return canvas;
}

export interface LayerOpt {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  type?: Layer['type'];
  parentId?: string | null;
  blendMode?: BlendMode;
  opacity?: number;
  mask?: boolean;
  clipped?: boolean;
}

export function makeLayer(opt: LayerOpt): Layer {
  const type = opt.type ?? 'raster';
  const isGroup = type === 'group';
  return {
    id: opt.id,
    name: opt.id,
    type,
    // 组的 canvas 是 1×1 占位符，跟 PSD 解出来的一致
    canvas: isGroup ? fillCanvas(1, 1, 'rgba(0,0,0,0)') : fillCanvas(opt.width, opt.height, opt.color ?? '#3b82f6'),
    bounds: isGroup
      ? { x: opt.x, y: opt.y, width: 1, height: 1 }
      : { x: opt.x, y: opt.y, width: opt.width, height: opt.height },
    visible: true,
    opacity: opt.opacity ?? 100,
    blendMode: opt.blendMode ?? 'normal',
    locked: false,
    parentId: opt.parentId ?? null,
    mask: opt.mask ? halfMask(opt.width, opt.height) : undefined,
    maskEnabled: true,
    clipped: opt.clipped ?? false,
  } as Layer;
}

/** 渲一帧，返回视口像素 */
export function renderFrame(layers: Layer[], zoom: number, panY = 0, panX = 0): Uint8ClampedArray {
  const view = makeViewportContext({
    viewportWidth: VIEW_W,
    viewportHeight: VIEW_H,
    docWidth: DOC_W,
    docHeight: DOC_H,
    zoom,
    panX,
    panY,
    dpr: 1,
  });
  const canvas = document.createElement('canvas');
  const context = prepareViewportCanvas(canvas, view);
  compositeInView(context, layers, view);
  const raw = ctx2d(canvas);
  raw.setTransform(1, 0, 0, 1, 0, 0);
  return raw.getImageData(0, 0, canvas.width, canvas.height).data;
}

/**
 * 同一批图层用「局部缓冲」和「全视口缓冲」各渲一遍，返回最大通道差。
 *
 * 唯一变量就是缓冲尺寸，所以任何超出容差的差异都是 box 算错了。
 */
export function bufferDiff(layers: Layer[], zoom: number, panY = 0, panX = 0) {
  bufferFlags.__qwordFullViewportBuffers = true;
  const full = renderFrame(layers, zoom, panY, panX);
  bufferFlags.__qwordFullViewportBuffers = false;
  const tight = renderFrame(layers, zoom, panY, panX);

  let max = 0;
  let at: string | null = null;
  // 超差像素的个数。几何错位是成片的，末位舍入是零星的，靠这个数区分两者
  let over = 0;
  for (let i = 0; i < full.length; i += 4) {
    let pixelDelta = 0;
    for (let c = 0; c < 4; c += 1) {
      // 比预乘值：getImageData 给的是去预乘后的结果，alpha 小的时候末位差一格会被
      // 放大成几十(alpha=41 时放大 6 倍)，比出来的数字跟真实差距不成比例。
      // 画布里实际存的是预乘值，比预乘就把这层放大去掉了，容差才能压到 1。
      const a = c === 3 ? 255 : full[i + 3];
      const b = c === 3 ? 255 : tight[i + 3];
      const delta = Math.abs(Math.round((full[i + c] * a) / 255) - Math.round((tight[i + c] * b) / 255));
      if (delta > pixelDelta) pixelDelta = delta;
      if (delta <= max) continue;
      max = delta;
      const pixel = i / 4;
      at =
        `(${pixel % VIEW_W},${Math.floor(pixel / VIEW_W)}) ` +
        `全视口 [${full[i]},${full[i + 1]},${full[i + 2]},${full[i + 3]}]` +
        ` vs 局部 [${tight[i]},${tight[i + 1]},${tight[i + 2]},${tight[i + 3]}]`;
    }
    if (pixelDelta > TOL) over += 1;
  }
  return { max, at, over };
}
