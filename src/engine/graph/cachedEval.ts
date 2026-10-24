/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 带缓存的求值入口。
 *
 * 求值器本身是无状态纯函数（好测），缓存是有状态的（好用），
 * 所以分开：这里只负责「算之前先查、算完存起来」。
 *
 * 缓存键除了图的累积签名，还要带上 **resolver 版本**：
 * 签名里只有 surfaceId，看不见 id 背后的像素变没变。
 * 画一笔之后 id 不变但像素变了，只看签名就会拿旧画面出来——
 * 表现是「画了没反应」，所以像素变动必须由调用方 bump 版本号。
 */

import type { LayerGraph } from '../../types/graph';
import { EvalCache, cumulativeSignature } from './evalCache';
import { evaluateGraph } from './evaluator';
import type { EvalContext } from './evalTypes';
import { orderedNodes } from './graphOps';

export interface CachedEvalOptions {
  /** 像素内容的版本号。像素变了必须递增，否则会命中过期缓存 */
  revision: number;
  /** 视口等会影响输出的额外维度，一并进键 */
  variant?: string;
}

/** 整幅画面的缓存键。用固定的假 id，因为缓存的是"整幅"而不是某个节点 */
const ROOT_KEY = '__root__';

export class GraphRenderer {
  private cache: EvalCache<HTMLCanvasElement>;

  constructor(limit = 8) {
    // 整幅画面每份都是全尺寸画布，上限要比节点级缓存小得多
    this.cache = new EvalCache<HTMLCanvasElement>(limit);
  }

  /**
   * 求值，命中缓存时直接返回上次的画布。
   *
   * 返回的画布**可能是缓存实例**，调用方不要就地修改它，
   * 要改先自己拷一份。这是为了避免每次命中都白拷一次全尺寸画布。
   */
  render(
    graph: LayerGraph,
    ctx: EvalContext,
    options: CachedEvalOptions,
  ): HTMLCanvasElement {
    const signature = this.signatureOf(graph, ctx, options);
    const hit = this.cache.get(ROOT_KEY, signature);
    if (hit) return hit;

    const out = evaluateGraph(graph, ctx);
    this.cache.set(ROOT_KEY, signature, out);
    return out;
  }

  /** 缓存键：图的结构与属性 + 像素版本 + 文档尺寸 + 变体 */
  private signatureOf(
    graph: LayerGraph,
    ctx: EvalContext,
    options: CachedEvalOptions,
  ): string {
    const nodes = orderedNodes(graph);
    const top = nodes[nodes.length - 1];
    // 累积签名要从最顶层的节点取，才覆盖到整张图
    const graphPart = top ? cumulativeSignature(graph, top.id) : 'empty';
    return [
      graphPart,
      `rev:${options.revision}`,
      `size:${ctx.width}x${ctx.height}`,
      `var:${options.variant ?? '-'}`,
    ].join('##');
  }

  /** 丢弃缓存（文档切换、关闭时调用） */
  clear(): void {
    this.cache.clear();
  }
}
