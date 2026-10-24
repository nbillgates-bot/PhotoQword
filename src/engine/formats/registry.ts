/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Doc, Layer } from '../../types';
import { ctx2d } from '../canvasUtils';
import type { Bytes } from './byteWriter';
import { AppError } from '../appError';
import { encodeBmp } from './bmp';
import { encodeTga } from './tga';
import { encodeNetpbm } from './netpbm';
import { encodePcx } from './pcx';
import { encodeTiff } from './tiff';
import { encodeRawPixels } from './rawPixels';
import { encodeGif } from './gif';
import { encodePdf } from './pdf';

/**
 * 存储格式清单。数据定义 + 统一编码接口，「存储为」的格式下拉直接消费这张表，
 * 加一个格式只改这个文件（CLAUDE.md §1.2 的数据驱动模式）。
 *
 * 顺序与分组对齐 PS 中文版「存储为」的格式下拉。
 */

/** 编码器拿到的输入。平面格式用 flat，分层格式用 doc + layers */
export interface EncodeInput {
  /** 拼合后的画布 */
  flat: HTMLCanvasElement;
  doc: Doc;
  layers: Layer[];
  /** JPEG / WebP 的质量，0-100 */
  quality: number;
}

export type FormatId =
  | 'psd'
  | 'psb'
  | 'png'
  | 'jpeg'
  | 'webp'
  | 'gif'
  | 'tiff'
  | 'bmp'
  | 'tga'
  | 'pcx'
  | 'ppm'
  | 'pdf'
  | 'raw';

export interface FormatDef {
  id: FormatId;
  /** 格式名的词条 key。engine 不认识语言，翻译在 UI 层做（I18N.md §2.3）*/
  labelKey: string;
  /** 主扩展名 */
  ext: string;
  /** 同一套编码、PS 里另外认的扩展名 */
  altExts?: string[];
  /** 能否保留图层。false 表示存的是拼合结果 */
  layered: boolean;
  /** 有没有质量参数（决定对话框要不要显示质量滑块） */
  hasQuality?: boolean;
  encode: (input: EncodeInput) => Promise<Bytes>;
}

/** 取拼合画布的全幅像素 */
function pixelsOf(canvas: HTMLCanvasElement): ImageData {
  return ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * 走 canvas.toBlob 的原生编码（PNG / JPEG / WebP）。
 *
 * WebP 在旧 Safari 上不支持，toBlob 会静默回退成 PNG 或者给 null。
 * 这里检查返回的 MIME 是否真的是要的那个，不对就抛错让上层提示，
 * 不允许静默把 PNG 存成 .webp（CLAUDE.md §3.2）。
 */
async function nativeEncode(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Bytes> {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), mime, quality / 100);
  });
  if (!blob) throw new AppError('error.encode.unsupported', { mime });
  if (blob.type !== mime) {
    throw new AppError('error.encode.tryPngOrJpeg', { mime });
  }
  return new Uint8Array(await blob.arrayBuffer());
}

/** PSD / PSB 共用一套写入，扩展名不同（PSB 是超大尺寸用的变体） */
async function encodePsd(input: EncodeInput): Promise<Bytes> {
  // 动态 import：ag-psd 约 287 kB，只在真写 PSD 时才拉进来
  const { writePsdFile } = await import('../psdIO');
  return new Uint8Array(writePsdFile(input.doc, input.layers));
}

export const FORMATS: FormatDef[] = [
  {
    id: 'psd',
    labelKey: 'format.psd',
    ext: 'psd',
    // PDD 与 PSDT 是同一套字节，PS 认这几个扩展名
    altExts: ['pdd', 'psdt'],
    layered: true,
    encode: encodePsd,
  },
  {
    id: 'psb',
    labelKey: 'format.psb',
    ext: 'psb',
    layered: true,
    encode: encodePsd,
  },
  {
    id: 'png',
    labelKey: 'format.png',
    ext: 'png',
    // PNS 是立体 PNG，字节结构与普通 PNG 相同
    altExts: ['pns'],
    layered: false,
    encode: ({ flat }) => nativeEncode(flat, 'image/png', 100),
  },
  {
    id: 'jpeg',
    labelKey: 'format.jpeg',
    ext: 'jpg',
    altExts: ['jpeg', 'jpe', 'jps'],
    layered: false,
    hasQuality: true,
    encode: ({ flat, quality }) => nativeEncode(flat, 'image/jpeg', quality),
  },
  {
    id: 'webp',
    labelKey: 'format.webp',
    ext: 'webp',
    layered: false,
    hasQuality: true,
    encode: ({ flat, quality }) => nativeEncode(flat, 'image/webp', quality),
  },
  {
    id: 'gif',
    labelKey: 'format.gif',
    ext: 'gif',
    layered: false,
    encode: async ({ flat }) => encodeGif(pixelsOf(flat)),
  },
  {
    id: 'tiff',
    labelKey: 'format.tiff',
    ext: 'tif',
    altExts: ['tiff'],
    layered: false,
    encode: async ({ flat, doc }) => encodeTiff(pixelsOf(flat), doc.resolution),
  },
  {
    id: 'bmp',
    labelKey: 'format.bmp',
    ext: 'bmp',
    altExts: ['rle', 'dib'],
    layered: false,
    // 32 位保留 alpha，与 PS 的 BMP 高级选项里勾上 alpha 通道等效
    encode: async ({ flat }) => encodeBmp(pixelsOf(flat), 32),
  },
  {
    id: 'tga',
    labelKey: 'format.tga',
    ext: 'tga',
    altExts: ['vda', 'icb', 'vst'],
    layered: false,
    encode: async ({ flat }) => encodeTga(pixelsOf(flat)),
  },
  {
    id: 'pcx',
    labelKey: 'format.pcx',
    ext: 'pcx',
    layered: false,
    encode: async ({ flat }) => encodePcx(pixelsOf(flat)),
  },
  {
    id: 'ppm',
    labelKey: 'format.ppm',
    ext: 'ppm',
    altExts: ['pbm', 'pgm', 'pnm', 'pxm'],
    layered: false,
    encode: async ({ flat }) => encodeNetpbm(pixelsOf(flat), 'ppm'),
  },
  {
    id: 'pdf',
    labelKey: 'format.pdf',
    ext: 'pdf',
    altExts: ['pdp'],
    layered: false,
    hasQuality: true,
    encode: async ({ flat, quality, doc }) => {
      // PDF 里塞的是 JPEG 流，所以先让浏览器编一次 JPEG
      const jpeg = await nativeEncode(flat, 'image/jpeg', quality);
      return encodePdf(jpeg, flat.width, flat.height, doc.resolution);
    },
  },
  {
    id: 'raw',
    labelKey: 'format.raw',
    ext: 'raw',
    layered: false,
    encode: async ({ flat }) => encodeRawPixels(pixelsOf(flat)),
  },
];

/** 按 id 查格式，找不到时退回 PSD */
export function formatById(id: FormatId): FormatDef {
  return FORMATS.find((item) => item.id === id) ?? FORMATS[0];
}

/**
 * 按扩展名反查格式。用户在系统文件框里手敲 .png 时要据此切换编码器 ——
 * PS 也是这个行为：改了扩展名就按那个格式存。
 */
export function formatByExt(fileName: string): FormatDef | null {
  const match = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (!match) return null;
  const ext = match[1].toLowerCase();
  return (
    FORMATS.find((item) => item.ext === ext || item.altExts?.includes(ext)) ?? null
  );
}
