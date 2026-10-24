/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 视口空间合成器。
 *
 * 与 compositor.ts 的关系:两者的图层语义完全一致(组隔离、剪贴组、混合模式、
 * 蒙版、效果的处理顺序都照搬),区别只在**中间缓冲的尺寸**:
 *
 * - compositor.ts 的每张缓冲都是文档尺寸。790×16041 的长图一张就要 50MB,
 *   组嵌套 + 剪贴组几层下来是几百 MB 的瞬时分配,这是「点一下眼睛卡三秒」的根因。
 * - 这里的每张缓冲都是视口尺寸(约 1200×800 = 3.8MB),并且带上
 *   「文档坐标 → 视口坐标」的变换矩阵,所以内部代码照旧按文档坐标画。
 *
 * 视口外的内容本来就不显示,裁掉不影响画面。屏幕合成走这条路,
 * 导出与拼合仍走 compositor.ts 的文档尺寸路径(导出要的是完整文档,不能裁)。
 */

import type { BlendMode, Layer } from '../types';
import { ctx2d } from './canvasUtils';
import { blendImageData, isNativeBlend, nativeOperation } from './blendModes';
import { buildTree, type LayerNode } from './layerTree';
import { clipRuns, clipToAlpha } from './clipping';
import { maskOrigin, maskToAlpha } from './mask';
import { applyAdjust } from './adjustments';
import {
  renderDropShadow,
  renderOuterGlow,
  renderInnerGlow,
  renderStroke,
} from './layerEffects';
import {
  effectReach,
  scaleDropShadow,
  scaleInnerGlow,
  scaleOuterGlow,
  scaleStroke,
} from './viewEffects';
import {
  applyViewTransform,
  countReadback,
  createReadableViewBufferAt,
  createViewBufferAt,
  docRectToViewRect,
  contentViewBox,
  fullViewBox,
  layerDocRect,
  padViewRect,
  subViewport,
  unionViewRect,
  type ViewBuffer,
  type ViewportContext,
} from './viewportRender';
import type { Viewport } from './compositor';

/*
 * 穿透没有对应的像素混合公式:隔离后的组按正常处理(PS 同此)。
 * 不归一化会掉进 blendImageData 的「CUSTOM 里没这个模式就 return」,
 * 结果是整个图层完全不显示,比画错更难查。
 */
function normalizeBlend(mode: BlendMode): BlendMode {
  return mode === 'pass-through' ? 'normal' : mode;
}

/**
 * 缓冲分配策略。
 *
 * 传函数而不是传 boolean:声明可读回会让画布退出 GPU、改用软件光栅,
 * 是个有实际代价的选择,调用点必须明确表态自己会不会读。
 * 规约 1.3 也不允许为了这种差异往已有函数里塞 flag 参数。
 */
type ViewBufferAlloc = (view: ViewportContext, box: Viewport) => ViewBuffer;

/**
 * 这一层的中间缓冲会不会被 getImageData 读。
 *
 * 两种情况会读:手写混合要 blendImageData 逐像素混;有效果时
 * extractSilhouette 要读源取轮廓。只有蒙版、且混合模式是原生的,
 * 全程只有 blit,可以留在 GPU 上。
 *
 * 剪贴组另算:基底和成员缓冲都要过 clipToAlpha,由调用点直接指定可读回。
 */
function bufferAllocFor(layer: Layer): ViewBufferAlloc {
  const reads = Boolean(layer.effects) || !isNativeBlend(normalizeBlend(layer.blendMode));
  return reads ? createReadableViewBufferAt : createViewBufferAt;
}

/**
 * 一个节点的内容在视口里占的范围,组会递归并入所有可见子节点。
 *
 * 缓冲按这个范围开,而不是整幅视口——这是渲染开销从 4448ms 降下来的关键。
 * 返回 null 表示完全在视口外,调用方可以整条路跳过。
 *
 * 组自己的 canvas 是 1×1 占位符(见 PSD 导入),所以组必须看子节点,
 * 拿组的 bounds 会得到一个几乎为空的框,把内容全切掉。
 */
/*
 * 测试专用开关。局部缓冲的正确性契约是「结果必须和全视口缓冲逐像素一致」,
 * 而这个契约只能靠同一条路径跑两遍来验(换成文档路径对照就混进重采样噪声了)。
 * 生产代码里恒为 false,只有 viewBufferParity 测试会把它打开。
 */
function fullViewportBuffers(): boolean {
  return Boolean((globalThis as { __qwordFullViewportBuffers?: boolean }).__qwordFullViewportBuffers);
}

/**
 * 每张局部缓冲必须留的边(视口像素)。
 *
 * **不留这一圈,缩略视图下的图层会整个消失。** drawImage 开了平滑之后,
 * 落点不是「几何矩形之内」那么干净:双线性/多级降采样会在边缘外再吐出约一个
 * 目标像素的覆盖。缓冲开得跟 box 一样大时,这一圈覆盖直接被缓冲边界切掉。
 *
 * 整数缩放下这只是边缘淡一档,看不出来;缩得很小时却是致命的——一行 8px 高的
 * 文字在 scale 0.109 下只有 0.87 个视口像素高,它的全部覆盖都是「边缘覆盖」,
 * 切掉边缘就等于整层不见。所以留边跟效果无关,是所有缓冲的硬性要求。
 *
 * 取 1 是因为平滑采样的溢出以目标像素为单位,再大只是白花像素。
 */
export const RASTER_BLEED = 1;

function nodeViewBox(node: LayerNode, view: ViewportContext): Viewport | null {
  const { layer } = node;
  if (!layer.visible || layer.opacity <= 0) return null;
  if (fullViewportBuffers()) return fullViewBox(view);

  if (layer.type === 'group') {
    let box: Viewport | null = null;
    for (const child of node.children) box = unionViewRect(box, nodeViewBox(child, view));
    // 子节点的 box 各自已经留了边,并集不必再留;但组自己的效果要按组的伸展量留
    if (box && layer.effects) {
      return padViewRect(box, effectReach(layer.effects) * view.scale, view);
    }
    return box;
  }

  const box = docRectToViewRect(layerDocRect(layer), view);
  if (!box) return null;
  // 效果会画到 bounds 之外,按最大伸展量留边(文档像素 → 视口像素要乘 scale);
  // 平滑采样的溢出与效果无关,两者都要留,取大的那个
  const pad = layer.effects ? Math.max(RASTER_BLEED, effectReach(layer.effects) * view.scale) : RASTER_BLEED;
  return padViewRect(box, pad, view);
}

/** 把一层兄弟节点按自底向上顺序画到 target 上,先切剪贴组 */
export function paintNodesInView(
  target: CanvasRenderingContext2D,
  nodes: LayerNode[],
  view: ViewportContext,
): void {
  for (const run of clipRuns(nodes, (node) => Boolean(node.layer.clipped))) {
    if (run.members.length === 0) {
      paintNodeInView(target, run.base, view);
      continue;
    }
    paintClipRunInView(target, run.base, run.members, view);
  }
}

/**
 * 画单个节点(组走组的路径),不考虑剪贴。
 *
 * 组隐藏时直接 return,子节点不递归进去——PS 的行为:组的眼睛关了,
 * 组内所有图层都不显示,即使它们自己的 visible 是 true。
 */
function paintNodeInView(
  target: CanvasRenderingContext2D,
  node: LayerNode,
  view: ViewportContext,
): void {
  const { layer } = node;
  if (!layer.visible || layer.opacity <= 0) return;
  if (layer.type === 'group') {
    paintGroupInView(target, node, view);
    return;
  }
  if (layer.type === 'adjustment') {
    paintAdjustmentInView(target, layer, view);
    return;
  }

  /*
   * 快速路径:原生混合 + 无蒙版 + 无效果时直接按 bounds 画上去,
   * 不先摊平到一张缓冲。
   *
   * 原生混合只在源有覆盖的地方起作用,源之外等同于透明、不改动目标,
   * 所以「摊平后画到 (0,0)」和「直接画到 (x,y)」结果一致。
   * 绝大多数图层走这条路,一次 drawImage 就完事,没有任何分配。
   */
  const needsBuffer =
    (Boolean(layer.mask) && layer.maskEnabled !== false) ||
    Boolean(layer.effects) ||
    !isNativeBlend(normalizeBlend(layer.blendMode));

  if (!needsBuffer) {
    drawNativeAt(target, layer.canvas, layer.blendMode, layer.opacity, layer.bounds.x, layer.bounds.y);
    return;
  }

  // 缓冲只开到内容可见范围;完全在视口外时无事可做
  const box = nodeViewBox(node, view);
  if (!box) return;

  const pixels = placedInView(layer, view, box, bufferAllocFor(layer));
  if (layer.effects) {
    paintWithEffectsInView(target, pixels, layer, view);
    return;
  }
  /*
   * 不用再单独传 dirty 了:缓冲现在只开到图层的可见范围,
   * 它自己的尺寸就是脏区域,手写混合直接按整幅缓冲处理即可。
   */
  drawBufferInView(target, pixels, layer.blendMode, layer.opacity);
}

/**
 * 把图层像素摆到视口缓冲里(含蒙版)。
 *
 * 顺序是「先摆位、后套蒙版」:反过来先套蒙版会让它对不齐位置。
 * 两者都走同一个变换矩阵,矩阵负责缩放,坐标一律用文档坐标——蒙版的文档坐标
 * 由 maskOrigin 给出(普通层是 bounds,组是原点),不是一律 (0,0)。
 */
function placedInView(
  layer: Layer,
  view: ViewportContext,
  box: Viewport,
  alloc: ViewBufferAlloc,
): ViewBuffer {
  const buffer = alloc(view, box);
  const context = ctx2d(buffer.canvas);
  context.drawImage(layer.canvas, layer.bounds.x, layer.bounds.y);
  if (layer.mask && layer.maskEnabled !== false) {
    /*
     * 蒙版画在 bounds,不是画在文档原点。
     *
     * 一律画到 (0,0) 的话,PSD 里 bounds 不在原点的图层,蒙版落在文档左上角,
     * destination-in 交集为空——**整层被抹掉**,这就是带蒙版的 PSD 图层
     * 「显示丢失」的原因。位置由 maskGeometry 统一给出(见 mask.ts),
     * 生产端与消费端共用一条规则才不会再各自漂移。
     */
    const { x, y } = maskOrigin(layer);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(maskToAlpha(layer.mask), x, y);
    context.globalCompositeOperation = 'source-over';
  }
  return buffer;
}

/**
 * 画调整图层:对 target 当前内容就地应用调整。
 *
 * PS 的语义是作用于下方所有图层的合成结果。paintNodesInView 自底向上依次调用,
 * 执行到这里时 target 里正是下方图层已合成的结果,所以直接读整幅视口即可。
 *
 * 读的是视口像素而不是文档像素:790×16041 全幅读回是 1270 万像素,
 * 视口只有约 100 万,这一项本身就是 13 倍的差距。
 *
 * 再进一步:只读「视口 ∩ 文档」那块,不读整幅视口。画布外一律不显示
 * (见 clipToDocument),读回来调完再写回去也看不见。缩小看长图时文档只占
 * 视口中间一条,这一步又是一两个数量级。
 *
 * 遗留问题:这里读的是主画布,而主画布是 GPU 光栅的,getImageData 会强制
 * 一次 GPU→CPU 同步回读,Chrome 还可能因此把整张画布降级成软件光栅。
 * 真正的解法是「下方图层先合成进一张可读缓冲、再整体贴到主画布」,那要改
 * paintNodesInView 的目标切换逻辑,不在这一轮里做。收窄范围是同一方向上
 * 代价最小的一步:读回量小了,那次同步等待也短了。
 */
function paintAdjustmentInView(
  target: CanvasRenderingContext2D,
  layer: Layer,
  view: ViewportContext,
): void {
  if (!layer.adjustmentData) return;
  const { kind, params } = layer.adjustmentData;
  // 目前只实现了 brightness-contrast,与 compositor.ts 保持一致
  if (kind !== 'brightness-contrast') return;

  /*
   * 调整层的结果是「一张新图层」,不是就地改画面:PS 里调整图层跟普通图层一样
   * 受自己的蒙版、混合模式、不透明度约束。早先这里直接 putImageData 盖回去,
   * 三样全丢——multiply 的调整层在文档路径上乘完还是原色,在视口路径上却
   * 把画面整片提亮。所以这里必须走「读背景 → 调整 → 套蒙版 → 按混合模式叠回」,
   * 与 evaluator.ts 的 paintEffectNode 同构。
   */
  /*
   * 无蒙版 + 原生混合 + 不透明度 100 时,「叠回去」的结果就等于直接盖回去,
   * 这条快路省掉一张整幅视口缓冲。绝大多数调整层是这种,而这里正是刚优化过的
   * 渲染路径,不能为了少数带蒙版的情形给所有调整层都加一次整幅分配。
   */
  const plain =
    (!layer.mask || layer.maskEnabled === false) &&
    layer.opacity >= 100 &&
    normalizeBlend(layer.blendMode) === 'normal';

  // 文档整个在视口外时画面上什么都没有，读回来也是全透明
  const box = contentViewBox(view);
  if (!box) return;

  // getImageData 不认变换矩阵,坐标必须是视口像素,所以先复位
  const saved = target.getTransform();
  target.setTransform(1, 0, 0, 1, 0, 0);
  countReadback(box.width, box.height);
  const image = target.getImageData(box.x, box.y, box.width, box.height);
  applyAdjust(image, {
    brightness: (params.brightness as number) ?? 0,
    contrast: (params.contrast as number) ?? 0,
    saturation: (params.saturation as number) ?? 0,
    hue: (params.hue as number) ?? 0,
    exposure: (params.exposure as number) ?? 0,
    temperature: (params.temperature as number) ?? 0,
    vibrance: (params.vibrance as number) ?? 0,
  });
  if (plain) {
    target.putImageData(image, box.x, box.y);
    target.setTransform(saved);
    return;
  }
  target.setTransform(saved);

  const buffer = bufferAllocFor(layer)(view, box);
  const bufferCtx = ctx2d(buffer.canvas);
  /*
   * 缓冲与 box 1:1,所以按缓冲本地坐标直接写入(即 0,0),不要用带矩阵的坐标。
   * 蒙版反过来要走矩阵(它是文档坐标的),所以写完像素再把矩阵装回去——
   * 矩阵里已经减掉了 box 的偏移,蒙版会落在正确的位置。
   */
  const bufferSaved = bufferCtx.getTransform();
  bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufferCtx.putImageData(image, 0, 0);
  bufferCtx.setTransform(bufferSaved);
  if (layer.mask && layer.maskEnabled !== false) {
    const { x, y } = maskOrigin(layer);
    bufferCtx.globalCompositeOperation = 'destination-in';
    bufferCtx.drawImage(maskToAlpha(layer.mask), x, y);
    bufferCtx.globalCompositeOperation = 'source-over';
  }
  drawBufferInView(target, buffer, layer.blendMode, layer.opacity);
}

/**
 * 画带效果的图层。
 * 顺序:投影 → 外发光 → 图层 → 内发光 → 描边(PS 的渲染顺序)。
 *
 * 效果参数要按 view.scale 缩放,理由见 viewEffects.ts。
 */
function paintWithEffectsInView(
  target: CanvasRenderingContext2D,
  pixels: ViewBuffer,
  layer: Layer,
  view: ViewportContext,
): void {
  const { effects } = layer;
  if (!effects) return;
  const { scale } = view;

  /*
   * 每个启用的效果都要 extractSilhouette(pixels),内部对整幅缓冲 getImageData。
   * 这笔读回原先没进计数器,导致日志显示「读回 0」时看不出效果路径的开销
   * ——排查 016.psd 那 4127ms 时就被这个盲区误导过一次,所以在这里补上。
   */
  const enabled = [
    effects.dropShadow?.enabled,
    effects.outerGlow?.enabled,
    effects.innerGlow?.enabled,
    effects.stroke?.enabled,
  ].filter(Boolean).length;
  if (enabled > 0) countReadback(pixels.width, pixels.height * enabled);

  // 效果渲染出来的画布与源同尺寸,所以沿用源缓冲的位置
  const at = (canvas: HTMLCanvasElement): ViewBuffer => ({ ...pixels, canvas });

  if (effects.dropShadow?.enabled) {
    const effect = effects.dropShadow;
    const shadow = renderDropShadow(pixels.canvas, scaleDropShadow(effect, scale));
    drawBufferInView(target, at(shadow), effect.blendMode, effect.opacity);
  }
  if (effects.outerGlow?.enabled) {
    const effect = effects.outerGlow;
    const glow = renderOuterGlow(pixels.canvas, scaleOuterGlow(effect, scale));
    drawBufferInView(target, at(glow), effect.blendMode, effect.opacity);
  }

  drawBufferInView(target, pixels, layer.blendMode, layer.opacity);

  if (effects.innerGlow?.enabled) {
    const effect = effects.innerGlow;
    const inner = renderInnerGlow(pixels.canvas, scaleInnerGlow(effect, scale));
    drawBufferInView(target, at(inner), effect.blendMode, effect.opacity);
  }
  if (effects.stroke?.enabled) {
    const effect = effects.stroke;
    const stroke = renderStroke(pixels.canvas, scaleStroke(effect, scale));
    drawBufferInView(target, at(stroke), effect.blendMode, effect.opacity);
  }
}

/**
 * 画一个剪贴组:基底 + 剪贴到它上面的成员。
 *
 * PS 的语义:
 * - 成员只在基底的不透明区域内显示,最终 alpha 就是基底的 alpha;
 * - 成员各自的混合模式作用在「基底 + 已画的成员」上,不是组下方的画面;
 * - 基底的混合模式与不透明度作用在整个剪贴组上。
 *
 * 所以先在缓冲里按 100% 正常模式画基底,叠完成员,把 alpha 换回基底的,
 * 最后整体按基底的混合模式与不透明度合上去。
 */
function paintClipRunInView(
  target: CanvasRenderingContext2D,
  base: LayerNode,
  members: LayerNode[],
  view: ViewportContext,
): void {
  // 基底隐藏时整组都不显示:剪贴对象没了,成员无处可剪
  if (!base.layer.visible || base.layer.opacity <= 0) return;

  /*
   * 整组只开到基底的可见范围。成员超出基底的部分最终会被 clipToAlpha 抹掉
   * (整组 alpha 取自基底),所以不必为成员留位置——PS 的剪贴语义天然就是这样。
   */
  const box = nodeViewBox(base, view);
  if (!box) return;
  const inner = subViewport(view, box);

  /*
   * 取基底的「内容」而不是它画到画面上的结果:混合模式与不透明度
   * 要留到最后套在整组上,在这里套一遍、最后再套一遍就重了。
   */
  // 两张都要过 clipToAlpha(它 getImageData 读 content 与 base),所以都得可读回
  const basePixels =
    base.layer.type === 'group'
      ? groupContentInView(base, view, box, createReadableViewBufferAt)
      : placedInView(base.layer, view, box, createReadableViewBufferAt);

  const buffer = createReadableViewBufferAt(view, box);
  const bufferCtx = ctx2d(buffer.canvas);
  // 两张缓冲同 box,按视口像素 1:1 叠即可,不要走带矩阵的坐标
  bufferCtx.setTransform(1, 0, 0, 1, 0, 0);
  bufferCtx.drawImage(basePixels.canvas, 0, 0);
  applyViewTransform(bufferCtx, inner);
  for (const member of members) paintNodeInView(bufferCtx, member, inner);

  // clipToAlpha 要求两幅同尺寸,同 box 保证了这点。它内部读两幅整幅
  countReadback(box.width, box.height * 2);
  clipToAlpha(buffer.canvas, basePixels.canvas);
  drawBufferInView(target, buffer, base.layer.blendMode, base.layer.opacity);
}

/**
 * 画一个图层组。
 *
 * 穿透 + 不透明度 100 + 无蒙版 + 无效果时组不做隔离,子图层直接混到下方画面上,
 * 这是 PS 里新建组的默认表现,也是省掉一张缓冲的关键——长图里几十个默认组
 * 如果每个都隔离,就是几十张缓冲。一旦组自己有不透明度、混合模式、蒙版或效果,
 * PS 也会强制隔离。
 */
function paintGroupInView(
  target: CanvasRenderingContext2D,
  node: LayerNode,
  view: ViewportContext,
): void {
  const { layer } = node;
  const isolated =
    layer.blendMode !== 'pass-through' ||
    layer.opacity < 100 ||
    (Boolean(layer.mask) && layer.maskEnabled !== false) ||
    Boolean(layer.effects);

  if (!isolated) {
    paintNodesInView(target, node.children, view);
    return;
  }

  // 组的可见范围由子节点决定(组自己的 canvas 是 1×1 占位符)
  const box = nodeViewBox(node, view);
  if (!box) return;

  const content = groupContentInView(node, view, box, bufferAllocFor(layer));
  if (layer.effects) {
    paintWithEffectsInView(target, content, layer, view);
    return;
  }
  drawBufferInView(target, content, layer.blendMode, layer.opacity);
}

/**
 * 组内合成结果(含组蒙版),不含组自身的混合模式与不透明度。
 * 剪贴组要拿它当基底的 alpha 来源,所以必须能单独取到。
 */
function groupContentInView(
  node: LayerNode,
  view: ViewportContext,
  box: Viewport,
  alloc: ViewBufferAlloc,
): ViewBuffer {
  const buffer = alloc(view, box);
  const context = ctx2d(buffer.canvas);
  // 子节点要按这张缓冲的本地坐标算 box,不能用外层视口坐标,否则整体错位
  paintNodesInView(context, node.children, subViewport(view, box));
  const mask = node.layer.mask;
  if (mask && node.layer.maskEnabled !== false) {
    // 和 placedInView 同一条规则,位置由 maskOrigin 给出(组对齐到文档原点)
    const { x, y } = maskOrigin(node.layer);
    context.globalCompositeOperation = 'destination-in';
    context.drawImage(maskToAlpha(mask), x, y);
    context.globalCompositeOperation = 'source-over';
  }
  return buffer;
}

/** 原生混合:按文档坐标 (dx,dy) 直接画,由变换矩阵负责缩放定位 */
function drawNativeAt(
  target: CanvasRenderingContext2D,
  pixels: HTMLCanvasElement,
  mode: BlendMode,
  opacity: number,
  dx: number,
  dy: number,
): void {
  target.save();
  target.globalAlpha = opacity / 100;
  target.globalCompositeOperation = nativeOperation(normalizeBlend(mode));
  target.drawImage(pixels, dx, dy);
  target.restore();
}

/**
 * 把一张局部缓冲按混合模式合成到 target 上。
 *
 * 缓冲是视口像素、不是文档像素,所以要复位矩阵按 1:1 叠,不能再让矩阵缩放一次;
 * 但它只覆盖 (buffer.x, buffer.y) 起的一小块,所以要画在那个偏移上而不是原点。
 *
 * 手写混合只处理缓冲覆盖的那一块:blendImageData 对 source alpha 为 0 的像素
 * 直接 continue,缓冲之外的读-混-写本来就是纯浪费。target 按视口坐标取,
 * 缓冲按自己的本地坐标取(左上角就是 0,0),两者差的正是这个偏移。
 */
function drawBufferInView(
  target: CanvasRenderingContext2D,
  buffer: ViewBuffer,
  mode: BlendMode,
  opacity: number,
): void {
  const blendMode = normalizeBlend(mode);
  const saved = target.getTransform();
  target.setTransform(1, 0, 0, 1, 0, 0);

  if (isNativeBlend(blendMode)) {
    target.save();
    target.globalAlpha = opacity / 100;
    target.globalCompositeOperation = nativeOperation(blendMode);
    target.drawImage(buffer.canvas, buffer.x, buffer.y);
    target.restore();
    target.setTransform(saved);
    return;
  }

  // 手写路径:读回当前合成结果,逐像素混合后写回
  countReadback(buffer.width, buffer.height * 2);
  const backdrop = target.getImageData(buffer.x, buffer.y, buffer.width, buffer.height);
  const source = ctx2d(buffer.canvas).getImageData(0, 0, buffer.width, buffer.height);
  blendImageData(backdrop, source, blendMode, opacity / 100);
  target.putImageData(backdrop, buffer.x, buffer.y);
  target.setTransform(saved);
}

/** 把图层栈合成到视口画布上。target 的矩阵由 prepareViewportCanvas 装好 */
export function compositeInView(
  target: CanvasRenderingContext2D,
  layers: Layer[],
  view: ViewportContext,
): void {
  target.save();
  paintNodesInView(target, buildTree(layers), view);
  target.restore();
}
