/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { readPsd, getCompositeCanvas, type Psd } from 'ag-psd';
import type { Doc, Layer } from '../types';
import { createReadbackCanvas, ctx2d, uid } from './canvasUtils';
import { checkCanvasSize } from './canvasLimits';
import { stripPsdExt } from './psdNaming';
import { createYielder, readFileWithProgress, throwIfCancelled } from './fileRead';
import { countPsdLayers, flattenPsdLayers } from './psdLayers';
import { AppError } from './appError';

/**
 * PSD / PSB 读取，全程在本地完成，不上传任何数据。
 *
 * 大文件的三个提速点：
 * 1. useRawData —— 解析阶段只读结构，不解码任何位图。
 *    原来 readPsd 一个同步调用就把所有图层的像素都解了出来，
 *    几百 MB 的 PSD 上主线程一口气占住十几秒，进度条无从下手。
 * 2. skipCompositeImageData —— 有图层时整幅复合图是纯浪费。
 *    6000×4000 的复合图解出来是 96 MB，而它的内容我们自己合成就有。
 *    ag-psd 只在「没有图层」时才真的读它（拼合 PSD 唯一的像素来源）。
 * 3. 逐层解码 + 时间分片让行 —— 有真进度可报，界面也不僵。
 */

/** 一英寸 = 2.54 厘米，PPCM → PPI 的换算系数 */
const CM_PER_INCH = 2.54;

/** 读文档分辨率，统一换算成 PPI。缺失时按 PS 的默认值 72 */
function readResolution(psd: Psd): number {
  const info = psd.imageResources?.resolutionInfo;
  if (!info) return 72;
  const value = info.horizontalResolution;
  if (!Number.isFinite(value) || value <= 0) return 72;
  return info.horizontalResolutionUnit === 'PPCM' ? value * CM_PER_INCH : value;
}

/** 打开 PSD 的三个阶段。分开报是为了让提示文字能说清在等什么 */
export type PsdPhase = 'reading' | 'parsing' | 'decoding';

export interface PsdProgress {
  phase: PsdPhase;
  /** 0-1 的总体进度 */
  ratio: number;
  /**
   * 说明文字的**词条 key**，不是成品句子。
   *
   * engine 不认识语言（规约 §2.1）。早先这里直接拼「正在解码图层 3/12…」，
   * 结果切成英文时进度窗整个还是中文。现在只报 key 与数字，
   * 由 UI 层组装（I18N.md §2.3）。
   */
  labelKey: string;
  /** labelKey 里 {done} / {total} 这类占位符的取值 */
  labelParams?: Record<string, string | number>;
}

/*
 * 三个阶段各占进度条多长。
 * 读文件是纯 IO，解析只走一遍文件结构（不解码像素）都很快，
 * 时间基本都花在逐层解码上，所以它拿走大头。
 * 这几个数只影响进度条走得匀不匀，不影响结果对不对。
 */
const READ_SHARE = 0.2;
const PARSE_SHARE = 0.1;
const DECODE_SHARE = 1 - READ_SHARE - PARSE_SHARE;

export type PsdProgressFn = (progress: PsdProgress) => void;

/**
 * 取复合图像。只在「一个可用图层都没有」时才会走到这儿。
 *
 * 为什么可能要重读一遍：ag-psd 的 skipCompositeImageData 判断的是
 * 「有没有 children」（psdReader.js 里的 skipComposite），
 * 而拼合保存的 PSD 里 children 常常有一个零尺寸的占位条目——
 * 对 ag-psd 算「有图层」，对我们算「没有」，复合图就被跳过了，
 * 结果整张图变空白。这时只能不跳过复合图再读一次。
 *
 * 重读不心疼：会走到这条路的文件本来就没有图层数据，
 * 而第一遍带 useRawData，并没有解码任何像素。
 */
function readComposite(
  psd: Psd,
  buffer: ArrayBuffer | Uint8Array,
): HTMLCanvasElement | undefined {
  // 已经在手上就直接用
  if (psd.canvas) return psd.canvas;
  const direct = getCompositeCanvas(psd);
  if (direct) return direct;

  const full: Psd = readPsd(buffer, {
    useImageData: false,
    skipLayerImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
  });
  return full.canvas;
}

export interface ReadPsdOptions {
  onProgress?: PsdProgressFn;
  signal?: AbortSignal;
  /**
   * 拼合 PSD（文件里一个图层都没有）时给那唯一一张图层用的名字。
   *
   * 由调用方按当前界面语言传进来。engine 层不认识语言，
   * 也不该 import i18n —— 传参比在这里查词条表更符合分层（规约 §2.1）。
   */
  backgroundName?: string;
  /** PSD 里没写名字的图层用这个名，同样由调用方按语言传入 */
  fallbackLayerName?: string;
}

/**
 * 解析 PSD 字节流，返回 { doc, layers }，可直接设进 store。
 *
 * 与 readPsdFile 分开是为了让这一段不碰 File API，能直接喂 ArrayBuffer 测。
 * 异步只是为了逐层解码时能让出主线程，不涉及任何网络或 IO。
 */
export async function readPsdBuffer(
  // Uint8Array 也收：writePsdFile 的输出直接能喂回来，往返不用中转
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  options: ReadPsdOptions = {},
): Promise<{ doc: Doc; layers: Layer[] }> {
  // 没传名字就退回中文，与词条表的兜底语言一致
  const { onProgress, signal, backgroundName = '背景' } = options; // i18n-exempt: 兜底值，与词条表的兜底语言一致；正常路径由调用方传入
  const base = READ_SHARE;
  onProgress?.({ phase: 'parsing', ratio: base, labelKey: 'progress.psd.parsing' });
  throwIfCancelled(signal);

  /*
   * 每一项都是省下的整幅位图：
   *
   * useRawData：解析阶段一个像素都不解，只记下每层压缩数据的位置。
   *   后面 decodeLayerPixels 一层一层解，进度条才有真数据可报。
   * skipCompositeImageData：有图层时复合图纯浪费——那张图我们自己合成就有。
   *   ag-psd 只在没有图层时才真的读它（psdReader 里的 skipComposite 判断），
   *   拼合 PSD 的像素来源因此不会被误伤。
   * skipThumbnail：PSD 内嵌的预览图我们不用，图层面板的缩略图是自己算的。
   * skipLinkedFilesData：智能对象的外链原始文件（常常是几十 MB 的原图），
   *   我们没有智能对象，读进来纯占内存。
   * totalMemoryLimit：留默认的 2GB。超了它会抛错，比悄悄解出一半画面要好。
   */
  const psd: Psd = readPsd(buffer, {
    useImageData: false,
    useRawData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
    skipLinkedFilesData: true,
  });

  const width = psd.width ?? 1;
  const height = psd.height ?? 1;

  // 校验文档尺寸，超限则拒绝
  const check = checkCanvasSize(width, height);
  if (!check.ok) {
    /*
     * 用户能靠换个文件避免，所以抛带 key 的错误让 UI 翻译（I18N.md §4.1）。
     * 尺寸原因本身也是 key，走 paramKeys 两段式，不在这里拼句子。
     */
    throw new AppError(
      'error.psd.sizeExceeded',
      check.reasonParams,
      check.reasonKey ? { reason: check.reasonKey } : undefined,
    );
  }

  const total = countPsdLayers(psd.children);
  onProgress?.({
    phase: 'decoding',
    ratio: base + PARSE_SHARE,
    labelKey: total > 0 ? 'progress.psd.decodingLayers' : 'progress.psd.decodingImage',
    labelParams: total > 0 ? { done: 0, total } : undefined,
  });

  const layers = await flattenPsdLayers(psd.children, {
    done: 0,
    total,
    yieldNow: createYielder(),
    signal,
    doc: { width, height },
    fallbackLayerName: options.fallbackLayerName,
    onLayer: (done, count) => {
      onProgress?.({
        phase: 'decoding',
        ratio: base + PARSE_SHARE + (done / count) * DECODE_SHARE,
        labelKey: 'progress.psd.decodingLayers',
        labelParams: { done, total: count },
      });
    },
  });

  /*
   * 一个图层都没有：拼合保存的 PSD 就是这样。
   * 这时复合图像是唯一的像素来源，必须画上去——只给一张空白画布等于把用户的图丢了。
   */
  if (layers.length === 0) {
    // 拼合 PSD 的唯一一张图层画布，历史差分会反复读它
    const canvas = createReadbackCanvas(width, height);
    const composite = readComposite(psd, buffer);
    if (composite) ctx2d(canvas).drawImage(composite, 0, 0);
    layers.push({
      id: uid('layer'),
      name: backgroundName,
      type: 'raster',
      visible: true,
      bounds: { x: 0, y: 0, width, height },
      locked: false,
      // 0-100 刻度，不是 0-1
      opacity: 100,
      blendMode: 'normal',
      canvas,
    });
  }

  const doc: Doc = {
    id: uid('doc'),
    name: stripPsdExt(fileName),
    width,
    height,
    // 分辨率在 imageResources.resolutionInfo 里，不在 Psd 顶层。
    // PPCM 的文件要换算成 PPI，我们内部统一按 PPI 存
    resolution: readResolution(psd),
  };

  onProgress?.({ phase: 'decoding', ratio: 1, labelKey: 'progress.openDone' });
  return { doc, layers };
}

/**
 * 读取 PSD / PSB 文件。
 * 大文件的内存峰值在这里：整个文件要先进内存，
 * 浏览器的 ArrayBuffer 上限约 2GB（Chrome 较新版本到 4GB），
 * 超过会在这一步抛 RangeError，交由调用方提示。
 */
export async function readPsdFile(
  file: File,
  options: ReadPsdOptions = {},
): Promise<{ doc: Doc; layers: Layer[] }> {
  const { onProgress, signal } = options;
  onProgress?.({ phase: 'reading', ratio: 0, labelKey: 'progress.readingFile' });

  const buffer = await readFileWithProgress(
    file,
    (ratio) => {
      onProgress?.({
        phase: 'reading',
        ratio: ratio * READ_SHARE,
        labelKey: 'progress.readingFile',
      });
    },
    signal,
  );

  return readPsdBuffer(buffer, file.name, options);
}
