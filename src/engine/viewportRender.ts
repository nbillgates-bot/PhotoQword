/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 视口渲染：在屏幕尺寸画布上绘制文档内容。
 *
 * **核心优化：**
 * 旧方案: 分配 doc.width × doc.height 的画布(790×16041 = 50MB),用 CSS transform 缩放显示
 * 新方案: 分配 viewport 尺寸画布(~1200×800 = 3.8MB),用 ctx.setTransform 在上面绘制文档坐标
 *
 * 性能提升: 内存 -92%, 合成时间 -13x, 所有操作都变快(zoom/pan/drag/show-hide)
 *
 * **坐标系:**
 * - 文档坐标: 原始像素位置,与 zoom 无关(0,0)~(docWidth,docHeight)
 * - 视口坐标: 屏幕像素,canvas 本地坐标(0,0)~(viewWidth,viewHeight)
 * - 变换矩阵: ctx.setTransform(zoom, 0, 0, zoom, originX, originY)
 *   其中 origin 是文档(0,0)在视口坐标系中的位置
 *
 * **与现有代码的配合:**
 * - compositor.ts 仍然在文档坐标工作,只是把 target 换成带变换矩阵的视口画布
 * - CanvasArea.tsx 主画布改为视口尺寸,compositor 传入变换后的 target
 * - 工具坐标 toDoc/toViewport 不变,已经是分离的
 */

import type { Layer, Rect } from '../types';
import { createCanvas, createReadbackCanvas, ctx2d } from './canvasUtils';
import type { Viewport } from './compositor';
import { documentOrigin } from './viewportRect';

/** 视口渲染上下文 */
export interface ViewportContext {
  /** 视口尺寸(屏幕像素,已含 devicePixelRatio) */
  viewWidth: number;
  viewHeight: number;
  /** 缩放比例(文档像素 → 屏幕像素) */
  scale: number;
  /** 文档(0,0)在视口坐标系中的位置(屏幕像素) */
  originX: number;
  originY: number;
  /** 视口覆盖的文档区域(文档坐标),用于裁剪 */
  docRect: Viewport;
  /**
   * 文档尺寸(文档像素)。
   *
   * 带着它是为了能算出「画面上真正可能有内容的那块」:画布外一律不显示
   * (见 clipToDocument),所以调整图层读背景时不必读整幅视口。缩小看长图时
   * 文档只占视口一小条,差别是几十倍。
   * 换算走 docRectToViewRect,子视口也能直接用——它按 view 的原点算。
   */
  docWidth: number;
  docHeight: number;
  /**
   * 缩小时的重采样质量。
   *
   * 手势进行中用 'low'：'high' 在缩小倍率下会走多次逐级降采样(Skia 的
   * mipmap 路径),一张大图能差出好几毫秒,几十个图层叠起来就是掉帧。
   * 停手之后再用 'high' 重画一遍,静止画面看到的仍是高质量结果。
   * 这也是 PS 的做法:拖动中画质是降级的,松手才收敛。
   */
  smoothingQuality: ImageSmoothingQuality;
}

/**
 * 由视口尺寸与视图状态算出渲染上下文。
 *
 * dpr 单独传是为了让测试能固定它:jsdom 里 devicePixelRatio 是 1,
 * 而真机上 2x 屏会让画布尺寸翻倍,两条路径都要能验证。
 */
export function makeViewportContext(args: {
  viewportWidth: number;
  viewportHeight: number;
  docWidth: number;
  docHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  dpr: number;
  /** 是否正在拖动/滚轮缩放。默认 false，即按静止画质渲染 */
  interacting?: boolean;
}): ViewportContext {
  const { viewportWidth, viewportHeight, docWidth, docHeight, zoom, panX, panY, dpr } = args;
  const origin = documentOrigin({
    viewport: { width: viewportWidth, height: viewportHeight },
    docWidth,
    docHeight,
    zoom,
    panX,
    panY,
  });
  const scale = zoom * dpr;
  return {
    viewWidth: Math.max(1, Math.round(viewportWidth * dpr)),
    viewHeight: Math.max(1, Math.round(viewportHeight * dpr)),
    scale,
    smoothingQuality: args.interacting ? 'low' : 'high',
    docWidth,
    docHeight,
    originX: origin.x * dpr,
    originY: origin.y * dpr,
    // 视口能看到的文档范围。zoom 非法时退化成整个文档,宁可不裁也不裁错
    docRect:
      zoom > 0
        ? {
            x: -origin.x / zoom,
            y: -origin.y / zoom,
            width: viewportWidth / zoom,
            height: viewportHeight / zoom,
          }
        : { x: 0, y: 0, width: docWidth, height: docHeight },
  };
}

/**
 * 把画布尺寸对齐到视口,并装好文档坐标的变换矩阵。
 *
 * 装完之后调用方可以继续按文档坐标画(drawImage(layer, bounds.x, bounds.y)),
 * 由矩阵负责缩放与平移,不需要每处自己乘 zoom。
 *
 * 尺寸没变时不重新赋值 width/height:给 canvas.width 赋值会清空内容并重置
 * 上下文状态,每帧无条件赋值等于每帧多一次全幅清屏。
 */
export function prepareViewportCanvas(
  canvas: HTMLCanvasElement,
  view: ViewportContext,
): CanvasRenderingContext2D {
  if (canvas.width !== view.viewWidth || canvas.height !== view.viewHeight) {
    canvas.width = view.viewWidth;
    canvas.height = view.viewHeight;
  }
  const context = ctx2d(canvas);
  // 先复位再清屏:带矩阵的 clearRect 只会清到文档那块,视口其余部分会留上一帧的残影
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, view.viewWidth, view.viewHeight);
  applyViewTransform(context, view);
  return context;
}

/**
 * 给上下文装上「文档坐标 → 视口坐标」的变换。
 *
 * imageSmoothing 跟着放大倍数切:PS 在 300% 以上显示硬边像素方块,
 * 低倍数下才做平滑重采样。这与旧方案里 CSS 的 image-rendering: pixelated 等价,
 * 只是现在缩放发生在 canvas 内部,得由 canvas 自己决定插值方式。
 */
export function applyViewTransform(
  context: CanvasRenderingContext2D,
  view: ViewportContext,
): void {
  context.setTransform(view.scale, 0, 0, view.scale, view.originX, view.originY);
  applySmoothing(context, view);
}

/**
 * 按当前缩放与交互状态设好插值方式。
 *
 * 主画布和每张中间缓冲都要设一遍(缓冲是独立的上下文,不继承主画布的设置),
 * 所以抽出来一份,免得两处漏掉一处就出现「主画布锐利、缓冲模糊」。
 */
export function applySmoothing(
  context: CanvasRenderingContext2D,
  view: ViewportContext,
): void {
  // 300% 以上关掉插值,显示硬边像素方块,与 PS 一致
  const smooth = view.scale < 3;
  context.imageSmoothingEnabled = smooth;
  if (smooth) context.imageSmoothingQuality = view.smoothingQuality;
}

/**
 * 一张中间缓冲,连同它在视口坐标里的位置。
 *
 * 位置必须跟着缓冲一起走:缓冲不再是整幅视口,而是只开到内容的可见范围,
 * 于是「缓冲本地坐标」和「视口坐标」差了一个偏移。让调用点各自记这个偏移
 * 是 bug 温床(合成、混合、剪贴三条路都要用),所以打包成一个类型。
 */
export interface ViewBuffer {
  canvas: HTMLCanvasElement;
  /** 缓冲左上角在视口坐标里的位置(视口像素) */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 建一张只覆盖 box 的中间缓冲,并装好变换矩阵。
 *
 * **这是渲染性能的关键。** 原先每张缓冲都开整幅视口:016.psd 一帧 82 张
 * 4.05Mpx 缓冲 = 分配 1.24GB、填充合成 332Mpx。实测每张缓冲约 53ms、
 * 占整帧 97~99%,而且在 scale 0.075~0.255 的 3.4 倍范围内几乎不随缩放变化
 * ——典型的「每层做了一份视口大小的活」。
 *
 * 按内容可见范围开之后,scale=0.109 下一个 790×800 的图层只要 87×88,
 * 是整幅视口的 1/529。
 *
 * 矩阵里把 box 的偏移减掉,调用方仍然按文档坐标画,不必关心缓冲多大、在哪。
 */
export function createViewBufferAt(view: ViewportContext, box: Viewport): ViewBuffer {
  return trackBuffer(createCanvas(box.width, box.height), view, box);
}

/**
 * 建一张**会被 getImageData 读**的局部缓冲。
 *
 * 只给确定要读的路径用:手写混合(blendImageData)、剪贴组(clipToAlpha 读两幅)、
 * 图层效果(extractSilhouette 读源)。其余一律走 createViewBufferAt 留在 GPU 上。
 */
export function createReadableViewBufferAt(view: ViewportContext, box: Viewport): ViewBuffer {
  counters.readableBuffers += 1;
  return trackBuffer(createReadbackCanvas(box.width, box.height), view, box);
}

function trackBuffer(
  canvas: HTMLCanvasElement,
  view: ViewportContext,
  box: Viewport,
): ViewBuffer {
  const context = ctx2d(canvas);
  context.setTransform(view.scale, 0, 0, view.scale, view.originX - box.x, view.originY - box.y);
  applySmoothing(context, view);
  counters.buffers += 1;
  counters.bufferPixels += box.width * box.height;
  return { canvas, x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * 整幅视口大小的 box。给「内容范围算不出来」的兜底路径用。
 */
export function fullViewBox(view: ViewportContext): Viewport {
  return { x: 0, y: 0, width: view.viewWidth, height: view.viewHeight };
}

/**
 * 画面上真正可能有内容的那块(视口像素),即「视口 ∩ 文档」。
 * 文档完全在视口外时返回 null。
 *
 * 给调整图层这类「要读背景」的路径用:画布外一律不显示,读了也是白读。
 * 缩小看长图时文档只占视口一小条,这一步能把读回量降一两个数量级。
 */
export function contentViewBox(view: ViewportContext): Viewport | null {
  return docRectToViewRect(
    { x: 0, y: 0, width: view.docWidth, height: view.docHeight },
    view,
  );
}

/**
 * 把「视口」换成某张局部缓冲本身。
 *
 * 组和剪贴组要往局部缓冲里递归画子节点,子节点又要算自己的 box。如果还拿外层
 * view 算,算出来是外层视口坐标,而落笔的目标是缓冲本地坐标,差一个 box 偏移
 * ——内容会整体错位。所以进缓冲之前把 view 换成「以这张缓冲为视口」的版本:
 * 原点减掉偏移,尺寸换成缓冲尺寸,子节点的 box 于是天然就是缓冲本地坐标,
 * 而且会被裁到缓冲边界内。docRect 同步收窄,组外的子节点顺带被剔除。
 */
export function subViewport(view: ViewportContext, box: Viewport): ViewportContext {
  const scale = view.scale || 1;
  const originX = view.originX - box.x;
  const originY = view.originY - box.y;
  return {
    viewWidth: box.width,
    viewHeight: box.height,
    scale: view.scale,
    originX,
    originY,
    // 质量档要跟着传:组内的子节点也在同一帧里画,不能一半 low 一半 high
    smoothingQuality: view.smoothingQuality,
    // 文档尺寸与视口无关，进了缓冲还是同一个文档
    docWidth: view.docWidth,
    docHeight: view.docHeight,
    docRect: {
      // 写成 (0 - o) / s 而不是 -o / s:后者在 o 为 0 时得到 -0,
      // 会让「文档原点刚好落在缓冲左上角」这种常见情形带上负零往下传
      x: (0 - originX) / scale,
      y: (0 - originY) / scale,
      width: box.width / scale,
      height: box.height / scale,
    },
  };
}

/**
 * 一帧之内的开销计数,用来定位「慢在哪一项」。
 *
 * 用模块级可变量而不是把统计一路传参:这些量要在合成的最深处累加
 * (缓冲分配、每一次 getImageData),一路传下去会污染十几个函数的签名,
 * 而它只服务于诊断。renderViewport 每帧开头 reset 一次。
 */
export const counters = {
  buffers: 0,
  readableBuffers: 0,
  /** 缓冲总像素数。缓冲「张数」不够看,关键是每张多大 */
  bufferPixels: 0,
  readbackPixels: 0,
};

export function resetCounters(): void {
  counters.buffers = 0;
  counters.readableBuffers = 0;
  counters.bufferPixels = 0;
  counters.readbackPixels = 0;
}

/** 记一次画布读回。像素数而不是次数:一次整幅和一次小块的代价差几百倍 */
export function countReadback(width: number, height: number): void {
  counters.readbackPixels += width * height;
}

/**
 * 文档坐标矩形 → 视口像素矩形,并夹进视口范围。完全在视口外时返回 null。
 *
 * 手写混合模式的 getImageData 要按视口像素取范围。取整往外扩一格
 * (floor 起点、ceil 终点)是为了避免非整数缩放下边缘漏一行像素。
 */
export function docRectToViewRect(rect: Rect, view: ViewportContext): Viewport | null {
  const left = Math.floor(rect.x * view.scale + view.originX);
  const top = Math.floor(rect.y * view.scale + view.originY);
  const right = Math.ceil((rect.x + rect.width) * view.scale + view.originX);
  const bottom = Math.ceil((rect.y + rect.height) * view.scale + view.originY);

  const x = Math.max(0, left);
  const y = Math.max(0, top);
  const clampedRight = Math.min(view.viewWidth, right);
  const clampedBottom = Math.min(view.viewHeight, bottom);
  if (clampedRight <= x || clampedBottom <= y) return null;
  return { x, y, width: clampedRight - x, height: clampedBottom - y };
}

/**
 * 把上下文裁到文档矩形之内。
 *
 * 旧方案的画布本身就是文档尺寸,超出文档的像素被画布边界天然裁掉。
 * 改成视口画布之后文档外那片区域也是可画的,于是「图层被拖出画布」
 * 「图层比画布大」这两种情形会把画布外的内容也显示出来——PS 里画布外
 * 一律不显示,只在图层边框里能看出内容还在。所以这里补一次显式裁剪。
 *
 * 只给主画布用,不给覆盖层用:变换框的手柄、参考线要能画到画布之外,
 * PS 也是这样(手柄拖出画布边缘依然看得见)。
 *
 * 调用方要在 restore 之前画完;prepareViewportCanvas 已经把矩阵装好,
 * 这里按文档坐标下 clip 即可。
 */
export function clipToDocument(
  context: CanvasRenderingContext2D,
  docWidth: number,
  docHeight: number,
): void {
  context.beginPath();
  context.rect(0, 0, docWidth, docHeight);
  context.clip();
}

/** 图层在文档坐标里的外接框 */
export function layerDocRect(layer: Layer): Rect {
  return {
    x: layer.bounds.x,
    y: layer.bounds.y,
    width: layer.canvas.width,
    height: layer.canvas.height,
  };
}

/**
 * 两个视口矩形的并集,再夹进视口。用来算一组图层共同的缓冲范围。
 * 任一为 null 时返回另一个,方便在循环里累加。
 */
export function unionViewRect(
  a: Viewport | null,
  b: Viewport | null,
): Viewport | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * 把视口矩形往外扩 pad 个视口像素,再夹进视口。
 *
 * 图层效果(投影、发光、描边)会画到 bounds 之外,缓冲只开到 bounds
 * 就会把效果切掉,所以要按效果的最大伸展量留边。
 */
export function padViewRect(box: Viewport, pad: number, view: ViewportContext): Viewport | null {
  const x = Math.max(0, Math.floor(box.x - pad));
  const y = Math.max(0, Math.floor(box.y - pad));
  const right = Math.min(view.viewWidth, Math.ceil(box.x + box.width + pad));
  const bottom = Math.min(view.viewHeight, Math.ceil(box.y + box.height + pad));
  if (right <= x || bottom <= y) return null;
  return { x, y, width: right - x, height: bottom - y };
}
