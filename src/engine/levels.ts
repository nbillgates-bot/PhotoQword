/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp } from './canvasUtils';

/**
 * 色阶。
 *
 * PS 的色阶有五个控制量：输入黑场、输入白场、中间调（gamma）、输出黑场、输出白场。
 * 映射分两步：先把 [inBlack, inWhite] 拉伸到 [0,1] 并施加 gamma，
 * 再压缩到 [outBlack, outWhite]。
 *
 * 通道可以分别调，也可以一起调（RGB 复合通道），与 PS 的通道下拉一致。
 */

/** 单通道的色阶参数 */
export interface LevelsChannel {
  /** 输入黑场 0..255 */
  inBlack: number;
  /** 输入白场 0..255 */
  inWhite: number;
  /** 中间调，0.1..9.99，1 为不变 */
  gamma: number;
  /** 输出黑场 0..255 */
  outBlack: number;
  /** 输出白场 0..255 */
  outWhite: number;
}

/** 可调的通道；rgb 是复合通道，作用在三个通道上 */
export type LevelsChannelId = 'rgb' | 'r' | 'g' | 'b';

export type LevelsParams = Record<LevelsChannelId, LevelsChannel>;

export const DEFAULT_CHANNEL: LevelsChannel = {
  inBlack: 0,
  inWhite: 255,
  gamma: 1,
  outBlack: 0,
  outWhite: 255,
};

export function defaultLevels(): LevelsParams {
  return {
    rgb: { ...DEFAULT_CHANNEL },
    r: { ...DEFAULT_CHANNEL },
    g: { ...DEFAULT_CHANNEL },
    b: { ...DEFAULT_CHANNEL },
  };
}

/** 该通道是否等于默认值（用于跳过无谓的计算） */
export function isIdentity(channel: LevelsChannel): boolean {
  return (
    channel.inBlack === 0 &&
    channel.inWhite === 255 &&
    channel.gamma === 1 &&
    channel.outBlack === 0 &&
    channel.outWhite === 255
  );
}

/**
 * 生成 256 项查找表。
 * 逐像素算 pow() 太慢，先把 0..255 的结果全部算好，像素循环里只查表。
 */
export function buildLut(channel: LevelsChannel): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(256);
  const { inBlack, inWhite, gamma, outBlack, outWhite } = channel;
  // 输入区间退化成一点时，避免除零：整体推到输出白场
  const span = inWhite - inBlack;
  const safeGamma = gamma > 0 ? gamma : 1;

  for (let i = 0; i < 256; i += 1) {
    let v: number;
    if (span <= 0) {
      v = i <= inBlack ? 0 : 1;
    } else {
      v = clamp((i - inBlack) / span, 0, 1);
      // gamma 用倒数：PS 里 gamma > 1 提亮中间调
      v = v ** (1 / safeGamma);
    }
    lut[i] = clamp(outBlack + v * (outWhite - outBlack), 0, 255);
  }
  return lut;
}

/**
 * 把复合通道与单通道的查找表合成一张。
 * PS 的顺序是先单通道再复合通道，这里保持一致。
 */
function combinedLut(single: LevelsChannel, composite: LevelsChannel): Uint8ClampedArray {
  const first = buildLut(single);
  if (isIdentity(composite)) return first;
  const second = buildLut(composite);
  const merged = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i += 1) merged[i] = second[first[i]];
  return merged;
}

/** 就地应用色阶。全部为默认值时直接返回，不白跑一遍像素 */
export function applyLevels(image: ImageData, params: LevelsParams): void {
  const allIdentity =
    isIdentity(params.rgb) &&
    isIdentity(params.r) &&
    isIdentity(params.g) &&
    isIdentity(params.b);
  if (allIdentity) return;

  const lutR = combinedLut(params.r, params.rgb);
  const lutG = combinedLut(params.g, params.rgb);
  const lutB = combinedLut(params.b, params.rgb);

  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    // 全透明像素不参与，否则会把透明区染上颜色
    if (data[i + 3] === 0) continue;
    data[i] = lutR[data[i]];
    data[i + 1] = lutG[data[i + 1]];
    data[i + 2] = lutB[data[i + 2]];
  }
}

/**
 * 统计直方图，256 级。
 * 返回四条：复合（明度）与 R/G/B。色阶对话框要画它。
 */
export function histogram(image: ImageData): {
  luma: Uint32Array;
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
} {
  const luma = new Uint32Array(256);
  const r = new Uint32Array(256);
  const g = new Uint32Array(256);
  const b = new Uint32Array(256);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    r[data[i]] += 1;
    g[data[i + 1]] += 1;
    b[data[i + 2]] += 1;
    // 与 grayscale 用同一组权重，保证两处口径一致
    luma[Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])] += 1;
  }
  return { luma, r, g, b };
}

/**
 * 自动色阶：把每个通道的实际范围拉满。
 * clipPercent 是两端各忽略的像素比例，PS 默认 0.1%，
 * 不忽略的话个别噪点就会决定整个映射范围。
 */
export function autoLevels(image: ImageData, clipPercent = 0.1): LevelsParams {
  const hist = histogram(image);
  const params = defaultLevels();
  const total = countPixels(image);
  const clip = Math.floor((total * clipPercent) / 100);

  for (const key of ['r', 'g', 'b'] as const) {
    const [low, high] = findRange(hist[key], clip);
    params[key] = { ...DEFAULT_CHANNEL, inBlack: low, inWhite: high };
  }
  return params;
}

function countPixels(image: ImageData): number {
  let count = 0;
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) count += 1;
  }
  return count;
}

/** 从直方图两端各裁掉 clip 个像素后的有效范围 */
function findRange(hist: Uint32Array, clip: number): [number, number] {
  let low = 0;
  let high = 255;
  let acc = 0;
  for (let i = 0; i < 256; i += 1) {
    acc += hist[i];
    if (acc > clip) {
      low = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i -= 1) {
    acc += hist[i];
    if (acc > clip) {
      high = i;
      break;
    }
  }
  // 反常情况（空图或全同色）下保持满量程，别让后续除法炸掉
  return high > low ? [low, high] : [0, 255];
}
