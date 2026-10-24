/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { convolve, gaussianBlur, KERNELS, pixelate, addNoise, vignette } from '../../engine/filters';
import { grayscale, invert, sepia, threshold, posterize } from '../../engine/adjustments';
import { ctx2d } from '../../engine/canvasUtils';

export interface FilterDef {
  id: string;
  /** 词条 key（如 'filter.sepia'），消费方调 t() 取当前语言的文字 */
  label: string;
  /** 就地修改画布 */
  apply: (canvas: HTMLCanvasElement, strength: number) => void;
  /** 是否有强度参数 */
  hasStrength: boolean;
}

/** 把基于 ImageData 的处理函数包装成画布级操作 */
function pixelFilter(fn: (image: ImageData, strength: number) => void) {
  return (canvas: HTMLCanvasElement, strength: number) => {
    const ctx = ctx2d(canvas);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    fn(image, strength);
    ctx.putImageData(image, 0, 0);
  };
}

/** 卷积类滤镜同样走 ImageData，但要用 convolve 的返回值 */
function kernelFilter(kernel: number[]) {
  return (canvas: HTMLCanvasElement) => {
    const ctx = ctx2d(canvas);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.putImageData(convolve(image, kernel), 0, 0);
  };
}

/** 返回新画布的滤镜要把结果画回原画布，保持「就地修改」的统一接口 */
function canvasFilter(fn: (canvas: HTMLCanvasElement, strength: number) => HTMLCanvasElement) {
  return (canvas: HTMLCanvasElement, strength: number) => {
    const result = fn(canvas, strength);
    const ctx = ctx2d(canvas);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(result, 0, 0);
  };
}

export const FILTERS: FilterDef[] = [
  { id: 'grayscale', label: 'filter.grayscale', hasStrength: false, apply: pixelFilter((img) => grayscale(img)) },
  { id: 'sepia', label: 'filter.sepia', hasStrength: false, apply: pixelFilter((img) => sepia(img)) },
  { id: 'invert', label: 'filter.invert', hasStrength: false, apply: pixelFilter((img) => invert(img)) },
  {
    id: 'threshold',
    label: 'filter.threshold',
    hasStrength: true,
    apply: pixelFilter((img, s) => threshold(img, Math.round((s / 100) * 255))),
  },
  {
    id: 'posterize',
    label: 'filter.posterize',
    hasStrength: true,
    apply: pixelFilter((img, s) => posterize(img, Math.max(2, Math.round((s / 100) * 16)))),
  },
  { id: 'sharpen', label: 'filter.sharpen', hasStrength: false, apply: kernelFilter(KERNELS.sharpen) },
  { id: 'emboss', label: 'filter.emboss', hasStrength: false, apply: kernelFilter(KERNELS.emboss) },
  { id: 'edge', label: 'filter.edge', hasStrength: false, apply: kernelFilter(KERNELS.edge) },
  {
    id: 'blur',
    label: 'filter.gaussianBlur',
    hasStrength: true,
    apply: canvasFilter((canvas, s) => gaussianBlur(canvas, (s / 100) * 20)),
  },
  {
    id: 'pixelate',
    label: 'filter.pixelate',
    hasStrength: true,
    apply: canvasFilter((canvas, s) => pixelate(canvas, Math.max(2, Math.round((s / 100) * 40)))),
  },
  {
    id: 'noise',
    label: 'filter.noise',
    hasStrength: true,
    apply: pixelFilter((img, s) => addNoise(img, s, false)),
  },
  {
    id: 'vignette',
    label: 'filter.vignette',
    hasStrength: true,
    apply: canvasFilter((canvas, s) => vignette(canvas, s, 40)),
  },
];
