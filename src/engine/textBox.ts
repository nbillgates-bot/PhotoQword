/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer, Rect, TextData } from '../types';
import { boundsFor, coversDoc, pointInRect } from './layerBounds';
import { alignShift, fontString, getTextBounds, measureText } from './textRender';
import { ctx2d } from './canvasUtils';

/**
 * 文字图层的「外框」与画布坐标约定。
 *
 * renderText 对两种文本的落笔基准不一样，这里是唯一把两者对齐的地方：
 *
 * - 段落文本：canvas 尺寸 = 边界框尺寸，落笔在 canvas 本地 (0,0)，
 *   所以 bounds 原点必须是 (data.x, data.y)。
 * - 点文本：canvas 保持文档尺寸不动，落笔在 canvas 本地 (data.x, data.y)，
 *   所以 bounds 原点必须是 (0,0) —— 本地坐标此时就等于文档坐标。
 *
 * 曾经两者都用 boundsFor(canvas, data.x, data.y)，点文本的位移因此被叠加了两次，
 * 单击 (20,30) 打的字实际落在文档 (40,60)。命中检测（getTextBounds）和编辑期的
 * textarea 一直按文档坐标 (data.x, data.y) 定位，所以这条约定才是对的那一条。
 */
export function isParagraphText(data: TextData): boolean {
  // width / height 成对出现才算段落；半成品状态按点文本处理
  return data.width !== undefined && data.height !== undefined;
}

/** 文字图层渲染完之后该有的 bounds。两种文本的原点约定见本文件头注释 */
export function textLayerBounds(canvas: HTMLCanvasElement, data: TextData): Rect {
  return isParagraphText(data) ? boundsFor(canvas, data.x, data.y) : boundsFor(canvas);
}

/**
 * 文字外框在 **canvas 本地坐标** 里的位置，供自由变换取框用。
 *
 * 返回本地坐标而不是文档坐标，是因为调用方拿到框之后要去裁 canvas，
 * 换算成文档坐标是它自己的事（加 bounds.x/y）。
 */
export function textBoxLocal(data: TextData, bounds: Rect): Rect {
  if (isParagraphText(data)) {
    return { x: data.x - bounds.x, y: data.y - bounds.y, width: data.width!, height: data.height! };
  }
  const { width, height } = measurePointText(data);
  // textAlign 决定 data.x 是左边、中线还是右边，框的左边要跟着退
  const shift = alignShift(data.align, width);
  return { x: data.x - bounds.x - shift, y: data.y - bounds.y, width, height };
}

/**
 * 文字图层的命中候选矩形，文档坐标。点它能不能进编辑，就看这些矩形。
 *
 * 基准是 getTextBounds，按 textData 重排出来的框。但 PSD 进来的文字层
 * 还要再算上图层自己的 bounds，原因是那种图层的像素是 PS 排好版直接搬过来的，
 * 我们这边重排的结果不保证和它严格重合：字体不一定是同一个（缺字体时会替代），
 * pointBase 的锚点约定也未必和我们对 data.y 的理解一致。
 * 差出去的后果就是「字明明在这儿，框却在旁边」，点在字上进不了编辑。
 * PSD 图层的 bounds 恰好是那块像素的外接矩形，一定包住看得见的字。
 *
 * **返回两块而不是它们的并集**：并集会把两块之间的空白也算成命中。
 * 重排框和像素块隔得远时（PSD 文字层的常态），那片空白可能有几百像素宽，
 * 这一层于是隔着老远吃掉邻居文字层的点击——点的是一个文字，进编辑的是另一个。
 *
 * 铺满整个文档的 bounds 必须排除：我们自己建的点文本，画布就是文档大小，
 * 算进去等于整张画布都算命中，点哪儿都会掉进这个文字层。
 *
 * 不用 contentRect 去逐像素求真正的内容范围：那要 getImageData 扫全幅，
 * 每次 pointerdown 对每个文字层各扫一遍，大图上点一下就是上亿次读取（规约 §6）。
 */
export function textHitRects(layer: Layer, docWidth: number, docHeight: number): Rect[] {
  const data = layer.textData;
  if (!data) return [layer.bounds];

  const box = getTextBounds(data, layer.canvas);
  if (coversDoc(layer.bounds, docWidth, docHeight)) return [box];
  return [box, layer.bounds];
}

/** 点在文字图层的命中范围内吗。候选矩形分别判，理由见 textHitRects */
export function textHitTest(
  layer: Layer,
  x: number,
  y: number,
  doc: { width: number; height: number },
): boolean {
  return textHitRects(layer, doc.width, doc.height).some((rect) => pointInRect(rect, x, y));
}

/**
 * 点文本 textarea 在文字宽度之外多留的空间（文档像素）。
 *
 * textarea 是 overflow:hidden 的，宽度掐得跟文字一样齐时，行尾的光标正好压在
 * 右边缘上会被裁掉。留一点余量给它站。
 * 这点余量会一并算进对齐位移，所以不影响文字落点。
 */
export const CARET_ROOM = 4;

/**
 * 点文本编辑框（textarea）该有多大。
 *
 * 必须自己算，不能交给 textarea 的默认尺寸：width:auto 的宽度来自 cols（默认 20 字符），
 * height:auto 来自 rows（默认 2 行）。宽度不对会毁掉对齐——textAlign 是相对这个盒子
 * 生效的；高度不对会裁掉内容——overflow 是 hidden。
 *
 * 放在引擎里而不是编辑器组件里，是为了让诊断日志能算出和编辑器一模一样的盒子。
 */
export function pointEditorBox(data: TextData): { width: number; height: number } {
  const { width, height } = measureText(data);
  return { width: width + CARET_ROOM, height };
}

/** 量点文本的行盒外接尺寸。不套 getTextBounds 的 50px 保底，那是给命中检测用的 */
function measurePointText(data: TextData): { width: number; height: number } {
  const context = ctx2d(document.createElement('canvas'));
  context.font = fontString(data);
  context.letterSpacing = `${data.letterSpacing}px`;
  const lines = data.content.split('\n');
  const width = lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
  return { width, height: lines.length * data.fontSize * data.lineHeight };
}
