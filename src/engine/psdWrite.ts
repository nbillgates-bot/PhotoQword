/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { writePsdUint8Array, type Psd, type Layer as PsdLayer } from 'ag-psd';
import type { Doc, Layer } from '../types';
import { toPsdBlend } from './psdBlendMap';
import { maskOrigin } from './mask';
import { needsPsb } from './psdNaming';

/**
 * PSD / PSB 写入，全程在本地完成，不上传任何数据。
 * 大文件的处理见 writePsdFile 的注释。
 */

/**
 * 把我们的 Layer 转成 ag-psd 的 PsdLayer。
 */
function layerToPsdLayer(layer: Layer): PsdLayer {
  const { bounds, canvas, mask, blendMode, opacity } = layer;
  const isGroup = layer.type === 'group';
  return {
    name: layer.name,
    hidden: !layer.visible,
    // 我们是 0-100，ag-psd 是 0-1，写出去要除回来
    opacity: opacity / 100,
    blendMode: toPsdBlend(blendMode),
    /*
     * 组的边界由 ag-psd 按子图层自己算（写出来是 0,0,0,0），
     * 我们的组画布是 1×1 占位，把它当真边界写出去会让 PS 里的组框错位。
     */
    left: isGroup ? undefined : bounds.x,
    top: isGroup ? undefined : bounds.y,
    right: isGroup ? undefined : bounds.x + bounds.width,
    bottom: isGroup ? undefined : bounds.y + bounds.height,
    canvas: isGroup ? undefined : canvas,
    mask: mask ? psdMask(layer, mask) : undefined,
  };
}

/**
 * 蒙版必须连位置一起写出去。
 *
 * 只写 canvas 的话 ag-psd 把蒙版矩形当成从 (0,0) 起，而我们的蒙版是对齐
 * 图层 bounds 的（见 mask.ts 的 maskGeometry），再导入回来就整体偏移了
 * 一个 bounds —— PSD 存一遍读一遍蒙版就跑位。
 *
 * defaultColor 写 0：矩形之外按隐藏算，与 psdLayers 导入侧的缺省一致。
 * 我们的矩形恰好覆盖图层（组则覆盖整幅文档），所以矩形外本来就没有内容。
 */
function psdMask(layer: Layer, mask: HTMLCanvasElement) {
  const { x, y } = maskOrigin(layer);
  return {
    canvas: mask,
    left: x,
    top: y,
    right: x + mask.width,
    bottom: y + mask.height,
    defaultColor: 0 as const,
  };
}

/**
 * 重建图层树：从扁平数组 + parentId 重建成 ag-psd 要的嵌套 children。
 * 我们的 layers[0] 在栈底，PSD children[0] 也在栈底，顺序一致，直接映射。
 */
function buildPsdTree(layers: Layer[], parentId: string | null = null): PsdLayer[] {
  /*
   * 递归时必须按 parentId 匹配，不能再按「没有 parentId」筛：
   * 子图层的 parentId 恒等于组 id，那样筛会把它们全滤掉，组永远是空的。
   */
  const siblings = layers.filter((item) => (item.parentId ?? null) === parentId);
  return siblings.map((item) => {
    const psdLayer = layerToPsdLayer(item);
    if (item.type === 'group') {
      psdLayer.children = buildPsdTree(layers, item.id);
      psdLayer.opened = !item.collapsed;
    }
    return psdLayer;
  });
}

/**
 * 合成一遍整幅画面就已经很吃力的文档。
 * 100M 像素的 RGBA 是 400MB，再加上写文件本身的缓冲，
 * 到这个量级就别再为了缩略图多合成一遍了。
 */
function isHugeDoc(doc: { width: number; height: number }): boolean {
  return doc.width * doc.height > 100e6;
}

/**
 * 写入 PSD / PSB，返回字节流，调用方自行下载。
 *
 * 大文件的两处考虑：
 * 1. 超过 PSD 单边上限时自动转 PSB，否则写出来的文件 PS 打不开。
 * 2. 用 writePsdUint8Array 而不是 writePsd。后者内部要 slice 一次整份缓冲，
 *    等于把整个文件在内存里复制一遍，1GB 的文档这一下就多占 1GB。
 *    （不用 writePsdBuffer——那个返回 Node 的 Buffer，浏览器里没有。）
 */
export function writePsdFile(doc: Doc, layers: Layer[]): Uint8Array<ArrayBuffer> {
  const psd: Psd = {
    width: doc.width,
    height: doc.height,
    children: buildPsdTree(layers),
    imageResources: {
      resolutionInfo: {
        horizontalResolution: doc.resolution,
        horizontalResolutionUnit: 'PPI',
        widthUnit: 'Inches',
        verticalResolution: doc.resolution,
        verticalResolutionUnit: 'PPI',
        heightUnit: 'Inches',
      },
    },
  };
  const bytes = writePsdUint8Array(psd, {
    psb: needsPsb(doc),
    /*
     * trimImageData：把图层像素里四周全透明的部分裁掉再存。
     * 我们的图层已经按 bounds 收紧了，但画笔画完常常留一圈空白，
     * 裁掉能实打实减小文件体积，这对大文件是刚需。
     */
    trimImageData: true,
    /*
     * 内嵌缩略图：PS 默认是带的，文件管理器靠它出预览，所以默认也带上。
     * 但生成它要先合成一遍整幅画面，超大文档上这一步既慢又吃内存，
     * 到了那个量级宁可牺牲预览图也要保证存得下去。
     */
    generateThumbnail: !isHugeDoc(doc),
  });

  /*
   * ag-psd 把返回类型声明成宽泛的 Uint8Array（backing buffer 可能是
   * SharedArrayBuffer），而 Blob 只收 ArrayBuffer 支撑的视图。
   * 这里做一次真实的运行时收窄而不是断言：ag-psd 实际总是 ArrayBuffer，
   * 万一哪天不是，报错也比默默塞给 Blob 好。
   */
  if (!(bytes.buffer instanceof ArrayBuffer)) {
    throw new Error('PSD 写入返回了非 ArrayBuffer 缓冲，无法下载'); // i18n-exempt: 契约性错误，第三方库违约才会触发
  }
  return bytes as Uint8Array<ArrayBuffer>;
}
