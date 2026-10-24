/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp, createCanvas, createImageData, ctx2d } from './canvasUtils';
import { blurCanvas } from './canvasFilterSupport';

/** 通用 3x3 / 5x5 卷积 */
export function convolve(image: ImageData, kernel: number[], divisor?: number): ImageData {
  const side = Math.round(Math.sqrt(kernel.length));
  const half = Math.floor(side / 2);
  const { width, height, data } = image;
  const output = createImageData(width, height);
  const out = output.data;
  // 核权重和为 0 时（如浮雕/边缘检测）退回 1，避免除零
  const weight = divisor ?? (kernel.reduce((a, b) => a + b, 0) || 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let ky = 0; ky < side; ky += 1) {
        for (let kx = 0; kx < side; kx += 1) {
          const sy = clamp(y + ky - half, 0, height - 1);
          const sx = clamp(x + kx - half, 0, width - 1);
          const si = (sy * width + sx) * 4;
          const k = kernel[ky * side + kx];
          r += data[si] * k;
          g += data[si + 1] * k;
          b += data[si + 2] * k;
        }
      }
      const di = (y * width + x) * 4;
      out[di] = clamp(r / weight, 0, 255);
      out[di + 1] = clamp(g / weight, 0, 255);
      out[di + 2] = clamp(b / weight, 0, 255);
      out[di + 3] = data[di + 3];
    }
  }
  return output;
}

export const KERNELS = {
  sharpen: [0, -1, 0, -1, 5, -1, 0, -1, 0],
  emboss: [-2, -1, 0, -1, 1, 1, 0, 1, 2],
  edge: [0, 1, 0, 1, -4, 1, 0, 1, 0],
  boxBlur: Array<number>(9).fill(1),
};

/** 高斯模糊：优先原生 filter，不支持时走手写可分离卷积 */
export function gaussianBlur(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  return blurCanvas(source, radius);
}

/** 马赛克 */
export function pixelate(source: HTMLCanvasElement, blockSize: number): HTMLCanvasElement {
  const size = Math.max(2, Math.round(blockSize));
  const w = Math.max(1, Math.ceil(source.width / size));
  const h = Math.max(1, Math.ceil(source.height / size));
  const small = createCanvas(w, h);
  const smallCtx = ctx2d(small);
  smallCtx.imageSmoothingEnabled = false;
  smallCtx.drawImage(source, 0, 0, w, h);

  const output = createCanvas(source.width, source.height);
  const context = ctx2d(output);
  context.imageSmoothingEnabled = false;
  context.drawImage(small, 0, 0, source.width, source.height);
  return output;
}

/** 噪点 */
export function addNoise(image: ImageData, amount: number, monochrome: boolean): void {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (monochrome) {
      const n = (Math.random() - 0.5) * amount * 2;
      data[i] = clamp(data[i] + n, 0, 255);
      data[i + 1] = clamp(data[i + 1] + n, 0, 255);
      data[i + 2] = clamp(data[i + 2] + n, 0, 255);
    } else {
      data[i] = clamp(data[i] + (Math.random() - 0.5) * amount * 2, 0, 255);
      data[i + 1] = clamp(data[i + 1] + (Math.random() - 0.5) * amount * 2, 0, 255);
      data[i + 2] = clamp(data[i + 2] + (Math.random() - 0.5) * amount * 2, 0, 255);
    }
  }
}

/** 暗角 */
export function vignette(
  source: HTMLCanvasElement,
  amount: number,
  size: number,
): HTMLCanvasElement {
  const output = createCanvas(source.width, source.height);
  const context = ctx2d(output);
  context.drawImage(source, 0, 0);
  const cx = source.width / 2;
  const cy = source.height / 2;
  const outer = Math.hypot(cx, cy);
  const gradient = context.createRadialGradient(cx, cy, outer * (size / 100), cx, cy, outer);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${clamp(amount / 100, 0, 1)})`);
  context.globalCompositeOperation = 'source-atop';
  context.fillStyle = gradient;
  context.fillRect(0, 0, source.width, source.height);
  return output;
}

// 原先这里有个 cssFilter(source, filterString)，直接依赖 ctx.filter 且无人调用。
// Safari 16.4 以下会静默失效，删掉以免以后有人误用；调色走 adjustments.ts，模糊走 blurCanvas。
