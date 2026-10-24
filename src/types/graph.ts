/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 非破坏性图层图。
 *
 * 现有实现把调整与滤镜**就地烧进像素**：拖完滑块点确定，原始数据就没了，
 * 只能靠撤销退回去。PS 的核心工作流恰恰相反——调整图层、智能滤镜都是
 * 挂在栈上的「节点」，任何时候双击都能改回参数，下面的像素始终原封不动。
 *
 * 所以图层不再是「一张画布」，而是一张求值图：
 * 像素节点提供源数据，调整/滤镜节点在求值时才施加效果。
 *
 * 这里只定义类型与结构操作，求值器在 engine/graph/ 里。
 */

import type { BlendMode, Rect } from './index';
import type { AdjustParams } from '../engine/adjustments';
import type { LayerEffects } from './effects';

/** 节点类型。与 PS 的图层种类一一对应 */
export type NodeKind =
  | 'pixel'
  | 'adjustment'
  | 'filter'
  | 'smart'
  | 'group'
  | 'text'
  | 'shape';

/** 调整类型。取值与 PS「图像 > 调整」以及调整图层菜单一致 */
export type AdjustmentKind =
  | 'brightness-contrast'
  | 'levels'
  | 'curves'
  | 'hue-saturation'
  | 'color-balance'
  | 'black-white'
  | 'invert'
  | 'threshold'
  | 'posterize';

/** 所有节点共有的属性 */
export interface NodeBase {
  id: string;
  name: string;
  kind: NodeKind;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  /** 所属组，null 表示在最外层。沿用扁平数组 + parentId，与现有 Layer 一致 */
  parentId: string | null;
  /** 剪贴到下方图层。语义同 Layer.clipped，由栈内相邻顺序决定作用对象 */
  clipped?: boolean;
  locked?: boolean;
  /** 蒙版。分块存储，未设则为 undefined */
  maskId?: string;
  maskEnabled?: boolean;
  /** 图层样式/效果（投影、发光、描边） */
  effects?: LayerEffects;
}

/** 像素节点：真正持有像素数据的叶子，对应现有的栅格图层 */
export interface PixelNode extends NodeBase {
  kind: 'pixel';
  /** 指向分块存储的 id，像素不直接挂在节点上（节点要能廉价复制） */
  surfaceId: string;
  bounds: Rect;
}

/**
 * 调整节点：不含像素，对下方所有可见内容施加调整。
 *
 * 与 PS 的调整图层一致——它影响的是「下面已经合成出来的画面」，
 * 而不是某一个具体图层。放进组里则只影响组内。
 */
export interface AdjustmentNode extends NodeBase {
  kind: 'adjustment';
  adjustment: AdjustmentKind;
  /** 参数按调整类型解释，求值器负责分派 */
  params: Partial<AdjustParams> & Record<string, unknown>;
}

/** 挂在节点上的一条智能滤镜。参数可反复编辑，对应 PS 的智能滤镜列表 */
export interface FilterEntry {
  id: string;
  filterId: string;
  params: Record<string, unknown>;
  enabled: boolean;
  opacity: number;
  blendMode: BlendMode;
}

/** 滤镜节点：把一串可编辑的滤镜施加到下方内容 */
export interface FilterNode extends NodeBase {
  kind: 'filter';
  filters: FilterEntry[];
}

/**
 * 智能对象：内部是一整张独立的子图，外部只看到一个可变换的图层。
 * 变换记在 transform 上，源数据不动 —— 这是它「非破坏」的由来。
 */
export interface SmartNode extends NodeBase {
  kind: 'smart';
  /** 子图的根节点 id 列表，自底向上 */
  childIds: string[];
  /** 2×3 仿射矩阵 [a, b, c, d, e, f]，与 canvas setTransform 同序 */
  transform: [number, number, number, number, number, number];
  /** 挂在智能对象上的智能滤镜 */
  filters: FilterEntry[];
  bounds: Rect;
}

/** 图层组。本身不含像素，pass-through 时不做隔离 */
export interface GroupNode extends NodeBase {
  kind: 'group';
  collapsed?: boolean;
}

/** 文字节点。内容始终可再编辑，栅格化只发生在求值时 */
export interface TextNode extends NodeBase {
  kind: 'text';
  /** 具体排版数据沿用 TextData，后续扩为按字符的格式段 */
  textId: string;
  bounds: Rect;
}

/** 形状节点。矢量描述，缩放不失真 */
export interface ShapeNode extends NodeBase {
  kind: 'shape';
  shapeId: string;
  bounds: Rect;
}

export type GraphNode =
  | PixelNode
  | AdjustmentNode
  | FilterNode
  | SmartNode
  | GroupNode
  | TextNode
  | ShapeNode;

/**
 * 图层图。节点存在扁平 Map 里，order 决定自底向上的合成次序。
 *
 * 用「扁平 Map + order + parentId」而不是嵌套 children：
 * 与现有 Layer 的组织方式一致，历史记录、重排、删除都不需要改写遍历逻辑。
 */
export interface LayerGraph {
  nodes: Record<string, GraphNode>;
  /** 自底向上的节点 id 序列，含所有层级的节点 */
  order: string[];
}

/** 该节点是否自带像素或矢量内容（相对于「只施加效果」的节点） */
export function isContentNode(node: GraphNode): boolean {
  return (
    node.kind === 'pixel' ||
    node.kind === 'text' ||
    node.kind === 'shape' ||
    node.kind === 'smart'
  );
}

/** 该节点是否只对下方内容施加效果，自身不产生像素 */
export function isEffectNode(node: GraphNode): boolean {
  return node.kind === 'adjustment' || node.kind === 'filter';
}
