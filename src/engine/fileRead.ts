/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 带进度与取消的文件读取。
 *
 * 为什么不用 file.arrayBuffer()：它没有进度事件。
 * 大 PSD 光「把文件读进内存」这一步就要好几秒（几百 MB 的文件更久），
 * 这段时间界面上必须有东西在动，否则用户以为卡死了。
 * FileReader 的 onprogress 给的是真实字节数，不是估的。
 */

import { AppError } from './appError';

/** 用户主动取消。与真正的失败区分开：取消不该弹错误提示 */
export class ReadCancelled extends Error {
  constructor() {
    super('ReadCancelled'); // i18n-exempt: 只用来区分取消与失败，不显示给用户
    this.name = 'ReadCancelled';
  }
}

/** 已经取消了就立刻抛，避免白做一整步的活 */
export function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ReadCancelled();
}

/**
 * 把 File 读成 ArrayBuffer，边读边报进度。
 * onProgress 收到的是 0-1 的比例；文件长度未知时（罕见）不调用。
 */
export function readFileWithProgress(
  file: File,
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    // 进 Promise 之前就可能已经取消了，先挡一道
    if (signal?.aborted) {
      reject(new ReadCancelled());
      return;
    }

    const reader = new FileReader();
    const onAbort = () => reader.abort();

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    reader.onprogress = (event) => {
      // lengthComputable 为假时 total 是 0，算出来是 Infinity，不能往外报
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(event.loaded / event.total);
      }
    };

    reader.onload = () => {
      cleanup();
      const result = reader.result;
      /*
       * readAsArrayBuffer 成功时 result 一定是 ArrayBuffer，
       * 但类型上它还可能是 string（readAsText 的情形），所以显式判一次，
       * 而不是断言——断言错了会在下游变成难查的类型错乱。
       */
      if (result instanceof ArrayBuffer) resolve(result);
      else reject(new Error('文件读取返回了意外的类型')); // i18n-exempt: 契约性错误，FileReader 违约才会触发
    };

    reader.onerror = () => {
      cleanup();
      reject(new AppError('error.file.readFailed', { reason: reader.error?.message ?? '' }));
    };

    reader.onabort = () => {
      cleanup();
      reject(new ReadCancelled());
    };

    signal?.addEventListener('abort', onAbort);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 时间分片让行器。
 *
 * 逐层解码时必须周期性交还主线程，否则进度条画不出来，界面也点不动。
 * 但不能每层都让：浏览器把嵌套 setTimeout 钳到 4ms，200 层就是白搭 800ms。
 * 所以按时间判断——攒够 SLICE_MS 才让一次。
 *
 * 用 setTimeout 而不是 requestAnimationFrame：rAF 在后台标签页不触发，
 * 用户切走再切回来会发现打开卡在中途没动。
 */
const SLICE_MS = 24;

export function createYielder(sliceMs = SLICE_MS): () => Promise<void> | null {
  let last = performance.now();
  return () => {
    const now = performance.now();
    if (now - last < sliceMs) return null;
    last = now;
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, 0);
    });
  };
}
