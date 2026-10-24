/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createCanvas, ctx2d, clamp } from './canvasUtils';

/**
 * 检测 2D 上下文是否支持 filter 属性。
 * Safari 16.4 之前不支持，赋值会被静默忽略，导致模糊/羽化直接失效。
 * 这里做特性检测而不是判 UA（见开发规约第三节）。
 */
let cached: boolean | null = null;

export function supportsCanvasFilter(): boolean {
  if (cached !== null) return cached;
  cached = detectCanvasFilter();
  return cached;
}

/**
 * 实测像素而不是读回属性值。
 * 有的实现（node-canvas、部分老 WebKit）能把 filter 字符串存下来并原样读回，
 * 但绘制时完全忽略它。只有真画一笔看像素有没有扩散才靠得住。
 */
function detectCanvasFilter(): boolean {
  try {
    const context = createCanvas(8, 8).getContext('2d');
    if (!context) return false;
    context.filter = 'blur(2px)';
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 8);
    // x=5 原本在填充区之外，模糊生效时会渗出非零 alpha
    return context.getImageData(5, 4, 1, 1).data[3] > 0;
  } catch {
    return false;
  }
}

/**
 * 手写可分离高斯模糊，作为 ctx.filter 的回退。
 * 分成横竖两次一维卷积，复杂度从 O(r²) 降到 O(r)，大半径也能接受。
 * 直接对 RGBA 做预乘处理，避免透明边缘出现黑边。
 */
export function blurImageData(image: ImageData, radius: number): void {
  const r = Math.round(radius);
  if (r < 1) return;

  const kernel = gaussianKernel(r);
  const { width, height, data } = image;
  const temp = new Float32Array(data.length);

  // 第一遍：横向。同时把颜色乘上 alpha（预乘），防止透明像素把颜色拉黑
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let k = -r; k <= r; k += 1) {
        const sx = clamp(x + k, 0, width - 1);
        const i = (y * width + sx) * 4;
        const w = kernel[k + r];
        const a = data[i + 3] / 255;
        sr += data[i] * a * w;
        sg += data[i + 1] * a * w;
        sb += data[i + 2] * a * w;
        sa += data[i + 3] * w;
      }
      const o = (y * width + x) * 4;
      temp[o] = sr;
      temp[o + 1] = sg;
      temp[o + 2] = sb;
      temp[o + 3] = sa;
    }
  }

  // 第二遍：纵向，并把预乘的颜色还原回直通值写回 ImageData
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let k = -r; k <= r; k += 1) {
        const sy = clamp(y + k, 0, height - 1);
        const i = (sy * width + x) * 4;
        const w = kernel[k + r];
        sr += temp[i] * w;
        sg += temp[i + 1] * w;
        sb += temp[i + 2] * w;
        sa += temp[i + 3] * w;
      }
      const o = (y * width + x) * 4;
      const alpha = sa / 255;
      data[o] = alpha > 0 ? clamp(sr / alpha, 0, 255) : 0;
      data[o + 1] = alpha > 0 ? clamp(sg / alpha, 0, 255) : 0;
      data[o + 2] = alpha > 0 ? clamp(sb / alpha, 0, 255) : 0;
      data[o + 3] = clamp(sa, 0, 255);
    }
  }
}

/** 生成归一化的一维高斯核 */
function gaussianKernel(radius: number): Float32Array {
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  // sigma 取 radius/3，覆盖约 99.7% 的分布，视觉上接近 CSS blur
  const sigma = Math.max(radius / 3, 0.5);
  const denom = 2 * sigma * sigma;
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    const d = i - radius;
    const value = Math.exp(-(d * d) / denom);
    kernel[i] = value;
    sum += value;
  }
  for (let i = 0; i < size; i += 1) kernel[i] /= sum;
  return kernel;
}

/**
 * 对画布做模糊，自动选择原生 filter 或手写回退。
 * 返回新画布，调用方负责决定是否画回原处。
 */
export function blurCanvas(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const output = createCanvas(source.width, source.height);
  const context = ctx2d(output);

  if (supportsCanvasFilter()) {
    context.filter = `blur(${radius}px)`;
    context.drawImage(source, 0, 0);
    context.filter = 'none';
    return output;
  }

  context.drawImage(source, 0, 0);
  if (radius >= 1) {
    const image = context.getImageData(0, 0, output.width, output.height);
    blurImageData(image, radius);
    context.putImageData(image, 0, 0);
  }
  return output;
}
