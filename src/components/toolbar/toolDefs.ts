/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import {
  Blend,
  Brush,
  Circle,
  Crop,
  Droplet,
  Eraser,
  Hand,
  Lasso,
  Moon,
  MousePointer,
  PaintBucket,
  Pencil,
  Pentagon,
  Pipette,
  Search,
  Square,
  SquareDashed,
  Stamp,
  Sun,
  Type,
  Wand,
  Waves,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ToolId } from '../../types';

export interface ToolDef {
  id: ToolId;
  icon: LucideIcon;
  /** 词条 key（如 'tool.move'），由消费方调 t() 取当前语言的文字 */
  label: string;
  /** 单字母快捷键 */
  shortcut: string;
  /** 同组工具在同一个按钮里长按/右键切换 */
  group: string;
}

/** 工具组：数组内第一个为该组默认显示的工具 */
export const TOOL_GROUPS: ToolDef[][] = [
  [
    /*
     * 与 PS 一致：工具栏最左上是「移动工具」，图标是鼠标指针箭头。
     * PS 里自由变换没有工具栏图标，只能用 Ctrl+T 快捷键触发，所以不放在这里。
     */
    { id: 'move', icon: MousePointer, label: 'tool.move', shortcut: 'V', group: 'move' },
  ],
  [
    { id: 'marquee-rect', icon: SquareDashed, label: 'tool.marquee-rect', shortcut: 'M', group: 'marquee' },
    { id: 'marquee-ellipse', icon: Circle, label: 'tool.marquee-ellipse', shortcut: 'M', group: 'marquee' },
  ],
  [
    { id: 'lasso', icon: Lasso, label: 'tool.lasso', shortcut: 'L', group: 'lasso' },
    { id: 'polygon-lasso', icon: Pentagon, label: 'tool.polygon-lasso', shortcut: 'L', group: 'lasso' },
  ],
  [{ id: 'wand', icon: Wand, label: 'tool.wand', shortcut: 'W', group: 'wand' }],
  [{ id: 'crop', icon: Crop, label: 'tool.crop', shortcut: 'C', group: 'crop' }],
  [
    { id: 'brush', icon: Brush, label: 'tool.brush', shortcut: 'B', group: 'paint' },
    { id: 'pencil', icon: Pencil, label: 'tool.pencil', shortcut: 'N', group: 'paint' },
  ],
  [{ id: 'eraser', icon: Eraser, label: 'tool.eraser', shortcut: 'E', group: 'eraser' }],
  [{ id: 'clone', icon: Stamp, label: 'tool.clone', shortcut: 'S', group: 'clone' }],
  [
    { id: 'blur', icon: Droplet, label: 'tool.blur', shortcut: 'R', group: 'focus' },
    { id: 'sharpen', icon: Zap, label: 'tool.sharpen', shortcut: 'R', group: 'focus' },
    { id: 'smudge', icon: Waves, label: 'tool.smudge', shortcut: 'R', group: 'focus' },
  ],
  [
    { id: 'dodge', icon: Sun, label: 'tool.dodge', shortcut: 'O', group: 'tone' },
    { id: 'burn', icon: Moon, label: 'tool.burn', shortcut: 'O', group: 'tone' },
  ],
  [
    { id: 'bucket', icon: PaintBucket, label: 'tool.bucket', shortcut: 'G', group: 'fill' },
    { id: 'gradient', icon: Blend, label: 'tool.gradient', shortcut: 'G', group: 'fill' },
  ],
  [{ id: 'text', icon: Type, label: 'tool.text', shortcut: 'T', group: 'text' }],
  [{ id: 'shape', icon: Square, label: 'tool.shape', shortcut: 'U', group: 'shape' }],
  [{ id: 'eyedropper', icon: Pipette, label: 'tool.eyedropper', shortcut: 'I', group: 'pick' }],
  [
    { id: 'zoom', icon: Search, label: 'tool.zoom', shortcut: 'Z', group: 'view' },
    { id: 'hand', icon: Hand, label: 'tool.hand', shortcut: 'H', group: 'view' },
  ],
];

/** 扁平化后的全部工具，便于按 id / 快捷键查找 */
export const ALL_TOOLS: ToolDef[] = TOOL_GROUPS.flat();

export function findToolDef(id: ToolId): ToolDef {
  return ALL_TOOLS.find((tool) => tool.id === id) ?? ALL_TOOLS[0];
}

/**
 * 快捷键 -> 该键对应的工具列表（同键重复按下可循环切换）。
 *
 * 只收单字母快捷键：像自由变换那样写成 'Ctrl+T' 的组合键由 useShortcuts
 * 单独处理，混进来会注册出一个永远匹配不上的 "ctrl+t" 键。
 */
export const SHORTCUT_MAP = ALL_TOOLS.reduce<Record<string, ToolId[]>>((map, tool) => {
  const key = tool.shortcut.toLowerCase();
  if (key.length !== 1) return map;
  map[key] = [...(map[key] ?? []), tool.id];
  return map;
}, {});
