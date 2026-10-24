/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { cloneCanvas, createCanvas, ctx2d } from './canvasUtils';

/**
 * 图层样式用到的形态学原语：剪影提取、膨胀、腐蚀。
 *
 * 膨胀不走欧氏距离变换（精确但 4MP 上要 100ms 以上，笔刷描边时每帧重算会卡死），
 * 改成沿圆周多次偏移叠加取最大值，半径误差 <2%，而且全是 GPU blit。
 */

/**
 * 提取 alpha 剪影到灰度画布。
 * RGB 全白、alpha 保持，供后续描边/发光着色。
 */
export function extractSilhouette(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const sil = createCanvas(width, height);
  const image = ctx2d(source).getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    // alpha 保持 data[i+3]
  }
  ctx2d(sil).putImageData(image, 0, 0);
  return sil;
}

/** 反转 alpha 通道（RGB 保持） */
export function invertAlpha(source: HTMLCanvasElement): HTMLCanvasElement {
  const { width, height } = source;
  const inverted = createCanvas(width, height);
  const image = ctx2d(source).getImageData(0, 0, width, height);
  const { data } = image;
  for (let i = 3; i < data.length; i += 4) data[i] = 255 - data[i];
  ctx2d(inverted).putImageData(image, 0, 0);
  return inverted;
}

/**
 * 四周扩出 pad 像素的透明边，内容居中。
 *
 * 反相类运算（腐蚀、内发光）必须先扩边：形状铺满画布时，
 * "形状之外"在原尺寸缓冲里一个像素都不占，反相得到全零，后续膨胀无从下手，
 * 结果是效果整个消失。扩出来的透明边就是那块缺失的"外部"。
 */
export function padCanvas(source: HTMLCanvasElement, pad: number): HTMLCanvasElement {
  if (pad <= 0) return cloneCanvas(source);
  const padded = createCanvas(source.width + pad * 2, source.height + pad * 2);
  ctx2d(padded).drawImage(source, pad, pad);
  return padded;
}

/** padCanvas 的逆操作：裁掉四周的 pad，回到原尺寸 */
export function unpadCanvas(
  source: HTMLCanvasElement,
  pad: number,
  width: number,
  height: number,
): HTMLCanvasElement {
  if (pad <= 0) return cloneCanvas(source);
  const out = createCanvas(width, height);
  ctx2d(out).drawImage(source, pad, pad, width, height, 0, 0, width, height);
  return out;
}

/** 扩边量：半径取整再多留 1px，避免模糊/取整把边缘啃掉 */
export function padFor(radius: number): number {
  return Math.ceil(Math.max(0, radius)) + 1;
}

/** 膨胀：沿半径采样圆周取最大 alpha */
export function dilate(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius < 0.5) return cloneCanvas(source);
  const { width, height } = source;
  const r = Math.round(radius);
  // 采样数随半径缩放，8-32 之间：半径越大越需要更密的圆周采样
  const samples = Math.max(8, Math.min(Math.round((2 * Math.PI * r) / 2), 32));

  const output = createCanvas(width, height);
  const context = ctx2d(output);
  context.save();
  context.globalCompositeOperation = 'lighten';
  for (let i = 0; i < samples; i += 1) {
    const angle = (i * 2 * Math.PI) / samples;
    context.drawImage(source, Math.round(r * Math.cos(angle)), Math.round(r * Math.sin(angle)));
  }
  context.restore();
  return output;
}

/**
 * 腐蚀：反相 → 膨胀 → 从原图里挖掉。
 * 全程在扩边后的缓冲里做，否则贴着画布边缘的形状腐蚀不出边（见 padCanvas）。
 */
export function erode(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius < 0.5) return cloneCanvas(source);
  const { width, height } = source;
  const pad = padFor(radius);
  const padded = padCanvas(source, pad);

  const dilated = dilate(invertAlpha(padded), radius);
  const context = ctx2d(padded);
  context.globalCompositeOperation = 'destination-out';
  context.drawImage(dilated, 0, 0);

  return unpadCanvas(padded, pad, width, height);
}
