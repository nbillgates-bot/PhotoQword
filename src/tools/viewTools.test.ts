/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { cropTool, currentCropDraft, eyedropperTool, handTool, zoomTool } from './viewTools';
import { click, context, drag, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';
import type { ToolHandler } from './types';

beforeEach(() => {
  reset(handTool, cropTool);
  store().setCursorPos(null);
  // altPressed 不受 closeDoc 影响，必须显式清，否则会串进下一个用例
  store().setAltPressed(false);
});

/** 求工具此刻的光标。函数形式的光标依赖 store，所以要传上下文 */
function cursorOf(tool: ToolHandler): string {
  const { cursor } = tool;
  if (typeof cursor === 'function') return cursor(context());
  return cursor ?? 'default';
}

/** 把指针挪到文档坐标 (x,y) 再求光标 */
function cursorAt(x: number, y: number): string {
  store().setCursorPos({ x, y });
  return cursorOf(cropTool);
}

describe('吸管', () => {
  it('取合成结果的颜色写进前景色', () => {
    newDoc();
    const canvas = store().layers[0].canvas;
    const context2d = ctx2d(canvas);
    context2d.fillStyle = '#ff0000';
    context2d.fillRect(0, 0, 16, 16);

    click(eyedropperTool, pointer(8, 8));
    expect(store().foreground).toBe('#ff0000');
  });

  it('按住 alt 写进背景色', () => {
    newDoc();
    click(eyedropperTool, pointer(8, 8, { altKey: true }));
    expect(store().background).toBe('#ffffff');
  });

  it('取上层图层的颜色，因为取的是合成结果', () => {
    newDoc();
    const layer = store().addLayer('raster', '红层')!;
    const context2d = ctx2d(layer.canvas);
    context2d.fillStyle = '#00ff00';
    context2d.fillRect(0, 0, 16, 16);

    click(eyedropperTool, pointer(8, 8));
    expect(store().foreground).toBe('#00ff00');
  });

  it('点在画布外不改颜色', () => {
    newDoc();
    store().setForeground('#123456');
    click(eyedropperTool, pointer(99, 99));
    expect(store().foreground).toBe('#123456');
  });

  it('没有文档时不报错', () => {
    expect(() => click(eyedropperTool, pointer(8, 8))).not.toThrow();
  });
});

describe('抓手', () => {
  it('按视口坐标平移画布，避免与 pan 自激', () => {
    newDoc();
    store().setPan(0, 0);
    drag(handTool, pointer(10, 10), pointer(30, 25));

    expect(store().panX).toBe(20);
    expect(store().panY).toBe(15);
  });

  it('抬手后再移动不再改 pan', () => {
    newDoc();
    store().setPan(0, 0);
    drag(handTool, pointer(10, 10), pointer(30, 25));
    handTool.onPointerMove?.(pointer(80, 80), context());

    expect(store().panX).toBe(20);
  });

  it('从当前 pan 累加而不是归零重算', () => {
    newDoc();
    store().setPan(100, 100);
    drag(handTool, pointer(10, 10), pointer(20, 10));

    expect(store().panX).toBe(110);
    expect(store().panY).toBe(100);
  });
});

describe('缩放工具', () => {
  it('单击放大', () => {
    newDoc();
    const before = store().zoom;
    click(zoomTool, pointer(8, 8));
    expect(store().zoom).toBeGreaterThan(before);
  });

  it('alt 单击缩小', () => {
    newDoc();
    const before = store().zoom;
    click(zoomTool, pointer(8, 8, { altKey: true }));
    expect(store().zoom).toBeLessThan(before);
  });
});

describe('裁剪', () => {
  it('拖拽只建立裁剪框，不立即裁剪', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));

    // 与 PS 一致：框出来了，但文档尺寸没变，等确认
    expect(store().cropRect).toMatchObject({ x: 4, y: 4, width: 16, height: 12 });
    expect(store().doc!.width).toBe(32);
    expect(store().doc!.height).toBe(32);
  });

  it('双击框内确认裁剪', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));
    cropTool.onDoubleClick?.(pointer(12, 10), context());

    expect(store().doc!.width).toBe(16);
    expect(store().doc!.height).toBe(12);
    expect(store().cropRect).toBeNull();
  });

  it('双击框外不确认', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));
    cropTool.onDoubleClick?.(pointer(30, 30), context());

    expect(store().doc!.width).toBe(32);
    expect(store().cropRect).not.toBeNull();
  });

  it('commitCrop 裁到框的尺寸', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));
    store().commitCrop();

    expect(store().doc!.width).toBe(16);
    expect(store().doc!.height).toBe(12);
  });

  it('cancelCrop 丢掉框且不改文档', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));
    store().cancelCrop();

    expect(store().cropRect).toBeNull();
    expect(store().doc!.width).toBe(32);
  });

  it('拖控制点可以调整已有的框', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(20, 16));

    // 抓右下角往外拖，框应当变大（右下角在 20,16）
    drag(cropTool, pointer(20, 16), pointer(28, 24));
    const r = store().cropRect!;
    expect(r.x).toBe(4);
    expect(r.y).toBe(4);
    expect(r.width).toBe(24);
    expect(r.height).toBe(20);
  });

  it('拖框内平移整个框，尺寸不变', () => {
    newDoc(64, 64);
    // 拖一个 24×24 的框，中心点 (16,16) 离所有控制点都 >8px
    drag(cropTool, pointer(4, 4), pointer(28, 28));
    drag(cropTool, pointer(16, 16), pointer(24, 24));
    expect(store().cropRect).toMatchObject({ x: 12, y: 12, width: 24, height: 24 });
  });

  it('点框外重新拖一个新框', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(2, 2), pointer(10, 10));
    drag(cropTool, pointer(20, 20), pointer(30, 28));

    expect(store().cropRect).toMatchObject({ x: 20, y: 20, width: 10, height: 8 });
  });

  it('裁剪框被夹在文档范围内', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(-10, -10), pointer(50, 50));

    const rect = store().cropRect!;
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.x + rect.width).toBeLessThanOrEqual(32);
    expect(rect.y + rect.height).toBeLessThanOrEqual(32);
  });

  it('草稿在拖拽中可被覆盖层读到，抬手后清空', () => {
    newDoc(32, 32);
    const ctx = context();
    cropTool.onPointerDown?.(pointer(4, 4), ctx);
    cropTool.onPointerMove?.(pointer(20, 16), ctx);

    expect(currentCropDraft()).toMatchObject({ x: 4, y: 4, width: 16, height: 12 });

    cropTool.onPointerUp?.(pointer(20, 16), ctx);
    expect(currentCropDraft()).toBeNull();
  });

  it('反向拖拽得到同一个矩形', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(20, 16), pointer(4, 4));

    expect(store().cropRect).toMatchObject({ x: 4, y: 4, width: 16, height: 12 });
  });

  it('范围不足时不建框，避免误点把文档裁没', () => {
    newDoc(32, 32);
    drag(cropTool, pointer(4, 4), pointer(5, 5));

    expect(store().cropRect).toBeNull();
    expect(store().doc!.width).toBe(32);
    expect(store().doc!.height).toBe(32);
  });

  it('工具切走时草稿被丢弃，抬手不再建框', () => {
    newDoc(32, 32);
    const ctx = context();
    cropTool.onPointerDown?.(pointer(4, 4), ctx);
    cropTool.onPointerMove?.(pointer(20, 16), ctx);
    cropTool.onDeactivate?.(ctx);
    cropTool.onPointerUp?.(pointer(20, 16), ctx);

    expect(store().cropRect).toBeNull();
    expect(store().doc!.width).toBe(32);
  });

  it('工具切走时已确立的框也一并取消', () => {
    newDoc(32, 32);
    const ctx = context();
    drag(cropTool, pointer(4, 4), pointer(20, 16));
    cropTool.onDeactivate?.(ctx);

    expect(store().cropRect).toBeNull();
    expect(store().doc!.width).toBe(32);
  });
});

describe('光标', () => {
  /** 拖一个 (10,10)→(54,54) 的框：边长 44，中心离各边 22px，远大于 8px 命中半径 */
  const cropBox = () => {
    newDoc(64, 64);
    store().setZoom(1);
    drag(cropTool, pointer(10, 10), pointer(54, 54));
  };

  it('吸管用自绘的 SVG 光标，不是关键字', () => {
    // CSS 没有吸管关键字，只给 crosshair 用户分不清手里是哪个工具
    expect(cursorOf(eyedropperTool)).toContain('data:image/svg+xml');
  });

  it('抓手默认是张开的手', () => {
    expect(cursorOf(handTool)).toBe('grab');
  });

  it('抓手拖拽中变成握紧的手', () => {
    newDoc(64, 64);
    const ctx = context();
    handTool.onPointerDown?.(pointer(10, 10), ctx);
    handTool.onPointerMove?.(pointer(20, 20), ctx);
    expect(cursorOf(handTool)).toBe('grabbing');

    handTool.onPointerUp?.(pointer(20, 20), ctx);
    expect(cursorOf(handTool)).toBe('grab');
  });

  it('抓手切走工具后光标复位', () => {
    newDoc(64, 64);
    const ctx = context();
    handTool.onPointerDown?.(pointer(10, 10), ctx);
    handTool.onDeactivate?.(ctx);
    expect(cursorOf(handTool)).toBe('grab');
  });

  it('缩放默认是放大镜加号', () => {
    store().setAltPressed(false);
    expect(cursorOf(zoomTool)).toBe('zoom-in');
  });

  it('按住 Alt 时缩放光标变成减号，与实际执行的缩小一致', () => {
    store().setAltPressed(true);
    expect(cursorOf(zoomTool)).toBe('zoom-out');
    store().setAltPressed(false);
    expect(cursorOf(zoomTool)).toBe('zoom-in');
  });

  it('还没有裁剪框时是十字，方便拖第一个框', () => {
    newDoc(64, 64);
    store().setCursorPos({ x: 32, y: 32 });
    expect(cursorOf(cropTool)).toBe('crosshair');
  });

  it('指针位置未知时不报错，退回十字', () => {
    cropBox();
    store().setCursorPos(null);
    expect(cursorOf(cropTool)).toBe('crosshair');
  });

  it.each([
    ['左上角', 10, 10, 'nwse-resize'],
    ['右下角', 54, 54, 'nwse-resize'],
    ['右上角', 54, 10, 'nesw-resize'],
    ['左下角', 10, 54, 'nesw-resize'],
    ['上边中点', 32, 10, 'ns-resize'],
    ['下边中点', 32, 54, 'ns-resize'],
    ['左边中点', 10, 32, 'ew-resize'],
    ['右边中点', 54, 32, 'ew-resize'],
    ['框内', 32, 32, 'move'],
    ['框外', 60, 60, 'crosshair'],
  ])('悬停在%s时光标是 %s', (_name, x, y, expected) => {
    cropBox();
    expect(cursorAt(x as number, y as number)).toBe(expected);
  });

  it('光标与 hitTest 判定一致：显示成可拖动就真的拖得动', () => {
    cropBox();
    // 右下角显示斜向箭头，那么从这里拖就应该改尺寸而不是平移
    expect(cursorAt(54, 54)).toBe('nwse-resize');
    drag(cropTool, pointer(54, 54), pointer(60, 60));
    expect(store().cropRect).toMatchObject({ x: 10, y: 10, width: 50, height: 50 });
  });

  it('放大后命中半径跟着缩小，边缘附近不再误报可拖动', () => {
    cropBox();
    // zoom=1 时容忍 8 文档像素，(14,14) 算左上角
    expect(cursorAt(14, 14)).toBe('nwse-resize');
    // zoom=4 时容忍只剩 2 文档像素，同一点已经落进框内
    store().setZoom(4);
    expect(cursorAt(14, 14)).toBe('move');
  });
});
