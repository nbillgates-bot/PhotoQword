/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 把 Blob 存成本地文件。
 *
 * 导出图片和存储 PSD 都要走这一套（建临时链接、点击、回收 URL），
 * 所以抽出来一份，两边共用。
 * 数据始终留在浏览器里，不经过任何服务器。
 */

/** 撤销 object URL 前等一个事件循环，确保下载已经真正开始 */
const REVOKE_DELAY = 0;

/**
 * 触发一次浏览器下载。
 *
 * 之所以不复用一个常驻的 <a>：链接必须在点击时带着当次的 href 和 download，
 * 复用会在连续导出时撞上上一次还没回收的 URL。
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  // 交给下一个事件循环再回收，立刻 revoke 会让下载拿不到数据
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY);
}
