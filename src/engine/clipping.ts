/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';
import { createReadbackCanvas, ctx2d } from './canvasUtils';
import { childrenOf } from './layerTree';

/**
 * 剪贴蒙版的纯计算。不认识 store 与 React。
 *
 * PS 的模型：剪贴组 = 一个「基底」+ 紧贴它上面连续若干个 clipped 的图层。
 * 关系由栈里的相邻顺序决定，不存 id（见 Layer.clipped 的注释）。
 */

/** 一段剪贴组：基底 + 被剪贴到它上面的成员，成员自底向上 */
export interface ClipRun<T> {
  base: T;
  members: T[];
}

/**
 * 把同级节点（自底向上）切成若干剪贴组。
 *
 * 最底下那个即使标了 clipped 也没有基底可剪，按普通图层处理，
 * 与 PS 一致：把最底层拖到栈底后剪贴关系自动失效，标记本身留着。
 */
export function clipRuns<T>(nodes: T[], isClipped: (node: T) => boolean): ClipRun<T>[] {
  const runs: ClipRun<T>[] = [];
  for (const node of nodes) {
    const last = runs[runs.length - 1];
    if (last && isClipped(node)) last.members.push(node);
    else runs.push({ base: node, members: [] });
  }
  return runs;
}

/**
 * 把 content 的 alpha 逐像素换成 base 的 alpha，就地修改 content。
 *
 * 不用 destination-in 是因为它做的是 alpha 相乘：
 * 成员自身半透明时会和基底的半透明再乘一次，边缘比 PS 更淡。
 * PS 的剪贴组最终 alpha 就等于基底的 alpha，所以这里直接赋值。
 */
export function clipToAlpha(content: HTMLCanvasElement, base: HTMLCanvasElement): void {
  const { width, height } = content;
  if (width === 0 || height === 0) return;
  const contentCtx = ctx2d(content);
  const pixels = contentCtx.getImageData(0, 0, width, height);
  const baseAlpha = ctx2d(sized(base, width, height)).getImageData(0, 0, width, height);
  const a = pixels.data;
  const b = baseAlpha.data;
  for (let i = 3; i < a.length; i += 4) a[i] = b[i];
  contentCtx.putImageData(pixels, 0, 0);
}

/** 保证画布与目标同尺寸，getImageData 尺寸不匹配会直接抛错 */
function sized(source: HTMLCanvasElement, width: number, height: number): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;
  // 造出来就是给上面 getImageData 用的
  const out = createReadbackCanvas(width, height);
  ctx2d(out).drawImage(source, 0, 0);
  return out;
}

/**
 * 该图层能否成为剪贴组的成员：同级里它下面得有一层。
 *
 * PS 里最底层的「创建剪贴蒙版」是灰的，因为没有基底。
 * 组也可以被剪贴，也可以当基底，所以不限类型。
 */
export function canClip(layers: Layer[], id: string): boolean {
  const layer = layers.find((item) => item.id === id);
  if (!layer) return false;
  const siblings = childrenOf(layers, layer.parentId ?? null);
  return siblings.findIndex((item) => item.id === id) > 0;
}

/** 面板一行需要的剪贴信息 */
export interface ClipInfo {
  /** 在剪贴组里且确实有基底，要画缩进与向下箭头 */
  clipped: boolean;
  /** 同级里下面还有层，可以与下方建立剪贴关系 */
  canClipHere: boolean;
}

/**
 * 一趟算出所有图层的剪贴信息。
 *
 * 逐行调 canClip / clipBaseOf 的话，每次都要 find 加 childrenOf 全表扫一遍，
 * 面板上是 O(n²)；几百个图层时选一下图层就明显卡。这里按 parentId 分好组，
 * 每组从底往上扫一次即可。
 */
export function clipInfoOf(layers: Layer[]): Map<string, ClipInfo> {
  const groups = new Map<string, Layer[]>();
  for (const layer of layers) {
    // null 与 undefined 都表示最外层，键要统一
    const key = layer.parentId ?? '';
    const bucket = groups.get(key);
    if (bucket) bucket.push(layer);
    else groups.set(key, [layer]);
  }

  const info = new Map<string, ClipInfo>();
  for (const siblings of groups.values()) {
    // 同级自底向上：base 记着当前这段剪贴组的基底
    let base: string | null = null;
    siblings.forEach((layer, at) => {
      if (!layer.clipped) base = layer.id;
      info.set(layer.id, {
        clipped: Boolean(layer.clipped) && base !== null && base !== layer.id,
        canClipHere: at > 0,
      });
    });
  }
  return info;
}

/**
 * 某图层所在剪贴组的基底 id，不在剪贴组里时返回 null。
 * 面板上要据此给成员画缩进与箭头。
 */
export function clipBaseOf(layers: Layer[], id: string): string | null {
  const layer = layers.find((item) => item.id === id);
  if (!layer?.clipped) return null;
  const siblings = childrenOf(layers, layer.parentId ?? null);
  let at = siblings.findIndex((item) => item.id === id);
  // 往下找第一个没被剪贴的：连续的成员共用同一个基底
  while (at > 0) {
    at -= 1;
    if (!siblings[at].clipped) return siblings[at].id;
  }
  return null;
}
