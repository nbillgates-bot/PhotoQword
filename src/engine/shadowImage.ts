/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createReadbackCanvas, ctx2d } from './canvasUtils';
import { canvasFromPixels, readAll } from './pixelDiff';

/**
 * 历史记录的「影子副本」：上一次提交时的像素基准，用来算增量。
 *
 * 为什么要多这一层抽象，而不是直接存 ImageData：
 *
 * 打开 016.psd（287 图层）时，压初始快照要给每个图层做一次整幅 getImageData。
 * 各层加起来约 4500 万像素 ≈ 180MB，一口气在主线程上分配 + 回读，
 * 就是「进度条走到 287/287 之后还要卡好几秒图才出来」的那几秒。
 *
 * 关键的观察是：**这 287 份基准里，绝大多数一辈子都不会被用到**。
 * 用户打开文件之后往往只动几个图层，只有被动过的那几层需要拿基准去比对。
 * 所以基准不必在打开时就materialize成 ImageData，只要先「冻结」住当时的画面，
 * 等真的要比对了再解出像素。
 *
 * 冻结用 drawImage 到一张新画布——这一步只是 canvas 之间的位块传送，
 * 不需要把像素搬进 JS 堆，也不需要做 alpha 反预乘，比 getImageData 便宜得多。
 * 于是打开时的代价从「180MB 的 ImageData 分配 + 回读」降成「一次画布拷贝」，
 * 而昂贵的回读被摊到用户真正编辑某一层的那一刻，且每层只付一次。
 *
 * 内存上不比原来差：原来是「图层画布 + 等量的 ImageData 常驻」，
 * 现在是「图层画布 + 等量的快照画布」，都是每像素 4 字节，只是从 JS 堆
 * 挪到了画布后备存储。materialize 之后快照画布就可以丢掉（见 pixels()）。
 */
export interface ShadowImage {
  readonly width: number;
  readonly height: number;
  /** 解出像素。第一次调用可能触发整幅回读，之后走缓存 */
  pixels(): ImageData;
  /** 复制成一张可直接用的画布，不必先经过 ImageData */
  toCanvas(): HTMLCanvasElement;
}

/** 已经拿到 ImageData 时（扫描过程顺手读出来的那份）直接包一层，不再重复读 */
export function shadowFromPixels(pixels: ImageData): ShadowImage {
  return {
    width: pixels.width,
    height: pixels.height,
    pixels: () => pixels,
    toCanvas: () => canvasFromPixels(pixels),
  };
}

/**
 * 冻结一张画布当前的画面，像素延迟到第一次 pixels() 时才解。
 *
 * 必须拷贝而不能直接持有传入的 canvas：图层画布随后会被工具就地改写，
 * 拿着同一个引用当「上一步的样子」，算出来的增量会恒为空。
 */
export function shadowFromCanvas(source: HTMLCanvasElement): ShadowImage {
  const { width, height } = source;
  let frozen: HTMLCanvasElement | null = createReadbackCanvas(width, height);
  ctx2d(frozen).drawImage(source, 0, 0);
  let cached: ImageData | null = null;

  return {
    width,
    height,
    pixels: () => {
      if (!cached) {
        // frozen 一定还在：cached 为空说明还没走过这个分支
        cached = readAll(frozen as HTMLCanvasElement);
        // 像素已在手上，快照画布没有存在的必要了，早点让 GC 收走
        frozen = null;
      }
      return cached;
    },
    toCanvas: () => {
      if (frozen) {
        const copy = createReadbackCanvas(width, height);
        ctx2d(copy).drawImage(frozen, 0, 0);
        return copy;
      }
      return canvasFromPixels(cached as ImageData);
    },
  };
}
