/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createCanvas, ctx2d } from './canvasUtils';

/**
 * 画布尺寸上限。
 *
 * 浏览器对超限画布是**静默失败**——返回一张空白画布，既不抛异常也不告警。
 * 各家上限还不一致（Chrome 单边 65535、Firefox 32767、Safari 16384，
 * 且都另有总面积限制），所以不能写死一个数，要按规约第三节做特性检测。
 *
 * 检测手法：建一张目标尺寸的画布，往最后一个像素写值再读回。超限时浏览器
 * 给的是空白画布，读回来是 0，据此判断这个尺寸能不能用。
 *
 * **单边与面积必须分开探测。** 单边探的是 side×1 的窄条，面积由 MAX_AREA
 * 静态判断，两者混在一起会把「内存不够」误报成「单边超限」（见 canAllocate）。
 */

/**
 * 候选单边尺寸，从大到小试，命中即停。
 *
 * 取值对着各家的实际上限：Chrome / Edge 65535、Firefox 32767、Safari 16384。
 * 探测的是「这个单边能不能用」，不是「这么大的方块能不能分配」——面积由
 * MAX_AREA 单独管（见 canAllocate 的说明）。
 */
const SIDE_CANDIDATES = [65535, 32767, 16384, 8192, 4096, 2048];

/** 探测结果缓存：这个值在一次会话里不会变，只测一遍 */
let cachedMaxSide: number | null = null;

/** 单张画布能占的最大像素数。超过这个数即便浏览器允许，内存也撑不住 */
const MAX_AREA = 64 * 1024 * 1024; // 64M 像素 = 单份 RGBA 约 256MB

/** 面积上限（像素数）。导出供调用方提示与测试构造用例 */
export function maxCanvasArea(): number {
  return MAX_AREA;
}

/**
 * 这个**单边**尺寸能不能用。
 *
 * 探测一条 side×1 的窄条，不是 side×side 的方块。
 *
 * 早先探的是方块，结果测的是内存而不是单边：32768² = 10.7 亿像素、
 * 单份 RGBA 4.3GB，必然分配失败，于是上限一路退到 16384——一份
 * 790×16464（仅 1300 万像素，完全能分配）的长图 PSD 就被判成「单边超限」
 * 打不开。单边与面积是两个独立限制，checkCanvasSize 也分开报，
 * 探测阶段就不能把它们混在一起。窄条只占 side 个像素，测得到单边、
 * 又不会撞上内存。
 *
 * 两个方向都测：规范没保证宽高上限一致（实测 Chromium 与 node-canvas
 * 都对称，但这是实现细节，不值得赌）。
 */
function canAllocate(side: number): boolean {
  return canAllocateStrip(side, 1) && canAllocateStrip(1, side);
}

function canAllocateStrip(width: number, height: number): boolean {
  try {
    const canvas = createCanvas(width, height);
    const context = ctx2d(canvas);
    // 写最后一个像素再读回。超限画布是空白的，读回来必然是 0
    context.fillStyle = '#ffffff';
    context.fillRect(width - 1, height - 1, 1, 1);
    return ctx2d(canvas).getImageData(width - 1, height - 1, 1, 1).data[3] > 0;
  } catch {
    // 超大尺寸可能直接抛内存错误，同样视为不可用
    return false;
  }
}

/** 当前浏览器支持的最大单边尺寸 */
export function maxCanvasSide(): number {
  if (cachedMaxSide !== null) return cachedMaxSide;
  cachedMaxSide = SIDE_CANDIDATES.find(canAllocate) ?? 2048;
  return cachedMaxSide;
}

/** 供测试重置探测缓存 */
export function resetCanvasLimitCache(): void {
  cachedMaxSide = null;
}

/**
 * 尺寸校验结果。
 *
 * 失败时给的是词条 key 加占位符取值，不是成品文字 —— engine 不认识语言
 * （规约 §2.1 / I18N.md §2.3）。调用方拿 reasonKey 去查词条表。
 */
export interface SizeCheck {
  ok: boolean;
  reasonKey?: string;
  reasonParams?: Record<string, string | number>;
}

/**
 * 校验文档/图层尺寸是否可用。
 * 分开报"单边超限"和"总面积超限"两种原因，因为用户的应对方式不同：
 * 前者要改比例，后者要整体缩小。
 */
export function checkCanvasSize(width: number, height: number): SizeCheck {
  const w = Math.round(width);
  const h = Math.round(height);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 1 || h < 1) {
    return { ok: false, reasonKey: 'error.size.notPositive' };
  }
  const side = maxCanvasSide();
  if (w > side || h > side) {
    return {
      ok: false,
      reasonKey: 'error.size.sideTooLarge',
      reasonParams: { max: side, width: w, height: h },
    };
  }
  if (w * h > MAX_AREA) {
    return {
      ok: false,
      reasonKey: 'error.size.areaTooLarge',
      reasonParams: {
        megapixels: Math.round((w * h) / 1e6),
        max: Math.round(MAX_AREA / 1e6),
      },
    };
  }
  return { ok: true };
}
