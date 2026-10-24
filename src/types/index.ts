/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { LayerEffects } from './effects';

/** 基础几何类型 */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 图层混合模式，取值与 Canvas globalCompositeOperation 对应 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  // 以下 6 个 canvas 没有原生支持，由 engine/blendModes.ts 逐像素实现
  | 'linear-burn'
  | 'linear-dodge'
  | 'vivid-light'
  | 'linear-light'
  | 'pin-light'
  | 'hard-mix'
  /**
   * 穿透，只对图层组有意义，也是 PS 里新建组的默认值。
   * 组内图层直接与组下方的画面混合，等于组不做隔离。
   * 非组图层不提供这个选项（见 blendOptionsFor），万一被设上按正常处理。
   */
  | 'pass-through';

/**
 * 混合模式清单。
 * 分组与顺序对齐 PS 中文版的下拉菜单：正常 / 变暗组 / 变亮组 / 对比组 / 差集组 / 颜色组。
 * group 相同的连续项在 UI 里显示为一组，组间画分隔线。
 */
export const BLEND_MODES: { value: BlendMode; label: string; group: string }[] = [
  { value: 'normal', label: 'blend.normal', group: 'blendGroup.basic' },

  { value: 'darken', label: 'blend.darken', group: 'blendGroup.darken' },
  { value: 'multiply', label: 'blend.multiply', group: 'blendGroup.darken' },
  { value: 'color-burn', label: 'blend.colorBurn', group: 'blendGroup.darken' },
  { value: 'linear-burn', label: 'blend.linearBurn', group: 'blendGroup.darken' },

  { value: 'lighten', label: 'blend.lighten', group: 'blendGroup.lighten' },
  { value: 'screen', label: 'blend.screen', group: 'blendGroup.lighten' },
  { value: 'color-dodge', label: 'blend.colorDodge', group: 'blendGroup.lighten' },
  { value: 'linear-dodge', label: 'blend.linearDodge', group: 'blendGroup.lighten' },

  { value: 'overlay', label: 'blend.overlay', group: 'blendGroup.contrast' },
  { value: 'soft-light', label: 'blend.softLight', group: 'blendGroup.contrast' },
  { value: 'hard-light', label: 'blend.hardLight', group: 'blendGroup.contrast' },
  { value: 'vivid-light', label: 'blend.vividLight', group: 'blendGroup.contrast' },
  { value: 'linear-light', label: 'blend.linearLight', group: 'blendGroup.contrast' },
  { value: 'pin-light', label: 'blend.pinLight', group: 'blendGroup.contrast' },
  { value: 'hard-mix', label: 'blend.hardMix', group: 'blendGroup.contrast' },

  { value: 'difference', label: 'blend.difference', group: 'blendGroup.difference' },
  { value: 'exclusion', label: 'blend.exclusion', group: 'blendGroup.difference' },

  { value: 'hue', label: 'blend.hue', group: 'blendGroup.color' },
  { value: 'saturation', label: 'blend.saturation', group: 'blendGroup.color' },
  { value: 'color', label: 'blend.color', group: 'blendGroup.color' },
  { value: 'luminosity', label: 'blend.luminosity', group: 'blendGroup.color' },
];

/**
 * 某类图层可选的混合模式。
 * 穿透只在图层组上有意义，其他类型不列出来，避免用户选了没反应。
 */
export function blendOptionsFor(
  type: LayerType,
): { value: BlendMode; label: string; group: string }[] {
  if (type !== 'group') return BLEND_MODES;
  return [{ value: 'pass-through', label: 'blend.passThrough', group: 'blendGroup.basic' }, ...BLEND_MODES];
}

/** 工具标识 */
export type ToolId =
  | 'move'
  | 'transform'
  | 'marquee-rect'
  | 'marquee-ellipse'
  | 'lasso'
  | 'polygon-lasso'
  | 'wand'
  | 'crop'
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'clone'
  | 'blur'
  | 'sharpen'
  | 'smudge'
  | 'dodge'
  | 'burn'
  | 'bucket'
  | 'gradient'
  | 'text'
  | 'shape'
  | 'eyedropper'
  | 'zoom'
  | 'hand';

/**
 * 图层类型。
 * group 是图层组，本身不含像素，只作为子图层的容器参与合成。
 */
export type LayerType = 'raster' | 'text' | 'shape' | 'group' | 'adjustment';

/**
 * 一段连续字符的颜色覆盖，半开区间 [start, end)。
 *
 * 坐标与 textarea 的 selectionStart/End 同一套，省去两边换算。
 * 相关的纯函数（归一化、上色、编辑后挪位）在 engine/textRuns.ts。
 */
export interface ColorRun {
  start: number;
  end: number;
  color: string;
}

/** 文字图层的可再编辑数据 */
export interface TextData {
  content: string;
  fontFamily: string;
  fontSize: number;
  /**
   * 字重，100-900，400 是常规，700 是粗体。
   * CSS font-weight / FontFace descriptor 的取值，与 PS 字体面板的数值对齐。
   */
  fontWeight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: 'left' | 'center' | 'right';
  /** 整层基色。没有被 colorRuns 覆盖到的字符用它 */
  color: string;
  /**
   * 字符级颜色覆盖，对齐 PS 的字符样式：选中几个字改颜色只影响那几个字。
   *
   * 可选字段 —— 没有它就是整层单色，老文档与 PSD 导入的图层都走这条路。
   * 区间坐标与 textarea 的 selectionStart/End 同一套，模型见 engine/textRuns.ts。
   */
  colorRuns?: ColorRun[];
  lineHeight: number;
  letterSpacing: number;
  x: number;
  y: number;
  /** 段落文本的宽度限制，undefined 表示点文本（横向无限） */
  width?: number;
  /** 段落文本的高度限制，undefined 表示点文本。与 width 同时存在 */
  height?: number;
  /**
   * PSD 原始字体名（仅当字体被替代时存在）。
   * 用于在 UI 上提示"缺少字体 XXX，已用 YYY 替代"。
   */
  originalFontFamily?: string;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'triangle' | 'star' | 'polygon';

/** 形状图层的可再编辑数据 */
export interface ShapeData {
  kind: ShapeKind;
  rect: Rect;
  fill: string;
  stroke: string;
  strokeWidth: number;
  filled: boolean;
  radius: number;
  points: number;
}

/**
 * 图层。像素内容存放在独立的离屏 canvas 上。
 *
 * **画布不必与文档同尺寸**，位置与范围由 bounds 描述，与 PS 一致：
 * 图层可以整块躺在文档之外，也可以只占文档的一小块。
 * 这样移出画布的像素不会被裁掉，小图层也不必按整个文档分配内存。
 */
export interface Layer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  /**
   * 图层在文档坐标系里的位置与范围。
   * width/height 恒等于 canvas 的宽高，x/y 可以为负（图层伸出文档左上角之外）。
   *
   * 不变量：bounds.width === canvas.width && bounds.height === canvas.height。
   * 改画布尺寸的地方必须同步改 bounds，否则合成会错位。
   */
  bounds: Rect;
  /**
   * 全部锁定（PS 图层面板锁定栏最右那个锁）。
   * 锁上后任何编辑都被拒，是三个细分锁之上的总开关。
   */
  locked: boolean;
  /**
   * 锁定透明像素。只能画在已有不透明像素的地方，透明处画不上。
   * 由 overlaySlice 在合入时按原 alpha 裁一遍实现。
   */
  lockTransparent?: boolean;
  /** 锁定图像像素。不能画、不能填充、不能上滤镜，但还能移动 */
  lockPixels?: boolean;
  /** 锁定位置。不能移动/变换，但还能画 */
  lockPosition?: boolean;
  opacity: number;
  blendMode: BlendMode;
  canvas: HTMLCanvasElement;
  /** 图层样式/效果 */
  effects?: LayerEffects;
  /**
   * 图层蒙版。灰度画布，白=显示黑=隐藏，undefined 表示没有蒙版。
   *
   * **尺寸与对齐点由 engine/mask.ts 的 maskGeometry 单独定义，别在这里假设。**
   * 一句话版本：普通图层跟 canvas 同尺寸、对齐到 bounds；组按文档尺寸、对齐到原点
   * （组的 canvas 是 1×1 占位，拿它当基准没有意义）。
   * 合成时取对齐点一律用 maskOrigin，不要直接写 bounds 或 (0,0)。
   */
  mask?: HTMLCanvasElement;
  /** 蒙版是否参与合成。停用时蒙版仍保留，只是不生效（PS 里 Shift+点击缩略图） */
  maskEnabled?: boolean;
  /**
   * 当前编辑目标是蒙版还是图层像素。
   * 每个图层各自记住，和 PS 一致：切走再切回来还是上次选的那个。
   */
  maskSelected?: boolean;
  textData?: TextData;
  shapeData?: ShapeData;
  /** 调整图层的参数。只对 type === 'adjustment' 有意义 */
  adjustmentData?: {
    kind: 'brightness-contrast' | 'levels' | 'curves' | 'hue-saturation';
    params: Record<string, unknown>;
  };
  /**
   * 所属图层组的 id，null / undefined 表示在最外层。
   *
   * 树结构用「扁平数组 + parentId」表示，而不是嵌套 children 数组：
   * 历史记录存的是 order（id 列表）+ meta（按 id 索引的属性），
   * parentId 属于非像素属性，会自动随 meta 走，历史层一行都不用改。
   * 换成嵌套数组则 order 的语义、rebuildLayers 以及全项目的
   * layers.find 都要跟着重写。
   */
  parentId?: string | null;
  /** 组在面板里是否折叠。只对 type === 'group' 有意义 */
  collapsed?: boolean;
  /**
   * 剪贴到下方图层：本层只在下方那层的不透明区域内显示。
   *
   * 与 PS 一样存成布尔而不是「剪贴到哪个 id」——PS 的剪贴组就是
   * 「连续若干个被剪贴的层 + 它们下面第一个没被剪贴的层（基底）」，
   * 剪贴关系由栈里的相邻顺序决定。存 id 就得在每次排序、删层、
   * 撤销时校正引用，存布尔则顺序一变关系自动跟着变，与 PS 完全一致。
   *
   * 只在同一父级内生效：同级里最底下那层没有基底，标了也不起作用。
   */
  clipped?: boolean;
  /**
   * 颜色标记，取值见 LAYER_COLORS，undefined 表示无。
   * 纯粹是面板上的视觉分类，不参与渲染与合成。
   */
  color?: string;
}

/**
 * 图层颜色标记清单，与 PS 中文版右键菜单的「图层颜色」一致。
 * value 为 undefined 表示清除标记。
 */
export const LAYER_COLORS: { value: string | undefined; label: string }[] = [
  { value: undefined, label: 'layerColor.none' },
  { value: '#ed1c24', label: 'layerColor.red' },
  { value: '#f7941d', label: 'layerColor.orange' },
  { value: '#ffd400', label: 'layerColor.yellow' },
  { value: '#00a651', label: 'layerColor.green' },
  { value: '#00aeef', label: 'layerColor.blue' },
  { value: '#92278f', label: 'layerColor.purple' },
  { value: '#808080', label: 'layerColor.gray' },
];

/** 文档 */
export interface Doc {
  id: string;
  name: string;
  width: number;
  height: number;
  resolution: number;
}

/**
 * 参考线（Guide）。从标尺拖出的辅助线，用于对齐。
 * 与 PS 一致：水平线的 position 是 y 坐标，垂直线的 position 是 x 坐标，单位都是文档像素。
 */
export interface Guide {
  id: string;
  /** 'h' = 水平线（横向），'v' = 垂直线（竖向） */
  orientation: 'h' | 'v';
  /** 参考线位置：h 时是 y 坐标，v 时是 x 坐标（文档坐标系，未缩放） */
  position: number;
}

/** 选区。mask 为白=选中的灰度蒙版，bounds 为其外接矩形 */
export interface Selection {
  mask: HTMLCanvasElement;
  bounds: Rect;
}

/** 历史记录条目 */
/**
 * 图层除像素以外的全部属性。
 * mask 也是画布，同样属于"像素"，要走增量，所以一并排除。
 * hasMask 单独记住蒙版存在与否——增量只管像素内容，管不了"蒙版被删掉了"这件事。
 */
export type LayerMeta = Omit<Layer, 'canvas' | 'mask'> & { hasMask: boolean };

/** 像素增量作用在图层的哪张画布上 */
export type DeltaTarget = 'canvas' | 'mask';

/**
 * 一个图层在某一步里的像素变化。
 * region：同尺寸下只变了一块，存这一块的前后像素。
 * full：图层/蒙版新增或删除，或画布尺寸变了导致无法按区域比对，存整幅。
 *       before 为 null 表示这步之前不存在，after 为 null 表示之后不存在。
 */
export type LayerDelta =
  | {
      kind: 'region';
      layerId: string;
      target: DeltaTarget;
      rect: Rect;
      before: ImageData;
      after: ImageData;
    }
  | {
      kind: 'full';
      layerId: string;
      target: DeltaTarget;
      before: ImageData | null;
      after: ImageData | null;
    };

export interface HistoryEntry {
  id: string;
  /**
   * 词条 key（如 'action.crop'），不是成品文字。
   *
   * 存 key 而不是当时语言下的文字，切换语言后旧记录才会跟着变。
   * 存死文字的话历史面板会中英混排，切回来也修不回去。
   */
  label: string;
  /**
   * label 里 {name} 这类占位符的取值，与 label 一起存才能重新翻译。
   * 放的是最终要显示的值（图层名这类用户数据），不再过翻译。
   */
  labelParams?: Record<string, string | number>;
  /**
   * 取值本身也是词条 key 的占位符（如「滤镜：高斯模糊」里的滤镜名）。
   * 与 labelParams 分开是因为这些要在渲染时再翻一次，
   * 否则切语言后外层变了、里层还留在旧语言，出现「Filter: 高斯模糊」。
   */
  labelParamKeys?: Record<string, string>;
  /**
   * 这一步「之后」的图层顺序与非像素属性。
   * 绝对存：这些数据只有几十字节，整存最省心；像素才用增量。
   */
  order: string[];
  meta: Record<string, LayerMeta>;
  /** 这一步造成的像素变化，undo 用 before、redo 用 after */
  deltas: LayerDelta[];
  activeLayerId: string | null;
  docWidth: number;
  docHeight: number;
}

export type {
  LayerEffects,
  EffectKind,
  DropShadowEffect,
  OuterGlowEffect,
  InnerGlowEffect,
  StrokeEffect,
} from './effects';
export {
  DEFAULT_DROP_SHADOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_STROKE,
  DEFAULT_EFFECTS,
} from './effects';
