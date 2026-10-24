/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolId } from '../types';
import type { ToolHandler } from './types';
import { brushTool, eraserTool, pencilTool } from './paintTools';
import { blurTool, burnTool, dodgeTool, sharpenTool, smudgeTool } from './effectTools';
import {
  lassoTool,
  marqueeEllipseTool,
  marqueeRectTool,
  polygonLassoTool,
  wandTool,
} from './selectionTools';
import { bucketTool, gradientTool } from './fillTools';
import { shapeTool } from './shapeTool';
import { textTool } from './textTool';
import { moveTool } from './moveTool';
import { cloneTool } from './cloneTool';
import { cropTool, eyedropperTool, handTool, zoomTool } from './viewTools';
import { transformTool } from './transformTool';

/** 工具 id -> 处理器。画布只依赖这张表，新增工具无需改画布代码 */
export const TOOL_REGISTRY: Record<ToolId, ToolHandler> = {
  move: moveTool,
  transform: transformTool,
  'marquee-rect': marqueeRectTool,
  'marquee-ellipse': marqueeEllipseTool,
  lasso: lassoTool,
  'polygon-lasso': polygonLassoTool,
  wand: wandTool,
  crop: cropTool,
  brush: brushTool,
  pencil: pencilTool,
  eraser: eraserTool,
  clone: cloneTool,
  blur: blurTool,
  sharpen: sharpenTool,
  smudge: smudgeTool,
  dodge: dodgeTool,
  burn: burnTool,
  bucket: bucketTool,
  gradient: gradientTool,
  text: textTool,
  shape: shapeTool,
  eyedropper: eyedropperTool,
  zoom: zoomTool,
  hand: handTool,
};

export function getTool(id: ToolId): ToolHandler {
  return TOOL_REGISTRY[id];
}
