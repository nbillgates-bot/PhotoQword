/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Bytes } from './byteWriter';

/**
 * Photoshop Raw（.raw）编码器。
 *
 * 就是裸像素扔文件里。没有头、没有魔数、没有宽高信息，打开时必须手敲尺寸。
 * PS 里确实有这个格式，存储对话框的扩展名下拉一拉到最下面就看到了。
 *
 * 用途主要是给其他软件或脚本一堆像素，对方已经知道尺寸，
 * 再写一个完整格式就多余了。导出到 MATLAB / NumPy 有时候会走这个。
 */

export function encodeRawPixels(image: ImageData): Bytes {
  return new Uint8Array(image.data);
}
