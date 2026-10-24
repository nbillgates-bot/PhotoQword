/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';

/**
 * 图层 patch 的性质判断。纯函数，不认识 store 与 React。
 */

/**
 * 确定不会改变缩略图长相的字段。
 *
 * 这里列的是「安全字段」而不是「像素字段」，方向很重要：将来给 Layer
 * 加了新字段忘了登记，只会多刷一次缩略图（慢一点但画面对）；反过来用
 * 像素字段做白名单，漏登记就会留着旧缩略图不刷（画面错）。
 */
const THUMB_SAFE_KEYS: ReadonlySet<string> = new Set<keyof Layer>([
  'name',
  'visible',
  'locked',
  'lockTransparent',
  'lockPixels',
  'lockPosition',
  'opacity',
  'blendMode',
  'maskSelected',
  'parentId',
  'collapsed',
  'clipped',
  'color',
]);

/**
 * 这个 patch 会不会改变缩略图的长相。
 *
 * 只有全是安全字段才算不影响。空 patch 也算不影响——什么都没改。
 */
export function touchesPixels(patch: Partial<Layer>): boolean {
  return Object.keys(patch).some((key) => !THUMB_SAFE_KEYS.has(key));
}
