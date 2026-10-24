/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { decodeLayerPixels, type Layer as PsdLayer } from 'ag-psd';
import type { Layer, LayerType, TextData } from '../types';
import { createReadbackCanvas, ctx2d, uid } from './canvasUtils';
import { checkCanvasSize } from './canvasLimits';
import { maskGeometry, type MaskGeometry } from './mask';
import { fromPsdBlend } from './psdBlendMap';
import { throwIfCancelled } from './fileRead';
import { psdTextDataToTextData } from './psdTextConvert';
import { AppError } from './appError';

/**
 * 尺寸超限时报错，带上图层名与具体原因。
 *
 * 图层名来自 PSD 文件（用户数据，不翻译），但 PSD 允许图层没有名字，
 * 空名字直接填进「图层「」尺寸超限」很难看，所以空的时候改用
 * doc.untitled 词条 —— 那个要翻译，走 paramKeys。
 */
function sizeError(kind: 'layer' | 'mask', name: string, check: ReturnType<typeof checkCanvasSize>) {
  const key = kind === 'layer' ? 'error.psd.layerTooLarge' : 'error.psd.maskTooLarge';
  const paramKeys: Record<string, string> = {};
  if (check.reasonKey) paramKeys.reason = check.reasonKey;
  if (!name) paramKeys.name = 'doc.untitled';
  return new AppError(
    key,
    { ...check.reasonParams, ...(name ? { name } : {}) },
    Object.keys(paramKeys).length > 0 ? paramKeys : undefined,
  );
}

/**
 * PSD 图层树 → 我们的扁平 Layer 数组。
 *
 * 从 psdRead 拆出来是因为那边已经装不下了：
 * 那边管的是「一个文件怎么读」（选项、进度、复合图回退），
 * 这边管的是「一个图层怎么转」（边界、像素、蒙版、刻度换算）。
 */

/** 文档尺寸。组的蒙版要按文档尺寸建，所以转换时必须知道它 */
export interface DocSize {
  width: number;
  height: number;
}

/**
 * 把 PSD 的图层蒙版转成我们的蒙版画布。
 *
 * 三件事以前都做错了，每一件都能让图层整个消失或者显反：
 *
 * 1. **对齐基准**。合成时蒙版画在 layer.bounds（见 viewCompositor.placedInView）,
 *    所以这里必须建成「以 bounds 左上角为原点」的画布。以前建成图层尺寸却把
 *    PSD 蒙版画到 (0,0)，等于假设蒙版矩形和图层矩形完全重合。
 * 2. **蒙版有自己的矩形**。PSD 里蒙版的 left/top 和图层的 left/top 是两套值，
 *    蒙版可以只覆盖图层的一小块。positionRelativeToLayer 决定这套值是
 *    相对图层还是文档坐标。
 * 3. **矩形外要按 defaultColor 填**。画布没画到的地方是透明，而 maskToAlpha
 *    把透明当「隐藏」，所以 defaultColor=255（矩形外全部显示）的蒙版会被反过来，
 *    图层只剩蒙版矩形那一块。
 *
 * 尺寸与对齐点由 maskGeometry 统一给出（组按文档尺寸，顺带修掉「组的画布是 1×1，
 * 蒙版被截成 1×1，那一格是黑的就整组消失」）。
 */
function psdMaskToCanvas(
  psdLayer: PsdLayer,
  bounds: { x: number; y: number; width: number; height: number },
  geom: MaskGeometry,
): HTMLCanvasElement | undefined {
  const mask = psdLayer.mask;
  if (!mask?.canvas) return undefined;

  const { width, height, x: originX, y: originY } = geom;

  const check = checkCanvasSize(width, height);
  if (!check.ok) throw sizeError('mask', psdLayer.name || '', check);

  const canvas = createReadbackCanvas(width, height);
  const context = ctx2d(canvas);
  // 先铺 defaultColor，再把蒙版矩形盖上去。缺省按 0（隐藏），与 PSD 的常见取值一致
  const fill = mask.defaultColor ?? 0;
  context.fillStyle = `rgb(${fill},${fill},${fill})`;
  context.fillRect(0, 0, width, height);

  // positionRelativeToLayer 为真时 left/top 是相对图层的，要加回图层原点才是文档坐标
  const relative = mask.positionRelativeToLayer === true;
  const docX = (mask.left ?? 0) + (relative ? bounds.x : 0);
  const docY = (mask.top ?? 0) + (relative ? bounds.y : 0);
  context.drawImage(mask.canvas, docX - originX, docY - originY);
  return canvas;
}

/**
 * 从 PSD 图层构造我们的 Layer。
 * PSD 图层边界是 left/top/right/bottom，我们转成 bounds: {x, y, width, height}。
 *
 * 像素要在这之前解好：useRawData 模式下 psdLayer.canvas 一开始是空的。
 */
function psdLayerToLayer(
  psdLayer: PsdLayer,
  doc: DocSize,
  parentId: string | null = null,
  fallbackLayerName = '图层', // i18n-exempt: 兜底值，正常路径由 store 按语言传入
): Layer {
  const left = psdLayer.left ?? 0;
  const top = psdLayer.top ?? 0;
  const right = psdLayer.right ?? left;
  const bottom = psdLayer.bottom ?? top;
  // 组的边界在 PSD 里恒为 0，画布用 1×1 占位（与我们其他地方对组的处理一致）
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);

  /*
   * 逐层校验，不能只看文档尺寸：PSD 的图层可以比文档大得多
   * （画到画布外的部分 PS 会一并存下来），文档 4000×4000 里
   * 完全可能有一张 50000×50000 的图层。
   * 超限时浏览器给的是空白画布，不抛错也不告警，必须在建之前拦。
   */
  const check = checkCanvasSize(width, height);
  if (!check.ok) throw sizeError('layer', psdLayer.name || '', check);

  /*
   * 用 createReadbackCanvas 而不是 createCanvas：下面马上就 drawImage 填像素，
   * 上下文在那时就建好了，等历史差分来 getImageData 已经没法再声明
   * willReadFrequently（options 只有第一次 getContext 生效）。
   */
  const canvas = createReadbackCanvas(width, height);
  const isGroup = !!(psdLayer.children && psdLayer.children.length > 0);

  // 组的画布是 1×1 占位，实际图层才填像素
  if (!isGroup && psdLayer.canvas) {
    ctx2d(canvas).drawImage(psdLayer.canvas, 0, 0);
  }

  const bounds = { x: left, y: top, width, height };
  const maskCanvas = psdMaskToCanvas(
    psdLayer,
    bounds,
    maskGeometry({ type: isGroup ? 'group' : 'raster', bounds, canvas }, doc),
  );

  /*
   * PSD 带文字数据的图层要标成 'text' 并带上 textData，
   * 否则文字工具认不出它：命中检测要求 type === 'text' && textData 都在。
   * 少了这一步，PSD 里的文字层点进去不是重新编辑，而是在上面新建一个空文字层。
   *
   * 像素照旧用 PSD 里渲染好的那份，不重新排版——我们的排版引擎和 PS 不可能
   * 逐像素一致，重排会让文件一打开就和 PS 里看到的不一样。
   * 只有用户真的改了文字，renderText 才会接手重画。
   */
  const psdText = isGroup ? undefined : psdLayer.text;
  const textData: TextData | undefined = psdText
    ? psdTextDataToTextData(psdText, left, top)
    : undefined;

  const type: LayerType = isGroup ? 'group' : textData ? 'text' : 'raster';
  /*
   * 三套刻度，别搞混：
   * PSD 文件里存 0-255，ag-psd 已经帮我们换成 0-1，而我们的 Layer.opacity 是 0-100
   * （compositor 里是 globalAlpha = opacity / 100）。所以这里要乘 100。
   * 漏了这一步的后果是每个图层都按 1% 不透明度画出来，画面上等于什么都没有。
   */
  const opacity = (psdLayer.opacity ?? 1) * 100;
  const blendMode = fromPsdBlend(psdLayer.blendMode);

  return {
    id: uid('layer'),
    name: psdLayer.name || fallbackLayerName,
    type,
    visible: !psdLayer.hidden,
    bounds,
    locked: false,
    opacity,
    blendMode,
    canvas,
    mask: maskCanvas,
    maskEnabled: maskCanvas !== undefined,
    textData,
    parentId,
    collapsed: false,
  };
}

/**
 * 是不是没有内容的占位层。
 *
 * 拼合保存的 PSD（以及 ag-psd 写空文档时）会在图层区留一个
 * 零宽零高、无名、无像素的条目。照搬进来会变成一个 1×1 的废图层，
 * 图层面板上多一行点不动的东西，所以直接跳过。
 * 组不算占位——组的边界在 PSD 里本来就是 0。
 */
function isPlaceholder(psdLayer: PsdLayer): boolean {
  if (psdLayer.children && psdLayer.children.length > 0) return false;
  const width = (psdLayer.right ?? 0) - (psdLayer.left ?? 0);
  const height = (psdLayer.bottom ?? 0) - (psdLayer.top ?? 0);
  return width <= 0 || height <= 0;
}

/** 数一遍要转换的图层总数，进度条的分母。跳过的占位层不算 */
export function countPsdLayers(psdLayers: PsdLayer[] | undefined): number {
  if (!psdLayers) return 0;
  let total = 0;
  for (const psdLayer of psdLayers) {
    if (isPlaceholder(psdLayer)) continue;
    total += 1 + countPsdLayers(psdLayer.children);
  }
  return total;
}

/** 递归转换时共享的一份状态，避免在递归签名里挂五个参数 */
export interface ConvertContext {
  /** 已完成的图层数，进度条的分子 */
  done: number;
  /** 图层总数 */
  total: number;
  onLayer?: (done: number, total: number) => void;
  /** 返回 null 表示这次不用让行，攒够时间了才返回一个 Promise */
  yieldNow: () => Promise<void> | null;
  signal?: AbortSignal;
  /** 文档尺寸，组的蒙版按它建 */
  doc: DocSize;
  /**
   * PSD 里没写名字的图层用这个名。
   * 图层名是用户数据，要按当前语言取值，而 engine 不认识语言，
   * 所以由调用方（store）算好传进来（I18N.md §2.3 / §3）。
   */
  fallbackLayerName?: string;
}

/**
 * 递归遍历 PSD 图层树，转成扁平数组（我们的 layers）+ parentId 标记。
 * PSD 的图层顺序：children[0] 在栈底，children[n-1] 在栈顶。
 * 我们的顺序：layers[0] 在栈底，layers[n-1] 在栈顶（与 PSD 一致）。
 *
 * 异步是为了能在层与层之间让出主线程。像素解码本身仍是同步的，
 * 单层解码没法再切细——那是 ag-psd 内部一次 RLE/zip 解压。
 */
export async function flattenPsdLayers(
  psdLayers: PsdLayer[] | undefined,
  ctx: ConvertContext,
  parentId: string | null = null,
): Promise<Layer[]> {
  if (!psdLayers || psdLayers.length === 0) return [];
  const result: Layer[] = [];
  // 顺序遍历：PSD children[0] 在栈底，我们的 layers[0] 也在栈底，顺序保持一致
  for (let i = 0; i < psdLayers.length; i += 1) {
    const psdLayer = psdLayers[i];
    if (isPlaceholder(psdLayer)) continue;
    throwIfCancelled(ctx.signal);

    /*
     * 到这一层才解它的像素。decodeLayerPixels 会把 rawData 解成 canvas
     * 并顺手清掉 rawData，等于解一层就放掉一层的压缩数据。
     * 组没有 rawData，调它是空操作，不用特判。
     */
    decodeLayerPixels(psdLayer);

    const layer = psdLayerToLayer(psdLayer, ctx.doc, parentId, ctx.fallbackLayerName);
    result.push(layer);

    ctx.done += 1;
    ctx.onLayer?.(ctx.done, ctx.total);
    const pause = ctx.yieldNow();
    if (pause) await pause;

    // 递归处理子图层
    if (psdLayer.children) {
      result.push(...(await flattenPsdLayers(psdLayer.children, ctx, layer.id)));
    }
  }
  return result;
}
