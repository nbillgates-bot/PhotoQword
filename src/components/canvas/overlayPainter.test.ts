/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { paintOverlay } from './overlayPainter';
import { ctx2d } from '../../engine/canvasUtils';
import { useEditorStore } from '../../store';
import type { Guide, ToolId } from '../../types';
import { ringForTool } from '../../tools/brushCursorDefs';

const SIZE = 120;
const store = () => useEditorStore.getState();

function surface(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  return canvas;
}

/** 用默认参数画一次覆盖层，只覆盖笔刷环关心的那几项 */
function paint(
  canvas: HTMLCanvasElement,
  over: {
    tool?: ToolId;
    zoom?: number;
    cursorPos?: { x: number; y: number } | null;
    guides?: Guide[];
    showGuides?: boolean;
  } = {},
): void {
  paintOverlay({
    context: ctx2d(canvas),
    width: SIZE,
    height: SIZE,
    zoom: over.zoom ?? 1,
    tool: over.tool ?? 'brush',
    selection: null,
    toolOptions: store().toolOptions,
    foreground: '#000000',
    background: '#ffffff',
    shiftKey: false,
    docId: 'doc_test',
    cropRect: null,
    transformState: null,
    cursorPos: over.cursorPos === undefined ? { x: 60, y: 60 } : over.cursorPos,
    guides: over.guides ?? [],
    showGuides: over.showGuides ?? true,
  });
}

/** 非全透明像素的外接矩形，没有则返回 null */
function drawnBounds(canvas: HTMLCanvasElement) {
  const data = ctx2d(canvas).getImageData(0, 0, SIZE, SIZE).data;
  let minX = SIZE;
  let minY = SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (data[(y * SIZE + x) * 4 + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}

/** 该点是否被画到 */
function painted(canvas: HTMLCanvasElement, x: number, y: number): boolean {
  return ctx2d(canvas).getImageData(x, y, 1, 1).data[3] > 0;
}

beforeEach(() => {
  store().setToolOption('brushSize', 40);
  store().setToolOption('brushShape', 'round');
  store().setToolOption('eraserSize', 40);
  store().setToolOption('effectSize', 40);
});

describe('笔刷环', () => {
  it('画在指针位置，直径等于笔刷尺寸', () => {
    const canvas = surface();
    paint(canvas);
    const bounds = drawnBounds(canvas)!;

    expect(bounds).not.toBeNull();
    // 直径 40，环心在 (60,60)，所以覆盖 40~80；描边宽 1px，允许 2px 误差
    expect(bounds.minX).toBeGreaterThanOrEqual(38);
    expect(bounds.maxX).toBeLessThanOrEqual(82);
    expect(bounds.maxX - bounds.minX).toBeGreaterThanOrEqual(38);
    expect(bounds.maxX - bounds.minX).toBeLessThanOrEqual(42);
  });

  it('只描边不填充，环心是空的', () => {
    const canvas = surface();
    paint(canvas);
    // 填充会挡住画面，PS 也只画轮廓
    expect(painted(canvas, 60, 60)).toBe(false);
  });

  it('环随笔刷尺寸变大', () => {
    const small = surface();
    store().setToolOption('brushSize', 20);
    paint(small);
    const smallBounds = drawnBounds(small)!;

    const large = surface();
    store().setToolOption('brushSize', 60);
    paint(large);
    const largeBounds = drawnBounds(large)!;

    expect(largeBounds.maxX - largeBounds.minX).toBeGreaterThan(
      smallBounds.maxX - smallBounds.minX,
    );
  });

  it('指针移出画布后不画环', () => {
    const canvas = surface();
    paint(canvas, { cursorPos: null });
    expect(drawnBounds(canvas)).toBeNull();
  });

  it('非笔刷类工具不画环', () => {
    const canvas = surface();
    paint(canvas, { tool: 'move' });
    expect(drawnBounds(canvas)).toBeNull();
  });

  it('笔刷缩得太小时不画环，交给系统十字光标', () => {
    const canvas = surface();
    store().setToolOption('brushSize', 2);
    paint(canvas, { zoom: 0.5 });
    expect(drawnBounds(canvas)).toBeNull();
  });

  it('方形笔刷画方框：四角被画到', () => {
    const canvas = surface();
    store().setToolOption('brushShape', 'square');
    paint(canvas);
    // 方框的角在 (40,40)，圆环那里是空的
    expect(painted(canvas, 40, 40)).toBe(true);
  });

  it('圆形笔刷的四角是空的', () => {
    const canvas = surface();
    store().setToolOption('brushShape', 'round');
    paint(canvas);
    expect(painted(canvas, 40, 40)).toBe(false);
  });

  it('橡皮和修饰工具也画环', () => {
    (['eraser', 'blur', 'dodge'] as ToolId[]).forEach((tool) => {
      const canvas = surface();
      paint(canvas, { tool });
      expect(drawnBounds(canvas), tool).not.toBeNull();
    });
  });

  it('每次重画都先清空，环不会残留一路轨迹', () => {
    const canvas = surface();
    paint(canvas, { cursorPos: { x: 30, y: 30 } });
    paint(canvas, { cursorPos: { x: 90, y: 90 } });
    const bounds = drawnBounds(canvas)!;
    // 只剩后一个位置的环,左上角那个必须没了
    expect(bounds.minX).toBeGreaterThan(60);
  });

  it('画环不写 NaN 像素', () => {
    const canvas = surface();
    paint(canvas);
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < pixels.length; i++) {
      expect(Number.isNaN(pixels[i])).toBe(false);
    }
  });

  /*
   * 整个功能的安全底线：隐藏系统光标和画环由同一个 ringForTool 决定，
   * 一旦 CanvasArea 以为有环就隐藏了光标，而覆盖层没画环，指针会凭空消失。
   * 验证：ringForTool 返回非 null 时，画布必须真的被修改过。
   */
  it('ringForTool 说有环时必须真的画了像素', () => {
    const testCases: Array<{
      tool: ToolId;
      size: number;
      zoom: number;
      sizeKey: 'brushSize' | 'eraserSize' | 'effectSize';
    }> = [
      // 尺寸都控制在 120×120 测试画布装得下的范围内：
      // 环比画布还大时画不到任何像素是几何正确的，与本条要防的 bug 无关
      { tool: 'brush', size: 4, zoom: 1, sizeKey: 'brushSize' },
      { tool: 'brush', size: 5, zoom: 8, sizeKey: 'brushSize' },
      { tool: 'brush', size: 40, zoom: 1, sizeKey: 'brushSize' },
      { tool: 'brush', size: 100, zoom: 0.5, sizeKey: 'brushSize' },
      { tool: 'pencil', size: 40, zoom: 2, sizeKey: 'brushSize' },
      { tool: 'eraser', size: 80, zoom: 0.25, sizeKey: 'eraserSize' },
      { tool: 'dodge', size: 30, zoom: 1, sizeKey: 'effectSize' },
    ];

    testCases.forEach(({ tool, size, zoom, sizeKey }) => {
      const s = store();
      s.setToolOption(sizeKey, size);

      // 必须在设置后重新获取 toolOptions，不能用之前的引用
      const ring = ringForTool(tool, store().toolOptions, zoom);
      if (!ring) return;

      const canvas = surface();
      const ctx = canvas.getContext('2d')!;
      const before = ctx.getImageData(0, 0, canvas.width, canvas.height).data.slice();

      paint(canvas, { tool, zoom });

      const after = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const changed = after.some((v, i) => v !== before[i]);
      expect(changed, `tool=${tool} size=${size} zoom=${zoom} ring=${JSON.stringify(ring)}`).toBe(true);
    });
  });
});

describe('参考线绘制', () => {
  const guide = (id: string, orientation: 'h' | 'v', position: number): Guide => ({
    id,
    orientation,
    position,
  });

  /** 光标给 null，免得笔刷环干扰对参考线像素的判断 */
  const paintGuides = (canvas: HTMLCanvasElement, guides: Guide[], showGuides = true) =>
    paint(canvas, { tool: 'move', cursorPos: null, guides, showGuides });

  it('水平参考线画成一条横线', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'h', 40)]);
    expect(painted(canvas, 5, 40)).toBe(true);
    expect(painted(canvas, SIZE - 5, 40)).toBe(true);
    // 离线远的地方不该被画到
    expect(painted(canvas, 60, 10)).toBe(false);
  });

  it('垂直参考线画成一条竖线', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'v', 40)]);
    expect(painted(canvas, 40, 5)).toBe(true);
    expect(painted(canvas, 40, SIZE - 5)).toBe(true);
    expect(painted(canvas, 10, 60)).toBe(false);
  });

  it('横线铺满整个宽度，竖线铺满整个高度', () => {
    const h = surface();
    paintGuides(h, [guide('a', 'h', 40)]);
    const hBounds = drawnBounds(h);
    expect(hBounds?.minX).toBe(0);
    expect(hBounds?.maxX).toBe(SIZE - 1);

    const v = surface();
    paintGuides(v, [guide('a', 'v', 40)]);
    const vBounds = drawnBounds(v);
    expect(vBounds?.minY).toBe(0);
    expect(vBounds?.maxY).toBe(SIZE - 1);
  });

  it('showGuides 为 false 时一条都不画', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'h', 40), guide('b', 'v', 40)], false);
    expect(drawnBounds(canvas)).toBeNull();
  });

  it('空列表不画任何东西', () => {
    const canvas = surface();
    paintGuides(canvas, []);
    expect(drawnBounds(canvas)).toBeNull();
  });

  it('多条参考线各画各的', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'h', 30), guide('b', 'h', 80), guide('c', 'v', 50)]);
    expect(painted(canvas, 5, 30)).toBe(true);
    expect(painted(canvas, 5, 80)).toBe(true);
    expect(painted(canvas, 50, 5)).toBe(true);
  });

  it('贴边的参考线（position 0）也画得出来', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'h', 0)]);
    expect(drawnBounds(canvas)).not.toBeNull();
  });

  it('画参考线不写 NaN 像素', () => {
    const canvas = surface();
    paintGuides(canvas, [guide('a', 'h', 40), guide('b', 'v', 60)]);
    const pixels = ctx2d(canvas).getImageData(0, 0, SIZE, SIZE).data;
    let hasNaN = false;
    for (let i = 0; i < pixels.length; i += 1) {
      if (Number.isNaN(pixels[i])) hasNaN = true;
    }
    expect(hasNaN).toBe(false);
  });
});
