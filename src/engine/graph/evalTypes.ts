/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 求值器的对外契约。
 *
 * 图里只存 id（surfaceId / maskId / textId / shapeId），不存像素本身——
 * 节点要能被廉价复制（每次改属性都会造新对象），挂着画布就复制不起。
 * 于是「id → 像素」这一步交给调用方注入，求值器只管结构与合成次序。
 *
 * 这样做的另一个好处是可测：测试传个假的 resolver 就能验证合成语义，
 * 不需要真的分块存储与滤镜实现。
 */

import type { AdjustmentKind, GraphNode } from '../../types/graph';
import type { Rect } from '../../types';

/**
 * 内容解析器：把节点变成一张文档坐标系下的画布。
 *
 * 返回 null 表示该节点当前没有可画的内容（空图层、字空着、源丢了），
 * 求值器会跳过它而不是抛错——单个节点出问题不该让整幅画面白掉。
 */
export interface ContentResolver {
  /** 像素节点的像素。含图层自己的位置，不含蒙版 */
  pixels(node: GraphNode): HTMLCanvasElement | null;
  /**
   * 蒙版画布，灰度。没有则返回 null。
   * 尺寸不一定是文档尺寸——见 mask.ts 的 maskGeometry，普通图层是图层尺寸、
   * 对齐到 bounds。求值时用 applyMaskAt 摆位，不要拉伸。
   */
  mask(maskId: string): HTMLCanvasElement | null;
  /** 文字/形状节点栅格化后的结果，文档坐标 */
  raster?(node: GraphNode): HTMLCanvasElement | null;
}

/**
 * 调整的施加者。就地修改传入的 ImageData。
 *
 * 之所以不在求值器里直接 import adjustments：调整种类会一直加，
 * 每加一种都要改求值器就违反了开闭；而且求值器的测试不该依赖具体算法。
 */
export type AdjustmentApplier = (
  image: ImageData,
  kind: AdjustmentKind,
  params: Record<string, unknown>,
) => void;

/** 滤镜的施加者。返回新画布（滤镜大多要卷积，没法就地做） */
export type FilterApplier = (
  source: HTMLCanvasElement,
  filterId: string,
  params: Record<string, unknown>,
) => HTMLCanvasElement | null;

export interface EvalContext {
  width: number;
  height: number;
  resolver: ContentResolver;
  applyAdjustment?: AdjustmentApplier;
  applyFilter?: FilterApplier;
  /** 只求这块区域，用于视口裁剪。不传则整幅 */
  viewport?: Rect;
}
