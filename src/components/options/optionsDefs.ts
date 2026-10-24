/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ComponentType } from 'react';
import type { ToolId } from '../../types';
import BrushOptions from './BrushOptions';
import EraserOptions from './EraserOptions';
import ShapeOptions from './ShapeOptions';
import TransformOptions from './TransformOptions';
import TextOptions from './TextOptions';
import GradientOptionsEnhanced from './GradientOptionsEnhanced';
import { BucketOptions } from './FillOptions';
import { CloneOptions, PencilOptions, ZoomOptions } from './optionsParts';
import { effectOptionsWith, hintOnly, selectionOptionsFor } from './optionsFactories';

/**
 * 工具 → 选项栏组件的映射表。
 *
 * 以前这里是一条二十多个分支的 switch，加工具时很容易漏掉一支——
 * 多边形套索就是这么丢的：工具能选中，选项栏却整条空白。
 * 改成 Record<ToolId, …> 之后，少写一个工具是**类型错误**，编译期就挡住了。
 * 对应开发规约 1.2「超过 3 个分支的渲染分派要抽成映射表」。
 */
export const TOOL_OPTIONS: Record<ToolId, ComponentType> = {
  move: hintOnly('options.move.hint'),
  transform: TransformOptions,

  'marquee-rect': selectionOptionsFor('marquee-rect'),
  'marquee-ellipse': selectionOptionsFor('marquee-ellipse'),
  lasso: selectionOptionsFor('lasso'),
  'polygon-lasso': selectionOptionsFor('polygon-lasso'),
  wand: selectionOptionsFor('wand'),

  crop: hintOnly('options.crop.hint'),

  brush: BrushOptions,
  pencil: PencilOptions,
  eraser: EraserOptions,
  clone: CloneOptions,

  blur: effectOptionsWith('options.blur.hint'),
  sharpen: effectOptionsWith('options.sharpen.hint'),
  smudge: effectOptionsWith('options.smudge.hint'),
  dodge: effectOptionsWith('options.dodge.hint'),
  burn: effectOptionsWith('options.burn.hint'),

  bucket: BucketOptions,
  gradient: GradientOptionsEnhanced,
  text: TextOptions,
  shape: ShapeOptions,

  eyedropper: hintOnly('options.eyedropper.hint'),
  zoom: ZoomOptions,
  hand: hintOnly('options.hand.hint'),
};
