/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * PSD / PSB 的文件名与尺寸判断。
 *
 * 单独一个文件是为了打包：psdIO 要 import ag-psd（约 287 kB），
 * 那份代码只在真正读写 PSD 时才需要，走的是动态 import。
 * 但「这个文件是不是 PSD」的判断在打开文件的分派处就要用上，
 * 要是从 psdIO 里取，整个 ag-psd 就被拖回主包，动态 import 白做了。
 *
 * 所以这里只放纯字符串和数字运算，不许 import ag-psd。
 */

/**
 * PSD / PSB 的扩展名。
 * 写成 \.ps[db]$ 而不是 \.psb?$ —— 后者匹配的是 ".ps" 加可选的 b，
 * 正好把 .psd 漏掉，是个一眼看不出来的坑。
 */
const PSD_EXT = /\.ps[db]$/i;

/** 这个文件名是不是 PSD / PSB */
export function isPsdFileName(fileName: string): boolean {
  return PSD_EXT.test(fileName);
}

/** 去掉 .psd / .psb 扩展名，用作文档名 */
export function stripPsdExt(fileName: string): string {
  return fileName.replace(PSD_EXT, '');
}

/** PSD 格式的单边尺寸上限，超过就得写成 PSB */
export const PSD_MAX_SIDE = 30000;

/** 超出 PSD 上限、必须改用 PSB 格式 */
export function needsPsb(doc: { width: number; height: number }): boolean {
  return doc.width > PSD_MAX_SIDE || doc.height > PSD_MAX_SIDE;
}

/**
 * 保存时该用的文件名。
 * 扩展名要跟着实际写出的格式走：超过 PSD 的尺寸上限时写的是 PSB，
 * 名字还挂 .psd 的话 PS 打开会直接报文件损坏。
 */
export function psdFileName(doc: { name: string; width: number; height: number }): string {
  return `${doc.name}.${needsPsb(doc) ? 'psb' : 'psd'}`;
}

/*
 * 用户敲进「存储为」的名字如何整理，见 engine/formats/saveNaming.ts。
 * 那份逻辑要查格式注册表才知道该用哪个扩展名，放这里会形成反向依赖。
 */
