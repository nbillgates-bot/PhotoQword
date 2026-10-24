/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { DeltaTarget, Layer, LayerDelta, LayerMeta, Rect } from '../types';
import { canvasFromPixels, cutRegion, diffBounds, pasteRegion, readAll } from './pixelDiff';
import { invalidateMask } from './mask';
import { boundsFor } from './layerBounds';
import { type ShadowImage, shadowFromCanvas, shadowFromPixels } from './shadowImage';

/**
 * 历史记录的增量模型。
 *
 * 为什么不整存：每步深拷贝所有图层，4000x3000 五图层单快照就是 229MB，
 * 30 步要 6.7GB，浏览器直接被杀。改成只存"变了的那一块"。
 *
 * 划分原则——**非像素属性绝对存，像素相对存**：
 * 图层名/可见性/不透明度/顺序这些几十字节，整存最省心也最不容易错；
 * 像素动辄几十兆，必须存增量。
 */

// LayerMeta 与 LayerDelta 定义在 types/，避免 engine 反向被依赖（见规约 2.1）
export type { DeltaTarget, LayerDelta, LayerMeta } from '../types';

/** 取图层的非像素属性。canvas 与 mask 都是像素，走增量 */
export function layerMeta(layer: Layer): LayerMeta {
  const { canvas: _canvas, mask, ...meta } = layer;
  return {
    ...meta,
    hasMask: Boolean(mask),
    // 归一成 null，省得 undefined / 缺席 / null 三种写法在下游各判一遍
    parentId: layer.parentId ?? null,
    textData: layer.textData ? { ...layer.textData } : undefined,
    shapeData: layer.shapeData
      ? { ...layer.shapeData, rect: { ...layer.shapeData.rect } }
      : undefined,
    effects: layer.effects
      ? {
          dropShadow: layer.effects.dropShadow ? { ...layer.effects.dropShadow } : undefined,
          outerGlow: layer.effects.outerGlow ? { ...layer.effects.outerGlow } : undefined,
          innerGlow: layer.effects.innerGlow ? { ...layer.effects.innerGlow } : undefined,
          stroke: layer.effects.stroke ? { ...layer.effects.stroke } : undefined,
        }
      : undefined,
  };
}

/** 快照全部图层的非像素属性，按 id 索引 */
export function metaMap(layers: Layer[]): Record<string, LayerMeta> {
  const map: Record<string, LayerMeta> = {};
  for (const layer of layers) map[layer.id] = layerMeta(layer);
  return map;
}

/** 差分块超过这个占比就不如整存，省下两次 putImageData 的开销 */
const FULL_THRESHOLD = 0.9;

/**
 * 比较一张画布的前后像素，生成增量。没有变化时返回 null。
 * shadow 是上一次提交时留下的像素副本；传 null 表示这张画布是新出现的。
 */
export function buildDelta(
  layerId: string,
  target: DeltaTarget,
  canvas: HTMLCanvasElement | undefined,
  shadow: ImageData | null,
): LayerDelta | null {
  return scanCanvas(layerId, target, canvas, shadow ? shadowFromPixels(shadow) : null).delta;
}

/**
 * 一张画布的扫描结果。
 * pixels 是这次读到的当前像素，正好可以当下一次比对的影子副本，
 * 调用方拿它去更新影子就不用再来一次整幅 getImageData ——
 * 几百个图层时那一次重复读取就是明显的卡顿。
 */
interface CanvasScan {
  delta: LayerDelta | null;
  /** 画布不存在时为 null */
  pixels: ImageData | null;
}

function scanCanvas(
  layerId: string,
  target: DeltaTarget,
  canvas: HTMLCanvasElement | undefined,
  shadow: ShadowImage | null,
): CanvasScan {
  if (!canvas) {
    // 画布没了（删蒙版）。之前也没有就是无事发生
    const delta: LayerDelta | null = shadow
      ? { kind: 'full', layerId, target, before: shadow.pixels(), after: null }
      : null;
    return { delta, pixels: null };
  }
  const current = readAll(canvas);
  const full = (before: ImageData | null): CanvasScan => ({
    delta: { kind: 'full', layerId, target, before, after: current },
    pixels: current,
  });
  if (!shadow) return full(null);
  /*
   * 尺寸变了（改画布大小、旋转）就没法按区域比对，只能整存。
   * 先比尺寸再解像素：ShadowImage 的宽高是现成的，
   * 这条分支下那次整幅回读就省掉了。
   */
  if (shadow.width !== current.width || shadow.height !== current.height) {
    return full(shadow.pixels());
  }

  const before = shadow.pixels();
  const rect = diffBounds(before, current);
  if (!rect) return { delta: null, pixels: current };

  const ratio = (rect.width * rect.height) / (current.width * current.height);
  if (ratio >= FULL_THRESHOLD) return full(before);
  return {
    delta: {
      kind: 'region',
      layerId,
      target,
      rect,
      before: cutRegionOf(before, rect),
      after: cutRegion(canvas, rect),
    },
    pixels: current,
  };
}

/** 一个图层两张画布的影子副本。像素是懒解的，见 ShadowImage */
export interface LayerShadow {
  canvas: ShadowImage;
  mask: ShadowImage | null;
}

/** 一个图层的扫描结果：增量 + 可直接复用的新影子副本 */
export interface LayerScan {
  deltas: LayerDelta[];
  shadow: LayerShadow;
}

/**
 * 比较一个图层的像素与蒙版，生成 0-2 条增量，
 * 同时把这次读到的像素作为新影子返回（不再另读一遍，见 CanvasScan）。
 */
export function scanLayer(layer: Layer, shadow: LayerShadow | null): LayerScan {
  const pixels = scanCanvas(layer.id, 'canvas', layer.canvas, shadow?.canvas ?? null);
  const mask = scanCanvas(layer.id, 'mask', layer.mask, shadow?.mask ?? null);
  const deltas: LayerDelta[] = [];
  if (pixels.delta) deltas.push(pixels.delta);
  if (mask.delta) deltas.push(mask.delta);
  return {
    deltas,
    /*
     * 扫描过程已经把当前像素读出来了，直接拿它当新影子，不必再回读一遍。
     * pixels 为空只可能是画布不存在（scanCanvas 的第一条分支），
     * 而 canvas 是 Layer 的必填字段，所以这里退化成冻结一次。
     */
    shadow: {
      canvas: pixels.pixels ? shadowFromPixels(pixels.pixels) : shadowFromCanvas(layer.canvas),
      mask: mask.pixels ? shadowFromPixels(mask.pixels) : null,
    },
  };
}

/**
 * 记下一个图层当前的两张画布，用作下一次比对的基准。
 *
 * 只冻结、不解像素：几百个图层一起建基准时，那几百次整幅 getImageData
 * 就是打开大 PSD 时最后卡住的那几秒。谁被编辑了谁才付回读的代价。
 */
export function readShadow(layer: Layer): LayerShadow {
  return {
    canvas: shadowFromCanvas(layer.canvas),
    mask: layer.mask ? shadowFromCanvas(layer.mask) : null,
  };
}

/** 从一份 ImageData 里抠出子矩形。影子副本不是画布，不能直接 getImageData */
function cutRegionOf(source: ImageData, rect: Rect): ImageData {
  return cutRegion(canvasFromPixels(source), rect);
}

/**
 * 为已删除的图层生成"消失"增量（像素与蒙版各一条）。
 * 这里必须解出像素：增量要存进历史记录，撤销删除时靠它把图层贴回来。
 */
export function removalDeltas(layerId: string, shadow: LayerShadow): LayerDelta[] {
  const deltas: LayerDelta[] = [
    { kind: 'full', layerId, target: 'canvas', before: shadow.canvas.pixels(), after: null },
  ];
  if (shadow.mask) {
    deltas.push({
      kind: 'full',
      layerId,
      target: 'mask',
      before: shadow.mask.pixels(),
      after: null,
    });
  }
  return deltas;
}

/**
 * 把增量应用到图层上。direction 决定用 before 还是 after。
 * 就地修改传入的 layers 数组元素的画布内容。
 */
export function applyDelta(
  delta: LayerDelta,
  layers: Layer[],
  direction: 'undo' | 'redo',
): void {
  const layer = layers.find((item) => item.id === delta.layerId);
  if (!layer) return;

  if (delta.kind === 'region') {
    // 区域增量的前提是画布还在。蒙版可能已被别的增量删掉，这里要兜住
    const canvas = delta.target === 'mask' ? layer.mask : layer.canvas;
    if (!canvas) return;
    pasteRegion(canvas, delta.rect, direction === 'undo' ? delta.before : delta.after);
    if (delta.target === 'mask') invalidateMask(canvas);
    return;
  }

  const pixels = direction === 'undo' ? delta.before : delta.after;
  if (delta.target === 'mask') {
    // after/before 为 null 表示该方向上蒙版不存在
    layer.mask = pixels ? canvasFromPixels(pixels) : undefined;
    return;
  }
  if (!pixels) return; // 该方向上图层不存在，由图层列表的增删负责
  layer.canvas = canvasFromPixels(pixels);
  // 位置取自 meta 快照（rebuildLayers 已还原），尺寸必须跟着新画布走，
  // 否则历史里跨过一次裁剪/改尺寸之后 bounds 就和画布对不上了
  layer.bounds = boundsFor(layer.canvas, layer.bounds.x, layer.bounds.y);
}
