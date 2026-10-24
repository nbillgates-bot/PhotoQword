/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 屏幕渲染入口。
 *
 * 职责:把视图状态(zoom/pan/视口尺寸)与图层栈变成主画布上的像素,
 * 并给调用方一份性能统计。CanvasArea 只需调这一个函数。
 *
 * 与旧路径(已删除的 compositeWithCache + LayerCache + LOD)的差别:
 * - 主画布与所有中间缓冲都是**视口尺寸**,不再是文档尺寸(见 viewportRender.ts)
 * - 裁剪在**树上**做,不在扁平数组上做(见 viewCull.ts)
 * - 不再需要 LOD:缩放由变换矩阵和 GPU 的 drawImage 负责,
 *   不用先把每个图层画布缩一份副本(那是旧路径在缩略视图下最大的一笔开销)
 */

import type { Layer } from '../types';
import { buildTree } from './layerTree';
import { countNodes, pruneNodes } from './viewCull';
import { paintNodesInView } from './viewCompositor';
import {
  clipToDocument,
  counters,
  makeViewportContext,
  prepareViewportCanvas,
  resetCounters,
  type ViewportContext,
} from './viewportRender';
import { intersectRect } from './layerBounds';

export interface RenderStats {
  totalMs: number;
  /** 参与合成的节点数 */
  painted: number;
  /** 被视口裁掉的节点数 */
  culled: number;
  /** 当前缩放(文档像素 → 屏幕像素,含 dpr) */
  scale: number;
  /** 主画布尺寸,用于确认真的降下来了 */
  viewWidth: number;
  viewHeight: number;
  /** 这一帧分配了几张中间缓冲 */
  buffers: number;
  /**
   * 缓冲总像素数。**张数不够看,关键是每张多大。**
   * 缓冲曾经一律开整幅视口,82 张 × 4.05Mpx = 332Mpx,占整帧 97~99%;
   * 改成按内容范围开之后这个数应该远小于 buffers × viewWidth × viewHeight。
   */
  bufferPixels: number;
  /**
   * 其中声明了 willReadFrequently 的有几张。
   * 这些放弃了 GPU 光栅化,只有真会 getImageData 才划得来,
   * 所以它应该远小于 buffers——大了就说明又在白付软件光栅的代价。
   */
  readableBuffers: number;
  /** 这一帧从画布读回了多少像素(手写混合、调整图层、剪贴组、图层效果都要读) */
  readbackPixels: number;
}

export interface RenderArgs {
  canvas: HTMLCanvasElement;
  layers: Layer[];
  docWidth: number;
  docHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  /** 设备像素比。默认取 window,测试里可以固定 */
  dpr?: number;
  /**
   * 是否正在拖动/滚轮缩放。交互中降一档重采样质量换帧率,
   * 停手后调用方会用 false 再渲染一遍收敛到高质量。
   */
  interacting?: boolean;
}

/**
 * 设备像素比上限。
 *
 * 3x 屏(部分手机、少数高分屏)上按真实 dpr 分配会让画布面积涨到 9 倍,
 * 而肉眼在 2x 以上已经分辨不出画布本身的锐度差异,不值得为此多付 2 倍多的
 * 合成开销。桌面主流是 1x 与 2x,这个夹取实际只在极少数设备上生效。
 */
const MAX_DPR = 2;

function currentDpr(explicit?: number): number {
  if (explicit !== undefined) return explicit;
  const raw = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
  // 拿不到或拿到 0 时退回 1:分配 0 尺寸的画布会让后面全线抛错
  return Math.min(MAX_DPR, raw > 0 ? raw : 1);
}

/**
 * 渲染一帧到主画布。
 *
 * 调用方要保证 layers 里已经过滤掉「被父组隐藏」「单独显示模式下无关」
 * 这类业务规则(那是 store 的语义,不属于渲染层)。这里只做与几何相关的裁剪。
 */
export function renderViewport(args: RenderArgs): RenderStats {
  const t0 = performance.now();
  resetCounters();
  const view = makeViewportContext({
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    docWidth: args.docWidth,
    docHeight: args.docHeight,
    zoom: args.zoom,
    panX: args.panX,
    panY: args.panY,
    dpr: currentDpr(args.dpr),
    interacting: args.interacting,
  });

  const context = prepareViewportCanvas(args.canvas, view);
  const { painted, culled } = paintLayersInto(context, args.layers, view);

  return {
    totalMs: performance.now() - t0,
    painted,
    culled,
    scale: view.scale,
    viewWidth: view.viewWidth,
    viewHeight: view.viewHeight,
    buffers: counters.buffers,
    bufferPixels: counters.bufferPixels,
    readableBuffers: counters.readableBuffers,
    readbackPixels: counters.readbackPixels,
  };
}

/**
 * 只算视口上下文,不渲染。
 *
 * 覆盖层(蚂蚁线、笔刷环、变换框)要用同一套变换矩阵才能和主画布对齐,
 * 所以把这一步单独暴露出来。
 */
export function viewportContextFor(args: Omit<RenderArgs, 'canvas' | 'layers'>): ViewportContext {
  return makeViewportContext({
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    docWidth: args.docWidth,
    docHeight: args.docHeight,
    zoom: args.zoom,
    panX: args.panX,
    panY: args.panY,
    dpr: currentDpr(args.dpr),
    interacting: args.interacting,
  });
}

/**
 * 往已备好的上下文里画图层。
 *
 * 抽出来是为了让缓存的条带渲染也能用同一套裁剪与合成逻辑。
 * 返回参与合成的图层数和被裁掉的图层数。
 */
export function paintLayersInto(
  context: CanvasRenderingContext2D,
  layers: Layer[],
  view: ViewportContext,
): { painted: number; culled: number } {
  /*
   * 裁剪范围取「视口 ∩ 文档」，不是光取视口。
   *
   * 画布外的像素一律不显示（见 clipToDocument），所以完全落在文档外的图层
   * 连算都不用算。缩小到能看见整个文档时视口比文档大，这一步能把
   * 「被拖出画布的图层」也裁掉；效果溢出由 pruneNodes 自己的外扩负责，
   * 这里不需要为它留边。
   */
  const docBox = { x: 0, y: 0, width: view.docWidth, height: view.docHeight };
  const cullRect = intersectRect(view.docRect, docBox);

  const tree = buildTree(layers);
  const total = countNodes(tree);
  // 视口与文档完全不相交（整个文档都被平移出屏幕）时一个图层都不用画
  const visible = cullRect ? pruneNodes(tree, cullRect) : [];
  const painted = countNodes(visible);

  if (painted > 0) {
    // 已经建过树并裁过了，直接画节点，不要再走 compositeInView（它会重新建树）
    context.save();
    clipToDocument(context, view.docWidth, view.docHeight);
    paintNodesInView(context, visible, view);
    context.restore();
  }

  return { painted, culled: total - painted };
}
