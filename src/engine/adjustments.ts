/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp } from './canvasUtils';
import { hsvToRgb, rgbToHsv } from './color';

/** 亮度/对比度/饱和度/色相/曝光 等基础调整参数 */
export interface AdjustParams {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  exposure: number;
  temperature: number;
  vibrance: number;
}

export const DEFAULT_ADJUST: AdjustParams = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  exposure: 0,
  temperature: 0,
  vibrance: 0,
};

/** 就地修改 ImageData，应用一组调整 */
export function applyAdjust(image: ImageData, p: AdjustParams): void {
  const data = image.data;
  const contrastFactor = (259 * (p.contrast + 255)) / (255 * (259 - p.contrast));
  const exposureFactor = 2 ** (p.exposure / 100);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    r = r * exposureFactor + p.brightness;
    g = g * exposureFactor + p.brightness;
    b = b * exposureFactor + p.brightness;

    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    if (p.temperature !== 0) {
      r += p.temperature * 0.6;
      b -= p.temperature * 0.6;
    }

    if (p.saturation !== 0 || p.hue !== 0 || p.vibrance !== 0) {
      const hsv = rgbToHsv({ r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255) });
      hsv.h = (hsv.h + p.hue + 360) % 360;
      if (p.saturation !== 0) hsv.s = clamp(hsv.s * (1 + p.saturation / 100), 0, 1);
      if (p.vibrance !== 0) {
        // 低饱和像素受影响更大，模拟"自然饱和度"
        const weight = 1 - hsv.s;
        hsv.s = clamp(hsv.s + (p.vibrance / 100) * weight, 0, 1);
      }
      const rgb = hsvToRgb(hsv);
      r = rgb.r;
      g = rgb.g;
      b = rgb.b;
    }

    data[i] = clamp(r, 0, 255);
    data[i + 1] = clamp(g, 0, 255);
    data[i + 2] = clamp(b, 0, 255);
  }
}

/** 灰度 */
export function grayscale(image: ImageData): void {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
  }
}

/** 反相 */
export function invert(image: ImageData): void {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
}

/** 棕褐色 */
export function sepia(image: ImageData): void {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp(0.393 * r + 0.769 * g + 0.189 * b, 0, 255);
    data[i + 1] = clamp(0.349 * r + 0.686 * g + 0.168 * b, 0, 255);
    data[i + 2] = clamp(0.272 * r + 0.534 * g + 0.131 * b, 0, 255);
  }
}

/** 阈值化 */
export function threshold(image: ImageData, level: number): void {
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const out = v >= level ? 255 : 0;
    data[i] = out;
    data[i + 1] = out;
    data[i + 2] = out;
  }
}

/** 色调分离 */
export function posterize(image: ImageData, levels: number): void {
  const data = image.data;
  const step = 255 / Math.max(1, levels - 1);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.round(data[i] / step) * step;
    data[i + 1] = Math.round(data[i + 1] / step) * step;
    data[i + 2] = Math.round(data[i + 2] / step) * step;
  }
}
