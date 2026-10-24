/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 引擎层测试的像素读取helper。
 *
 * 这两个函数原先住在 tools/testKit.ts 里，但那个文件 import 了 useEditorStore。
 * engine/ 的测试引用它就等于把 store 拖进引擎层的依赖图，违反规约 §2.1 的
 * 「依赖只能从上往下」。它们本身只依赖 ctx2d，是纯粹的画布操作，所以下沉到这里，
 * 由 testKit 再导出，工具层的既有 import 保持不变。
 *
 * 本文件不含断言，也不 import vitest，不会被打包进产物——应用代码不引用它。
 */
import { ctx2d } from './canvasUtils';

/** 读画布某点的 RGBA */
export function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

/**
 * 整块像素里有没有 NaN 残留。Uint8ClampedArray 会把 NaN 静默变成 0，
 * 画面只是黑一块，不报错也不崩溃，所以像素计算后必须显式查一遍（规约 §9）。
 *
 * 刻意扫完再返回布尔值，让调用方只写一次 expect：
 * 在几万次循环里调 expect 的开销足以把用例拖到超时。
 */
export function hasNaN(canvas: HTMLCanvasElement): boolean {
  const data = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 0; i < data.length; i += 1) {
    if (Number.isNaN(data[i])) return true;
  }
  return false;
}

/**
 * 记录 run 期间每一次 getContext('2d', options) 的实参。
 *
 * 用来断言「要被反复读像素的画布在**第一次**取上下文时就声明了
 * willReadFrequently」：这个 options 只有首次 getContext 生效，
 * 所以光断言「调用过一次带标记的」不够，得看第一次是什么。
 *
 * 手动打补丁而不用 vi.spyOn，是为了不把 vitest 拖进本文件（见文件头说明）；
 * 补丁在 finally 里还原，不依赖测试框架的自动恢复。
 */
export function recordContextOptions<T>(run: () => T): {
  result: T;
  options: ContextOptions[];
} {
  const { options, restore } = patchGetContext();
  try {
    return { result: run(), options };
  } finally {
    restore();
  }
}

/**
 * recordContextOptions 的异步版：补丁留到 promise 落定之后才撤。
 *
 * 同步版在 finally 里就还原了，那时 async 函数只是返回了 promise，
 * 第一个 await 之后建的画布会漏记。
 */
export async function recordContextOptionsAsync<T>(
  run: () => Promise<T>,
): Promise<{ result: T; options: ContextOptions[] }> {
  const { options, restore } = patchGetContext();
  try {
    return { result: await run(), options };
  } finally {
    restore();
  }
}

/**
 * 全程盯着 getContext，记下哪些画布「第一次」取 2D 上下文时声明了
 * willReadFrequently。用来断言不变量：进历史差分的画布必须是被声明过的。
 *
 * 只能用插桩来判：node-canvas 没实现 getContextAttributes，
 * 拿到画布之后无法反查它当初是怎么建的。
 */
export function trackReadbackCanvases(): {
  isReadback: (canvas: HTMLCanvasElement) => boolean;
  stop: () => void;
} {
  const flagged = new WeakSet<HTMLCanvasElement>();
  const seen = new WeakSet<HTMLCanvasElement>();
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    ...args: unknown[]
  ) {
    if (args[0] === '2d' && !seen.has(this)) {
      seen.add(this);
      const options = args[1] as ContextOptions;
      if (options?.willReadFrequently) flagged.add(this);
    }
    return (original as (...rest: unknown[]) => unknown).apply(this, args);
  } as typeof HTMLCanvasElement.prototype.getContext;
  return {
    isReadback: (canvas) => flagged.has(canvas),
    stop: () => {
      HTMLCanvasElement.prototype.getContext = original;
    },
  };
}

type ContextOptions = CanvasRenderingContext2DSettings | undefined;

/** 换掉 getContext 记录实参，返回记录数组和还原钩子 */
function patchGetContext(): { options: ContextOptions[]; restore: () => void } {
  const options: ContextOptions[] = [];
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    this: HTMLCanvasElement,
    ...args: unknown[]
  ) {
    if (args[0] === '2d') options.push(args[1] as ContextOptions);
    return (original as (...rest: unknown[]) => unknown).apply(this, args);
  } as typeof HTMLCanvasElement.prototype.getContext;
  return {
    options,
    restore: () => {
      HTMLCanvasElement.prototype.getContext = original;
    },
  };
}
