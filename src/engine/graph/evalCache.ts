/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 求值缓存：非破坏性编辑要能用，就必须缓存。
 *
 * 调整/滤镜节点每次显示都要重算，若不缓存则「20 个调整图层」意味着
 * 每帧跑 20 遍全画布算法，拖一下滑块界面就卡死。
 *
 * 缓存的键是节点的**签名**：签名不变则输出必然不变，可以直接复用。
 * 签名要把所有影响输出的东西都算进去 —— 漏了任何一项，
 * 表现就是「改了参数画面不更新」，这类 bug 比慢更难查。
 */

import type { GraphNode, LayerGraph } from '../../types/graph';
import { orderedNodes } from './graphOps';

/** 缓存条目。value 由调用方决定是什么（通常是合成结果画布） */
interface CacheEntry<T> {
  signature: string;
  value: T;
}

/**
 * 单个节点自身属性的签名。
 * 不含下方内容，因此只能用于判断「这个节点本身变没变」。
 */
export function nodeSignature(node: GraphNode): string {
  const base = [
    node.id,
    node.kind,
    node.visible ? 1 : 0,
    node.opacity,
    node.blendMode,
    node.clipped ? 1 : 0,
    node.maskId ?? '-',
    node.maskEnabled === false ? 0 : 1,
  ];

  if (node.kind === 'pixel') base.push(node.surfaceId, rectKey(node));
  if (node.kind === 'adjustment') base.push(node.adjustment, JSON.stringify(node.params));
  if (node.kind === 'filter') base.push(JSON.stringify(node.filters));
  if (node.kind === 'smart') {
    base.push(node.transform.join('/'), JSON.stringify(node.filters), node.childIds.join(','));
  }
  if (node.kind === 'text') base.push(node.textId, rectKey(node));
  if (node.kind === 'shape') base.push(node.shapeId, rectKey(node));

  return base.join('|');
}

/** bounds 的紧凑表示，节点没有 bounds 时用占位符 */
function rectKey(node: GraphNode): string {
  const rect = 'bounds' in node ? node.bounds : null;
  if (!rect) return '-';
  return `${rect.x},${rect.y},${rect.width},${rect.height}`;
}

/**
 * 某节点在图中的**累积签名**：它自己 + 它下方所有参与合成的内容。
 *
 * 调整节点吃的是「下面已经合成出来的画面」，所以下方任何一层变了
 * 它的输出就得重算。只看自己的签名会漏掉这种依赖。
 */
export function cumulativeSignature(graph: LayerGraph, id: string): string {
  const nodes = orderedNodes(graph);
  const index = nodes.findIndex((node) => node.id === id);
  if (index < 0) return '';
  return nodes
    .slice(0, index + 1)
    .map(nodeSignature)
    .join('||');
}

/**
 * 按节点缓存求值结果。
 *
 * 用 Map 而不是给节点挂字段：节点是不可变数据，每次改属性都会造新对象，
 * 挂在上面的缓存会跟着丢；缓存的生命周期应当独立于节点对象。
 */
export class EvalCache<T> {
  private entries = new Map<string, CacheEntry<T>>();
  /** 上限，超了按插入序淘汰最旧的。防止长会话内存无限增长 */
  private readonly limit: number;

  constructor(limit = 64) {
    this.limit = limit;
  }

  get size(): number {
    return this.entries.size;
  }

  /** 签名一致时返回缓存值，否则返回 null */
  get(id: string, signature: string): T | null {
    const entry = this.entries.get(id);
    if (!entry || entry.signature !== signature) return null;
    return entry.value;
  }

  /** 存入。同一节点重复存会覆盖，不会占两份 */
  set(id: string, signature: string, value: T): void {
    if (!this.entries.has(id) && this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next();
      if (!oldest.done) this.entries.delete(oldest.value);
    }
    this.entries.set(id, { signature, value });
  }

  /** 丢弃某节点的缓存（节点被删时调用） */
  invalidate(id: string): void {
    this.entries.delete(id);
  }

  /** 全清（文档切换、关闭时调用） */
  clear(): void {
    this.entries = new Map();
  }
}
