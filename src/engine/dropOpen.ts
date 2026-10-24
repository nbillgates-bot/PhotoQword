/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { isPsdFileName } from './psdNaming';

/**
 * 拖入文件后走「打开」还是「置入」。
 *
 * 只做字符串判断，不碰 File API 也不认识 store，
 * 这样拖放的分派规则可以单独测（规约 §9）。
 */

/** 拖入后要执行的动作 */
export type DropAction =
  /** 作为新文档打开 */
  | 'open'
  /** 作为图层置入当前文档 */
  | 'place';

export interface DropPlan {
  /** 处理列表里的第几个文件。当前一次只处理一个，恒为 0 */
  index: number;
  action: DropAction;
  /** 一次拖进来多个时被忽略的数量，>0 时要提示用户，不许静默丢掉（规约 §7） */
  ignored: number;
}

/**
 * 决定这次拖放怎么处理。
 *
 * PS 的规则：拖到已有文档的画布上是「置入」，成为当前文档的一个图层；
 * 没有文档时拖进来是「打开」。
 *
 * 分层格式（PSD / PSB）是例外，一律按打开处理 —— 它本身就是一整个文档，
 * 置入只会拿到拼合后的一张图，图层结构全丢。
 * PS 的做法是在新标签页里打开，我们没有标签页，退化成替换当前文档；
 * 这与菜单「文件 > 打开」的既有行为一致，那条路也是直接替换。
 *
 * 不做格式白名单：能不能解码交给解码器判断，失败了照 §7 弹提示。
 * 白名单只会把浏览器其实认得的格式（AVIF、SVG、ICO…）挡在外面。
 */
export function planDrop(fileNames: string[], hasDoc: boolean): DropPlan | null {
  if (fileNames.length === 0) return null;
  const first = fileNames[0];
  return {
    index: 0,
    action: !hasDoc || isPsdFileName(first) ? 'open' : 'place',
    ignored: fileNames.length - 1,
  };
}
