/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect } from '../types';

/** 创建一个离屏 canvas */
export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/**
 * 建一张「注定会被反复读像素」的离屏 canvas，并当场把上下文选项定下来。
 *
 * 必须在创建时就取一次上下文：`getContext('2d', options)` 的 options
 * 只有第一次调用生效，后面再传等于没传。图层画布常常先被 drawImage 填内容
 * （PSD 导入、克隆、裁剪），等历史差分去 getImageData 时上下文早就建好了，
 * 那时候补声明已经晚了。
 *
 * 用于图层像素、蒙版像素这类要进历史差分的画布，见 ctx2dReadback 的说明。
 */
export function createReadbackCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = createCanvas(width, height);
  ctx2dReadback(canvas);
  return canvas;
}

/**
 * 取 2D 上下文，并声明这张画布会被频繁 getImageData。
 *
 * 不声明的话浏览器默认把画布放在 GPU 上，每次 getImageData 都要从显存回读，
 * 控制台会刷 "Multiple readback operations ... willReadFrequently" 的警告。
 * 手写混合模式、滤镜、蒙版这些路径都要反复读像素，声明后浏览器改用
 * CPU 端后备存储，回读快得多。
 *
 * 只对确实要读像素的画布用它：屏幕上那张主画布靠 GPU 合成更快，不要加。
 * 实测（Edge，源画布声明 vs 不声明，drawImage 合成 9~30 层）比值 0.89x~1.01x，
 * 也就是说给「作为合成输入的图层画布」加这个标记不会拖慢合成。
 */
export function ctx2dReadback(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  return ctx2d(canvas, { willReadFrequently: true });
}

/** 取 2D 上下文，失败时抛错而不是返回 null，简化调用方处理 */
export function ctx2d(
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', options);
  if (!context) throw new Error('无法获取 2D 绘图上下文'); // i18n-exempt: 契约性错误，取不到上下文说明浏览器环境有问题
  return context;
}

/**
 * 深拷贝一个 canvas（含像素内容）。
 * 用 createReadbackCanvas：拷贝出来的几乎都是图层/蒙版像素或调整前的快照，
 * 后面一定要被读回来做差分或比较。
 */
export function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = createReadbackCanvas(source.width, source.height);
  ctx2d(copy).drawImage(source, 0, 0);
  return copy;
}

/** 用指定颜色填满 canvas */
export function fillCanvas(canvas: HTMLCanvasElement, color: string): void {
  const context = ctx2d(canvas);
  context.save();
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

/** 清空 canvas */
export function clearCanvas(canvas: HTMLCanvasElement): void {
  ctx2d(canvas).clearRect(0, 0, canvas.width, canvas.height);
}

/** 把 canvas 内容整体缩放到新尺寸，返回新 canvas */
export function resizeCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  smooth = true,
): HTMLCanvasElement {
  // 「图像大小」出来的还是图层像素，同 recanvas / cropCanvas
  const target = createReadbackCanvas(width, height);
  const context = ctx2d(target);
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return target;
}

/** 把源 canvas 放到新画布尺寸中的指定偏移位置（画布大小调整用） */
export function recanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): HTMLCanvasElement {
  // 调整画布大小走这里，出来的是新的图层像素，同样要进历史差分
  const target = createReadbackCanvas(width, height);
  ctx2d(target).drawImage(source, offsetX, offsetY);
  return target;
}

/** 裁剪出指定矩形区域 */
export function cropCanvas(source: HTMLCanvasElement, rect: Rect): HTMLCanvasElement {
  const target = createReadbackCanvas(rect.width, rect.height);
  ctx2d(target).drawImage(
    source,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    0,
    0,
    rect.width,
    rect.height,
  );
  return target;
}

/**
 * 建一张全透明的 ImageData。
 * 走 ctx.createImageData 而不是 new ImageData(w, h)：后者在个别环境（含测试用的 jsdom）
 * 拿不到构造函数，而 createImageData 是所有目标浏览器都有的路径。
 */
export function createImageData(width: number, height: number): ImageData {
  const canvas = createCanvas(width, height);
  return ctx2d(canvas).createImageData(canvas.width, canvas.height);
}

/** 限制数值范围 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** 生成唯一 id */
let idSeed = 0;
export function uid(prefix = 'id'): string {
  idSeed += 1;
  return `${prefix}_${idSeed.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
}
