/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect } from '../types';
import { createReadbackCanvas, ctx2d, ctx2dReadback } from './canvasUtils';

/**
 * 像素区域差分。历史记录用它只保存"变了的那一小块"，
 * 而不是每步都深拷贝整幅图（详见 historySlice 的注释）。
 * 全部是纯函数，不认识 store。
 */

/** 把 RGBA 字节视图转成 32 位视图，一次比 4 个通道，扫描快 4 倍 */
function words(image: ImageData): Uint32Array {
  const { data } = image;
  return new Uint32Array(data.buffer, data.byteOffset, data.length / 4);
}

/**
 * 求两张同尺寸图的差异外接矩形。完全相同时返回 null。
 * 先按行找出上下边界，再只在这个行区间里找左右边界，
 * 避免对整幅图做逐像素的列扫描。
 */
export function diffBounds(before: ImageData, after: ImageData): Rect | null {
  if (before.width !== after.width || before.height !== after.height) {
    return { x: 0, y: 0, width: after.width, height: after.height };
  }
  const { width, height } = after;
  const a = words(before);
  const b = words(after);

  let top = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (a[row + x] !== b[row + x]) {
        if (top < 0) top = y;
        bottom = y;
        break;
      }
    }
  }
  if (top < 0) return null;

  let left = width;
  let right = -1;
  for (let y = top; y <= bottom; y += 1) {
    const row = y * width;
    for (let x = 0; x < left; x += 1) {
      if (a[row + x] !== b[row + x]) {
        left = x;
        break;
      }
    }
    for (let x = width - 1; x > right; x -= 1) {
      if (a[row + x] !== b[row + x]) {
        right = x;
        break;
      }
    }
  }
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * 从画布上抠出一块矩形的像素。
 * 走 ctx2dReadback：进到这里的画布必然要被读像素，而且历史每压一步就再读一遍。
 * 如果这张画布还没建过上下文（新建的空图层就是这种），这里的声明就是生效的那一次。
 */
export function cutRegion(canvas: HTMLCanvasElement, rect: Rect): ImageData {
  return ctx2dReadback(canvas).getImageData(rect.x, rect.y, rect.width, rect.height);
}

/** 把一块像素贴回画布的指定位置。就地修改传入的画布 */
export function pasteRegion(canvas: HTMLCanvasElement, rect: Rect, pixels: ImageData): void {
  ctx2d(canvas).putImageData(pixels, rect.x, rect.y);
}

/**
 * 读取整张画布的像素。
 * 单独抽出来是因为影子副本和差分都要用，且尺寸参数容易写错。
 */
export function readAll(canvas: HTMLCanvasElement): ImageData {
  return ctx2dReadback(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

/** 由像素数据造一张画布，用于恢复被删除的图层 */
export function canvasFromPixels(pixels: ImageData): HTMLCanvasElement {
  // 撤销恢复出来的还是图层画布，之后照样要被差分读回
  const canvas = createReadbackCanvas(pixels.width, pixels.height);
  ctx2d(canvas).putImageData(pixels, 0, 0);
  return canvas;
}

/** 差分块占整幅图的比例，用于判断"改得太多不如整存" */
export function regionRatio(rect: Rect, width: number, height: number): number {
  const total = width * height;
  if (total <= 0) return 1;
  return (rect.width * rect.height) / total;
}

