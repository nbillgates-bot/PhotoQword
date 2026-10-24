/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * PSD / PSB 读写的统一入口。
 *
 * 读和写各自一个文件（psdRead / psdWrite），这里只做转出：
 * 两边加起来早就超过单文件的行数上限，而且职责本来就不同——
 * 读要处理进度、取消、逐层解码，写只是一次性把树转出去。
 *
 * 保留这个入口是因为它是动态 import 的边界：
 * docSlice 和 useFileIO 都 import('./psdIO')，ag-psd 那 287 kB
 * 因此只在真的读写 PSD 时才下载。加新的 PSD 相关模块时接到这里，
 * 不要在别处静态 import 它们，否则整个库会被拖回主包。
 */

export {
  readPsdBuffer,
  readPsdFile,
  type PsdPhase,
  type PsdProgress,
  type PsdProgressFn,
  type ReadPsdOptions,
} from './psdRead';

export { writePsdFile } from './psdWrite';
