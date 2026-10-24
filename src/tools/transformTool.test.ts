/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { transformTool } from './transformTool';
import { click, context, drag, hasNaN, newDoc, pointer, reset, store } from './testKit';
import { ctx2d } from '../engine/canvasUtils';

/** 在活动图层铺满红色，便于观察变换结果 */
function fillRed() {
  const layer = store().activeLayer()!;
  const c = ctx2d(layer.canvas);
  c.fillStyle = '#ff0000';
  c.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
  store().bumpRevision();
}

function isRed(x: number, y: number): boolean {
  const layer = store().activeLayer()!;
  const data = ctx2d(layer.canvas).getImageData(x, y, 1, 1).data;
  return data[0] > 200 && data[3] > 200;
}

beforeEach(() => {
  reset(transformTool);
});

describe('开启会话', () => {
  it('没有会话时按下即开启', () => {
    newDoc(32, 32);
    click(transformTool, pointer(16, 16));

    expect(store().transformSession).not.toBeNull();
    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it('第一次按下只开会话，不算拖拽', () => {
    newDoc(32, 32);
    fillRed();
    drag(transformTool, pointer(0, 0), pointer(16, 16));

    // 开启那一下不应当顺带把图层拖走
    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(isRed(30, 30)).toBe(true);
  });
});

describe('拖控制点', () => {
  it('拖右下角缩小图层', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(32, 32), pointer(16, 16));

    const rect = store().transformSession!.state.rect;
    expect(rect.width).toBe(16);
    expect(rect.height).toBe(16);
    expect(isRed(2, 2)).toBe(true);
    expect(isRed(24, 24)).toBe(false);
  });

  it('拖框内平移图层', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(16, 16), pointer(24, 24));

    const rect = store().transformSession!.state.rect;
    expect(rect.x).toBe(8);
    expect(rect.y).toBe(8);
    expect(rect.width).toBe(32);
    expect(isRed(2, 2)).toBe(false);
  });

  it('拖左上角只改左上，右下守恒', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(0, 0), pointer(8, 8));

    const rect = store().transformSession!.state.rect;
    expect(rect.x).toBe(8);
    expect(rect.y).toBe(8);
    expect(rect.x + rect.width).toBe(32);
    expect(rect.y + rect.height).toBe(32);
  });

  it('拖右边中点只改宽度', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(32, 16), pointer(24, 24));

    const rect = store().transformSession!.state.rect;
    expect(rect.width).toBe(24);
    expect(rect.height).toBe(32);
  });

  it('按住 Shift 等比缩放', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    transformTool.onPointerDown?.(pointer(32, 32), ctx);
    transformTool.onPointerMove?.(pointer(24, 30, { shiftKey: true }), ctx);
    transformTool.onPointerUp?.(pointer(24, 30, { shiftKey: true }), ctx);

    const rect = store().transformSession!.state.rect;
    // 正方形起点，等比后宽高应当相等
    expect(rect.width).toBeCloseTo(rect.height);
  });

  it('按住 Alt 从中心缩放', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    transformTool.onPointerDown?.(pointer(32, 32), ctx);
    transformTool.onPointerMove?.(pointer(28, 28, { altKey: true }), ctx);
    transformTool.onPointerUp?.(pointer(28, 28, { altKey: true }), ctx);

    const rect = store().transformSession!.state.rect;
    expect(rect.x + rect.width / 2).toBeCloseTo(16);
    expect(rect.y + rect.height / 2).toBeCloseTo(16);
  });

  it('点在框外不进入拖拽', () => {
    newDoc(32, 32);
    store().beginTransform();
    // 框是整幅画布，(200,200) 在外面
    drag(transformTool, pointer(200, 200), pointer(210, 210));

    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it('抬手后再移动不会继续改矩形', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    drag(transformTool, pointer(32, 32), pointer(16, 16));
    const after = store().transformSession!.state.rect;

    transformTool.onPointerMove?.(pointer(4, 4), ctx);
    expect(store().transformSession!.state.rect).toEqual(after);
  });
});

describe('旋转', () => {
  it('拖框外的旋转区改角度', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    // 右侧框外 12px 处属于旋转带，绕中心 (16,16) 从右侧拖到下方
    drag(transformTool, pointer(44, 16), pointer(16, 44));

    expect(store().transformSession!.state.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('旋转不改矩形', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(44, 16), pointer(16, 44));

    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it('按住 Shift 旋转吸附到 15° 的整数倍', () => {
    newDoc(32, 32);
    store().beginTransform();
    // 拖到约 47°，应吸到 45°
    drag(
      transformTool,
      pointer(44, 16, { shiftKey: true }),
      pointer(45, 46, { shiftKey: true }),
    );

    const { angle } = store().transformSession!.state;
    expect((angle / (Math.PI / 12)) % 1).toBeCloseTo(0, 6);
    expect(angle).toBeCloseTo(Math.PI / 4, 6);
  });

  it('旋转后的像素里没有 NaN', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(44, 16), pointer(30, 40));

    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });

  it('双击旋转区不确认变换', () => {
    newDoc(32, 32);
    store().beginTransform();
    transformTool.onDoubleClick?.(pointer(44, 16), context());

    expect(store().transformSession).not.toBeNull();
  });
});

describe('斜切（Ctrl + 拖边中点）', () => {
  it('按住 Ctrl 拖顶边中点产生水平斜切', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(16, 0, { ctrlKey: true }), pointer(24, 0, { ctrlKey: true }));

    const { state } = store().transformSession!;
    expect(state.skewX).not.toBeCloseTo(0, 6);
    expect(state.skewY).toBeCloseTo(0, 9);
    expect(state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it('按住 Ctrl 拖右边中点产生垂直斜切', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(32, 16, { ctrlKey: true }), pointer(32, 24, { ctrlKey: true }));

    const { state } = store().transformSession!;
    expect(state.skewY).not.toBeCloseTo(0, 6);
    expect(state.skewX).toBeCloseTo(0, 9);
  });

  it('不按 Ctrl 拖同一个控制点是缩放而不是斜切', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(16, 0), pointer(16, 8));

    const { state } = store().transformSession!;
    expect(state.skewX).toBe(0);
    expect(state.rect.height).toBeCloseTo(24);
  });

  it('斜切后的像素里没有 NaN', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(16, 0, { ctrlKey: true }), pointer(40, 0, { ctrlKey: true }));

    expect(hasNaN(store().activeLayer()!.canvas)).toBe(false);
  });
});

describe('光标', () => {
  const cursorAt = (x: number, y: number) => {
    store().setCursorPos({ x, y });
    const { cursor } = transformTool;
    return typeof cursor === 'function' ? cursor(context()) : cursor;
  };

  it('没有会话时是默认光标', () => {
    newDoc(32, 32);
    expect(cursorAt(16, 16)).toBe('default');
  });

  it('框内是移动光标', () => {
    newDoc(32, 32);
    store().beginTransform();
    expect(cursorAt(16, 16)).toBe('move');
  });

  it('角上是对角缩放光标', () => {
    newDoc(32, 32);
    store().beginTransform();
    expect(cursorAt(0, 0)).toBe('nwse-resize');
  });

  it('框外旋转带用自绘的弯箭头，不是十字', () => {
    newDoc(32, 32);
    store().beginTransform();
    // 十字与画布上别的工具没区别，用户会以为指针没反应
    expect(cursorAt(44, 16)).toContain('data:image/svg+xml');
  });

  it('离得很远是默认光标', () => {
    newDoc(32, 32);
    store().beginTransform();
    expect(cursorAt(300, 300)).toBe('default');
  });

  it('框转 90° 后上边的光标跟着转成横向', () => {
    newDoc(32, 32);
    store().beginTransform();
    const flat = store().transformSession!.state;
    store().updateTransform({ ...flat, angle: Math.PI / 2 });
    // 原来的上边中点转到了左侧 (0,16)，那里该给横向箭头
    expect(cursorAt(0, 16)).toBe('ew-resize');
  });

  /*
   * 旋转光标按方向分 8 个。原来只有一个朝向，在左上角和正上方看到的
   * 是同一张图，用户分不出该往哪边转。32×32 的文档，框中心在 (16,16)，
   * 旋转带是框外 24px。
   */
  it('旋转带的不同方向给不同的光标', () => {
    newDoc(32, 32);
    store().beginTransform();
    const east = cursorAt(44, 16);
    const north = cursorAt(16, -20);
    const west = cursorAt(-20, 16);
    const south = cursorAt(16, 44);

    // 四个都得是自绘光标
    for (const value of [east, north, west, south]) {
      expect(value).toContain('data:image/svg+xml');
    }
    // 且互不相同——这才是这次要修的正主
    expect(new Set([east, north, west, south]).size).toBe(4);
  });

  it('四个角的旋转光标也各不相同', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ne = cursorAt(40, -8);
    const se = cursorAt(40, 40);
    const sw = cursorAt(-8, 40);
    const nw = cursorAt(-8, -8);
    expect(new Set([ne, se, sw, nw]).size).toBe(4);
  });

  it('对角方向的光标与正方向的不同，8 个区域全都能区分', () => {
    newDoc(32, 32);
    store().beginTransform();
    const all = [
      cursorAt(44, 16), cursorAt(40, 40), cursorAt(16, 44), cursorAt(-8, 40),
      cursorAt(-20, 16), cursorAt(-8, -8), cursorAt(16, -20), cursorAt(40, -8),
    ];
    expect(new Set(all).size).toBe(8);
  });

  it('旋转拖拽时光标方向锁在起笔处，框转过去也不变', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    // 从正上方的旋转带按下
    transformTool.onPointerDown?.(pointer(16, -20), ctx);
    const { cursor } = transformTool;
    const readCursor = () => (typeof cursor === 'function' ? cursor(ctx) : cursor);
    const atStart = readCursor();

    // 拖到右侧：如果光标跟着指针算，方向就会从北变成东
    transformTool.onPointerMove?.(pointer(44, 16), ctx);
    store().setCursorPos({ x: 44, y: 16 });
    expect(readCursor()).toBe(atStart);
  });

  it('旋转拖拽全程光标锁定成弯箭头，不随框转而闪', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    // 从框外旋转带按下
    transformTool.onPointerDown?.(pointer(44, 16), ctx);
    // 拖到框内位置：命中判定会变成 inside，但光标必须还是旋转
    store().setCursorPos({ x: 16, y: 16 });
    const { cursor } = transformTool;
    const during = typeof cursor === 'function' ? cursor(ctx) : cursor;
    expect(during).toContain('data:image/svg+xml');

    transformTool.onPointerUp?.(pointer(16, 16), ctx);
    // 抬手后恢复按位置判定
    expect(cursorAt(16, 16)).toBe('move');
  });

  it('拖拽中按下 Ctrl，光标转成斜切方向', () => {
    newDoc(32, 32);
    store().beginTransform();
    const ctx = context();
    transformTool.onPointerDown?.(pointer(16, 0), ctx); // 上边中点
    expect(cursorAt(16, 0)).toBe('ns-resize');

    transformTool.onPointerMove?.(pointer(18, 0, { ctrlKey: true }), ctx);
    expect(cursorAt(18, 0)).toBe('ew-resize');
  });
});

describe('确认与取消', () => {
  it('双击框内确认变换', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(32, 32), pointer(16, 16));
    transformTool.onDoubleClick?.(pointer(8, 8), context());

    expect(store().transformSession).toBeNull();
    expect(store().history.at(-1)?.label).toBe('action.freeTransform');
    expect(isRed(2, 2)).toBe(true);
    expect(isRed(24, 24)).toBe(false);
  });

  it('双击框外不确认', () => {
    newDoc(32, 32);
    store().beginTransform();
    drag(transformTool, pointer(32, 32), pointer(16, 16));
    transformTool.onDoubleClick?.(pointer(200, 200), context());

    expect(store().transformSession).not.toBeNull();
  });

  it('没有会话时双击是空操作', () => {
    newDoc(32, 32);
    expect(() => transformTool.onDoubleClick?.(pointer(8, 8), context())).not.toThrow();
    expect(store().transformSession).toBeNull();
  });

  it('切走工具视为放弃，像素还原', () => {
    newDoc(32, 32);
    fillRed();
    store().beginTransform();
    drag(transformTool, pointer(32, 32), pointer(8, 8));
    expect(isRed(24, 24)).toBe(false);

    transformTool.onDeactivate?.(context());
    expect(store().transformSession).toBeNull();
    expect(isRed(24, 24)).toBe(true);
  });

  it('切走时不留历史', () => {
    newDoc(32, 32);
    fillRed();
    const before = store().history.length;
    store().beginTransform();
    drag(transformTool, pointer(32, 32), pointer(8, 8));
    transformTool.onDeactivate?.(context());

    expect(store().history.length).toBe(before);
  });

  it('切走后拖拽状态被清掉，不会串到下一次', () => {
    newDoc(32, 32);
    const ctx = context();
    store().beginTransform();
    transformTool.onPointerDown?.(pointer(32, 32), ctx);
    transformTool.onDeactivate?.(ctx);

    // 重新开一次会话，之前悬空的 drag 不应当生效
    store().beginTransform();
    transformTool.onPointerMove?.(pointer(4, 4), ctx);
    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});
