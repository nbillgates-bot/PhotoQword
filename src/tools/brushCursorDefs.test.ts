/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { brushTipFor, hasBrushRing, ringForTool } from './brushCursorDefs';
import { useEditorStore } from '../store';
import type { ToolId } from '../types';

const options = () => useEditorStore.getState().toolOptions;

/** PS 里显示笔刷环的那八个工具 */
const RING_TOOLS: ToolId[] = [
  'brush',
  'pencil',
  'eraser',
  'blur',
  'sharpen',
  'smudge',
  'dodge',
  'burn',
];

/** 这些工具在 PS 里没有笔刷环 */
const NO_RING_TOOLS: ToolId[] = [
  'move',
  'transform',
  'marquee-rect',
  'lasso',
  'wand',
  'crop',
  'bucket',
  'gradient',
  'text',
  'shape',
  'eyedropper',
  'zoom',
  'hand',
];

describe('brushCursorDefs', () => {
  it('八个笔刷类工具都有环', () => {
    RING_TOOLS.forEach((tool) => {
      expect(hasBrushRing(tool), tool).toBe(true);
    });
  });

  it('非笔刷类工具没有环', () => {
    NO_RING_TOOLS.forEach((tool) => {
      expect(hasBrushRing(tool), tool).toBe(false);
      expect(brushTipFor(tool, options()), tool).toBeNull();
    });
  });

  it('画笔和铅笔取 brushSize', () => {
    const store = useEditorStore.getState();
    store.setToolOption('brushSize', 33);
    expect(brushTipFor('brush', options())?.size).toBe(33);
    expect(brushTipFor('pencil', options())?.size).toBe(33);
  });

  it('橡皮取 eraserSize，与画笔各自独立', () => {
    const store = useEditorStore.getState();
    store.setToolOption('brushSize', 10);
    store.setToolOption('eraserSize', 40);
    expect(brushTipFor('brush', options())?.size).toBe(10);
    expect(brushTipFor('eraser', options())?.size).toBe(40);
  });

  it('五个修饰工具取 effectSize', () => {
    useEditorStore.getState().setToolOption('effectSize', 25);
    (['blur', 'sharpen', 'smudge', 'dodge', 'burn'] as ToolId[]).forEach((tool) => {
      expect(brushTipFor(tool, options())?.size, tool).toBe(25);
    });
  });

  it('画笔的形状跟随 brushShape', () => {
    const store = useEditorStore.getState();
    store.setToolOption('brushShape', 'square');
    expect(brushTipFor('brush', options())?.shape).toBe('square');
    store.setToolOption('brushShape', 'soft');
    expect(brushTipFor('brush', options())?.shape).toBe('soft');
  });

  it('铅笔恒为圆，不受 brushShape 影响', () => {
    // 铅笔画的是硬边圆点，环跟着变方会与实际笔迹不符
    useEditorStore.getState().setToolOption('brushShape', 'square');
    expect(brushTipFor('pencil', options())?.shape).toBe('round');
    expect(brushTipFor('eraser', options())?.shape).toBe('round');
    expect(brushTipFor('blur', options())?.shape).toBe('round');
  });
});

describe('ringForTool', () => {
  it('笔刷类工具在正常尺寸下给出环', () => {
    useEditorStore.getState().setToolOption('brushSize', 30);
    expect(ringForTool('brush', options(), 1)?.radius).toBe(15);
  });

  it('非笔刷类工具永远没有环', () => {
    NO_RING_TOOLS.forEach((tool) => {
      expect(ringForTool(tool, options(), 1), tool).toBeNull();
    });
  });

  it('尺寸太小或缩放太低时没有环', () => {
    useEditorStore.getState().setToolOption('brushSize', 2);
    expect(ringForTool('brush', options(), 0.5)).toBeNull();
  });

  it('半径永远不是 NaN', () => {
    const store = useEditorStore.getState();
    [0, 1, 2, 4, 10, 40, 500].forEach((size) => {
      store.setToolOption('brushSize', size);
      [0.1, 0.25, 1, 8, 16].forEach((zoom) => {
        const ring = ringForTool('brush', options(), zoom);
        if (ring) expect(Number.isNaN(ring.radius)).toBe(false);
      });
    });
  });
});
