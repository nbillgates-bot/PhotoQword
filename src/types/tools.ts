/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ShapeKind } from './index';

/** Canvas 混合模式类型 */
export type CanvasBlendMode = GlobalCompositeOperation;

/** 画笔类形状 */
export type BrushShape = 'round' | 'square' | 'soft';

/** 渐变类型 */
export type GradientKind = 'linear' | 'radial' | 'angle' | 'reflected' | 'diamond';

/** 选区运算方式 */
export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect';

/**
 * 魔棒/吸管的取样大小，取值与 PS 完全一致：
 * 取样点 | 3x3 | 5x5 | 11x11 | 31x31 | 51x51 | 101x101（数字是方形边长）。
 */
export const WAND_SAMPLE_SIZES = [1, 3, 5, 11, 31, 51, 101] as const;
export type WandSampleSize = (typeof WAND_SAMPLE_SIZES)[number];

/**
 * 文字对齐的三档与它们的词条 key。
 *
 * 选项栏（TextOptions）和属性面板（TextProperties）都要这一份，
 * 两处各写一遍必然有一天翻得不一样，所以抽到这里（规约 §1.1）。
 * 图标留在各自组件里 —— types/ 不许出现 React 组件。
 */
export const TEXT_ALIGNS = [
  { value: 'left', labelKey: 'text.alignLeft' },
  { value: 'center', labelKey: 'text.alignCenter' },
  { value: 'right', labelKey: 'text.alignRight' },
] as const;

/**
 * 所有工具的参数集中管理。
 * 每个工具只读取自己关心的字段，避免 props 层层透传。
 */
export interface ToolOptions {
  // 通用画笔参数
  brushSize: number;
  brushHardness: number;
  brushOpacity: number;
  brushShape: BrushShape;

  // 橡皮
  eraserSize: number;
  eraserHardness: number;
  eraserOpacity: number;

  // 选区
  selectionMode: SelectionMode;
  featherRadius: number;
  wandTolerance: number;
  /** 魔棒取样大小（方形边长）：1 = 取样点，3 = 3x3 平均，以此类推 */
  wandSampleSize: WandSampleSize;
  wandContiguous: boolean;
  /** 魔棒：对所有图层取样（否则只取样当前图层） */
  wandSampleAllLayers: boolean;
  /** 矩形/椭圆选框样式：正常 | 固定长宽比 | 固定大小 */
  marqueeStyle: 'normal' | 'fixed-ratio' | 'fixed-size';
  /** 固定长宽比的宽度值（比例） */
  marqueeRatioW: number;
  /** 固定长宽比的高度值（比例） */
  marqueeRatioH: number;
  /** 固定大小的宽度（像素） */
  marqueeSizeW: number;
  /** 固定大小的高度（像素） */
  marqueeSizeH: number;
  /**
   * 消除锯齿。PS 里这是所有选区工具共用的一个开关，不是椭圆专属：
   * 椭圆、套索、多边形套索、魔棒都读它，只有矩形选框因为边界必然落在
   * 整像素上而把它置灰。
   */
  selectionAntiAlias: boolean;

  // 油漆桶
  bucketTolerance: number;
  bucketContiguous: boolean;

  // 渐变
  gradientKind: GradientKind;
  gradientReverse: boolean;
  gradientOpacity: number;
  gradientMode: CanvasBlendMode;

  // 修饰类工具强度
  effectSize: number;
  effectStrength: number;

  // 形状
  shapeKind: ShapeKind;
  shapeFilled: boolean;
  shapeStrokeWidth: number;
  shapeRadius: number;
  shapePoints: number;

  // 文字
  textFontFamily: string;
  textFontSize: number;
  /** 数值字重 100-900，与 PS 字体样式下拉对齐 */
  textFontWeight: number;
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  textAlign: 'left' | 'center' | 'right';
}
