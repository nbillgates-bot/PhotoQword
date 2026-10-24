/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { translate } from './translate';
import type { Locale } from './types';

/**
 * 图层与文档的默认名称。
 *
 * 这些名字是**用户数据**，不是界面文案：建出来之后可以改名、会写进 PSD、
 * 也会显示在历史记录里。所以只在创建那一刻按当前语言取值，
 * 之后切换语言不回头改已有图层的名字 —— PS 也是这个行为
 * （英文版建的「Background」在中文版里打开依然叫 Background）。
 *
 * 用函数包一层而不是各处直接写 translate(locale, 'layer.background')，
 * 是因为背景名有四个创建点（新建文档、打开图片、拼合图像、无图层 PSD），
 * 词条 key 散在四个文件里改一处漏三处（规约 §1.1）。
 */

/** 背景图层名 */
export function backgroundLayerName(locale: Locale): string {
  return translate(locale, 'layer.background');
}

/** 第 index 个新建图层的名字，index 从 1 开始 */
export function newLayerName(locale: Locale, index: number): string {
  return translate(locale, 'layer.numbered', { index });
}

/** 未命名文档 */
export function untitledDocName(locale: Locale): string {
  return translate(locale, 'doc.untitled');
}

/** 第 index 个新建组的名字，index 从 1 开始 */
export function newGroupName(locale: Locale, index: number): string {
  return translate(locale, 'layer.groupNumbered', { index });
}

/** 调整图层名，如「色阶 调整」 */
export function adjustmentLayerName(locale: Locale, kind: string): string {
  return translate(locale, 'layer.adjustment', { kind });
}

/** 文字图层的默认名（内容为空时用） */
export function textLayerName(locale: Locale): string {
  return translate(locale, 'layer.text');
}

/** 形状图层的默认名 */
export function shapeLayerName(locale: Locale): string {
  return translate(locale, 'layer.shape');
}

/** 粘贴出来的图层名 */
export function pastedLayerName(locale: Locale): string {
  return translate(locale, 'layer.pasted');
}

/** PSD 里没写名字的图层用这个名 */
export function unnamedLayerName(locale: Locale): string {
  return translate(locale, 'layer.unnamed');
}

/** 副本名，如「背景 副本」。PS 复制图层就是加这个后缀 */
export function copyOfName(locale: Locale, name: string): string {
  return translate(locale, 'layer.copySuffix', { name });
}
