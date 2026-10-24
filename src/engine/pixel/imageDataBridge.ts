/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * PixelBuffer ↔ ImageData 双向桥。
 *
 * 存在的意义是让新的像素模型与现有 compositor / filters 并存：
 * 老路径继续吃 ImageData，新算法吃 PixelBuffer，两边随时互转。
 * 没有这层桥就只能一刀切替换整个引擎，风险不可控。
 */

import { createImageData } from '../canvasUtils';
import { createPixelBuffer, indexOf } from './buffer';
import type { PixelBuffer } from './buffer';
import { FORMAT_MAX } from './format';
import type { PixelFormat } from './format';

/**
 * 从 ImageData 造缓冲。
 *
 * format 为 'u8' 时直接复制字节（零换算，快路径）；
 * 升到 u16/f32 时按满值比例放大，保证归一化后数值不变。
 */
export function fromImageData(image: ImageData, format: PixelFormat = 'u8'): PixelBuffer {
  const buffer = createPixelBuffer(image.width, image.height, format, 4);
  if (format === 'u8') {
    buffer.data.set(image.data);
    return buffer;
  }
  const scale = FORMAT_MAX[format] / 255;
  const out = buffer.data;
  for (let i = 0; i < image.data.length; i += 1) {
    out[i] = image.data[i] * scale;
  }
  return buffer;
}

/**
 * 转回 ImageData（恒为 8 位 RGBA，因为 canvas 只认这个）。
 *
 * 单通道缓冲按灰度铺到 RGB 并置 alpha 为满值 —— 蒙版正是这么显示的。
 * 高位深降到 8 位必然丢精度，这是 canvas 的限制而非本函数的选择。
 */
export function toImageData(buffer: PixelBuffer): ImageData {
  const image = createImageData(buffer.width, buffer.height);
  const max = FORMAT_MAX[buffer.format];
  const out = image.data;

  if (buffer.channels === 4) {
    const scale = 255 / max;
    for (let i = 0; i < out.length; i += 1) {
      out[i] = Math.round(buffer.data[i] * scale);
    }
    return image;
  }

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const src = indexOf(buffer, x, y);
      const dst = (y * buffer.width + x) * 4;
      const gray = Math.round((buffer.data[src] / max) * 255);
      out[dst] = gray;
      out[dst + 1] = gray;
      out[dst + 2] = gray;
      out[dst + 3] = 255;
    }
  }
  return image;
}
