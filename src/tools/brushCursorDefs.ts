/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolId } from '../types';
import type { BrushShape, ToolOptions } from '../types/tools';
import { brushRingFor, type BrushRing } from '../engine/brushRing';

/**
 * 哪些工具显示笔刷环，以及各自的尺寸取自哪个参数。
 *
 * 写成数据而不是在绘制处堆 if：加一个笔刷类工具应该只改这张表。
 * 尺寸字段有三个（brushSize / eraserSize / effectSize），
 * 不统一是因为 PS 里画笔和橡皮的大小是各自独立记忆的，切来切去不该互相冲掉。
 */
interface BrushCursorDef {
  /** 尺寸取哪个参数 */
  sizeKey: 'brushSize' | 'eraserSize' | 'effectSize';
  /**
   * 形状。'follow' 表示跟随 brushShape 参数；
   * 其余工具的笔尖形状是固定的，不受画笔形状设置影响。
   */
  shape: BrushShape | 'follow';
}

const DEFS: Partial<Record<ToolId, BrushCursorDef>> = {
  // 画笔的形状可选，环要跟着变方变圆
  brush: { sizeKey: 'brushSize', shape: 'follow' },
  // 铅笔恒为硬边圆点，与 brushShape 无关
  pencil: { sizeKey: 'brushSize', shape: 'round' },
  eraser: { sizeKey: 'eraserSize', shape: 'round' },
  blur: { sizeKey: 'effectSize', shape: 'round' },
  sharpen: { sizeKey: 'effectSize', shape: 'round' },
  smudge: { sizeKey: 'effectSize', shape: 'round' },
  dodge: { sizeKey: 'effectSize', shape: 'round' },
  burn: { sizeKey: 'effectSize', shape: 'round' },
};

/** 该工具是否显示笔刷环 */
export function hasBrushRing(tool: ToolId): boolean {
  return tool in DEFS;
}

/** 取该工具当前的笔尖尺寸与形状，非笔刷类工具返回 null */
export function brushTipFor(
  tool: ToolId,
  options: ToolOptions,
): { size: number; shape: BrushShape } | null {
  const def = DEFS[tool];
  if (!def) return null;
  return {
    size: options[def.sizeKey],
    shape: def.shape === 'follow' ? options.brushShape : def.shape,
  };
}

/**
 * 该工具此刻要画的环，画不出来时返回 null。
 *
 * **绘制覆盖层和决定是否隐藏系统光标必须都走这个函数。**
 * 两处各自判一遍的话，一旦条件写歪就会出现"藏了光标又没画环"——
 * 指针凭空消失，用户完全不知道自己指在哪，比不加这个功能还糟。
 */
export function ringForTool(
  tool: ToolId,
  options: ToolOptions,
  zoom: number,
): BrushRing | null {
  const tip = brushTipFor(tool, options);
  if (!tip) return null;
  return brushRingFor(tip.size, zoom, tip.shape);
}
