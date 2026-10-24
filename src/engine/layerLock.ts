/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';

/**
 * 锁定判定。对齐 PS 图层面板锁定栏的四个开关：
 * 锁定透明像素 / 锁定图像像素 / 锁定位置 / 全部锁定。
 *
 * 全部返回「被挡住的原因」或 null，调用方统一 showToast(原因)，
 * 这样各处的提示文案一致，也不会有人漏判某一种锁。
 */

/** 锁定栏的四个开关，顺序与 PS 一致（透明、图像、位置、全部） */
export type LockKind = 'transparent' | 'pixels' | 'position' | 'all';

/**
 * 锁定栏标签的词条 key。engine 层不认识语言，
 * 只给 key，由面板/store 调 t() 取当前语言的文字。
 */
export const LOCK_LABEL: Record<LockKind, string> = {
  transparent: 'lock.transparent',
  pixels: 'lock.pixels',
  position: 'lock.position',
  all: 'lock.all',
};

/** 「解除锁定 X」的词条 key，供历史记录用 */
export const UNLOCK_LABEL: Record<LockKind, string> = {
  transparent: 'lock.unlockTransparent',
  pixels: 'lock.unlockPixels',
  position: 'lock.unlockPosition',
  all: 'lock.unlockAll',
};

/** 每个锁对应 Layer 上的哪个字段，供批量写入时取键名 */
export const LOCK_FIELD: Record<LockKind, 'lockTransparent' | 'lockPixels' | 'lockPosition' | 'locked'> = {
  transparent: 'lockTransparent',
  pixels: 'lockPixels',
  position: 'lockPosition',
  all: 'locked',
};

/** 该图层某个锁的当前状态 */
export function isLocked(layer: Layer, kind: LockKind): boolean {
  switch (kind) {
    case 'transparent':
      return Boolean(layer.lockTransparent);
    case 'pixels':
      return Boolean(layer.lockPixels);
    case 'position':
      return Boolean(layer.lockPosition);
    case 'all':
      return layer.locked;
  }
}

/**
 * 能不能改这个图层的像素（画、擦、填充、滤镜、变换内容）。
 *
 * 锁定透明像素**不**在这里挡：它允许下笔，只是把结果裁到原有不透明区域，
 * 由 overlaySlice 在合入时处理。在这里挡掉会变成"完全不能画"，与 PS 不符。
 *
 * 返回的是词条 key，调用方直接丢给 showToast 即可（它也收 key）。
 */
export function pixelBlockReason(layer: Layer | null | undefined): string | null {
  if (!layer) return null;
  if (layer.locked) return 'toast.layerLocked';
  if (layer.lockPixels) return 'toast.pixelsLocked';
  return null;
}

/** 能不能移动/变换这个图层。返回词条 key */
export function moveBlockReason(layer: Layer | null | undefined): string | null {
  if (!layer) return null;
  if (layer.locked) return 'toast.layerLocked';
  if (layer.lockPosition) return 'toast.positionLocked';
  return null;
}

/**
 * 变换要同时改位置和重采样像素，两种锁都得让路。
 * PS 里锁了位置就不能自由变换，锁了像素同样不行。
 */
export function transformBlockReason(layer: Layer | null | undefined): string | null {
  return pixelBlockReason(layer) ?? moveBlockReason(layer);
}

/**
 * 勾上「全部锁定」时 PS 会把另外三个也显示为锁上（并置灰）。
 * 面板据此决定按钮的按下态，逻辑判断仍各自走上面几个函数。
 */
export function shownAsLocked(layer: Layer, kind: LockKind): boolean {
  return kind === 'all' ? layer.locked : layer.locked || isLocked(layer, kind);
}
