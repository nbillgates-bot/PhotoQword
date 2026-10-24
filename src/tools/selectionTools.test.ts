/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  currentDraft,
  currentDraftRect,
  lassoTool,
  marqueeEllipseTool,
  marqueeRectTool,
  polygonLassoTool,
  wandTool,
} from './selectionTools';
import { CURSORS } from './cursors';
import { context, click, drag, newDoc, pointer, reset, store } from './testKit';
import { DEFAULT_TOOL_OPTIONS } from '../store/toolSlice';
import { ctx2d } from '../engine/canvasUtils';

const allTools = [marqueeRectTool, marqueeEllipseTool, lassoTool];

beforeEach(() => {
  reset(...allTools);
  store().setToolOption('selectionMode', 'new');
  store().setToolOption('featherRadius', 0);
});

/** 选区蒙版某点是否被选中（白=选中） */
function selected(x: number, y: number): boolean {
  const selection = store().selection;
  if (!selection) throw new Error('没有选区');
  return ctx2d(selection.mask).getImageData(x, y, 1, 1).data[0] > 127;
}

describe('矩形选框', () => {
  it('拖拽产生的选区外接矩形与拖拽范围一致', () => {
    newDoc();
    drag(marqueeRectTool, pointer(2, 3), pointer(10, 11));

    const bounds = store().selection!.bounds;
    expect(bounds.x).toBe(2);
    expect(bounds.y).toBe(3);
    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(8);
  });

  it('反向拖拽（右下往左上）得到同一个矩形', () => {
    newDoc();
    drag(marqueeRectTool, pointer(10, 11), pointer(2, 3));

    const bounds = store().selection!.bounds;
    expect(bounds.x).toBe(2);
    expect(bounds.y).toBe(3);
    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(8);
  });

  it('按住 shift 锁定为正方形，取长边', () => {
    newDoc();
    drag(marqueeRectTool, pointer(1, 1), pointer(11, 4, { shiftKey: true }));

    const bounds = store().selection!.bounds;
    expect(bounds.width).toBe(bounds.height);
    expect(bounds.width).toBe(10);
  });

  it('只是单击没有拖拽时取消选区，与 PS 一致', () => {
    newDoc();
    drag(marqueeRectTool, pointer(2, 2), pointer(9, 9));
    expect(store().selection).not.toBeNull();

    click(marqueeRectTool, pointer(5, 5));
    expect(store().selection).toBeNull();
  });

  it('拖拽中草稿可被覆盖层读到，抬手后清空', () => {
    newDoc();
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(2, 2), ctx);
    marqueeRectTool.onPointerMove?.(pointer(8, 6), ctx);

    expect(currentDraft()).not.toBeNull();
    expect(currentDraftRect(false, DEFAULT_TOOL_OPTIONS)).toMatchObject({ x: 2, y: 2, width: 6, height: 4 });

    marqueeRectTool.onPointerUp?.(pointer(8, 6), ctx);
    expect(currentDraft()).toBeNull();
  });

  it('工具切走时草稿被丢弃，且不产生选区', () => {
    newDoc();
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(2, 2), ctx);
    marqueeRectTool.onPointerMove?.(pointer(8, 8), ctx);
    marqueeRectTool.onDeactivate?.(ctx);

    expect(currentDraft()).toBeNull();
    expect(store().selection).toBeNull();
  });

  it('没有文档时不建选区也不报错', () => {
    expect(() => drag(marqueeRectTool, pointer(2, 2), pointer(8, 8))).not.toThrow();
    expect(store().selection).toBeNull();
  });
});

describe('椭圆选框', () => {
  it('中心在选区内，四角不在', () => {
    newDoc();
    drag(marqueeEllipseTool, pointer(2, 2), pointer(14, 14));

    expect(selected(8, 8)).toBe(true);
    expect(selected(2, 2)).toBe(false);
    expect(selected(13, 13)).toBe(false);
  });

  it('外接矩形与拖拽范围一致', () => {
    newDoc();
    drag(marqueeEllipseTool, pointer(2, 2), pointer(14, 10));

    const bounds = store().selection!.bounds;
    expect(bounds.width).toBeLessThanOrEqual(12);
    expect(bounds.height).toBeLessThanOrEqual(8);
    expect(bounds.width).toBeGreaterThan(8);
  });
});

describe('选区运算方式', () => {
  it('new 模式用新选区替换旧的', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(6, 6));
    drag(marqueeRectTool, pointer(8, 8), pointer(14, 14));

    expect(selected(3, 3)).toBe(false);
    expect(selected(11, 11)).toBe(true);
  });

  it('add 模式并集，两块区域都选中', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(6, 6));
    store().setToolOption('selectionMode', 'add');
    drag(marqueeRectTool, pointer(8, 8), pointer(14, 14));

    expect(selected(3, 3)).toBe(true);
    expect(selected(11, 11)).toBe(true);
  });

  it('subtract 模式减去重叠部分', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(12, 12));
    store().setToolOption('selectionMode', 'subtract');
    drag(marqueeRectTool, pointer(6, 6), pointer(12, 12));

    expect(selected(3, 3)).toBe(true);
    expect(selected(9, 9)).toBe(false);
  });

  it('intersect 模式只留交集', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(10, 10));
    store().setToolOption('selectionMode', 'intersect');
    drag(marqueeRectTool, pointer(6, 6), pointer(14, 14));

    expect(selected(3, 3)).toBe(false);
    expect(selected(8, 8)).toBe(true);
    expect(selected(12, 12)).toBe(false);
  });
});

describe('移动选区', () => {
  /** 模拟一次真实拖动：按下 → 多个小步 move → 抬起 */
  function dragBy(from: { x: number; y: number }, dx: number, dy: number, steps = 5) {
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(from.x, from.y), ctx);
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      marqueeRectTool.onPointerMove?.(pointer(from.x + dx * t, from.y + dy * t), ctx);
    }
    marqueeRectTool.onPointerUp?.(pointer(from.x + dx, from.y + dy), ctx);
  }

  it('连续拖动五次都生效，位置逐次累积（复现"第三下失效"）', () => {
    // 画布给大些，让选区始终在画布内，避免边界裁剪干扰本用例的结论
    newDoc(200, 200);
    drag(marqueeRectTool, pointer(20, 20), pointer(60, 60));
    expect(store().selection!.bounds).toMatchObject({ x: 20, y: 20, width: 40, height: 40 });

    // 第一下：从选区内 (30,30) 往右下拖 10px
    dragBy({ x: 30, y: 30 }, 10, 10);
    expect(store().selection!.bounds).toMatchObject({ x: 30, y: 30, width: 40, height: 40 });

    // 第二下
    dragBy({ x: 40, y: 40 }, 10, 10);
    expect(store().selection!.bounds).toMatchObject({ x: 40, y: 40, width: 40, height: 40 });

    // 第三下 —— 之前就是这里开始失效的
    dragBy({ x: 50, y: 50 }, 10, 10);
    expect(store().selection!.bounds).toMatchObject({ x: 50, y: 50, width: 40, height: 40 });

    // 第四下：只往右
    dragBy({ x: 60, y: 60 }, 15, 0);
    expect(store().selection!.bounds).toMatchObject({ x: 65, y: 50, width: 40, height: 40 });

    // 第五下：往左上回来
    dragBy({ x: 70, y: 60 }, -25, -20);
    expect(store().selection!.bounds).toMatchObject({ x: 40, y: 30, width: 40, height: 40 });
  });

  it('第一个 move 事件位移不足 1px 时也能进入移动（复现"第一下不行"）', () => {
    newDoc(200, 200);
    const ctx = context();
    drag(marqueeRectTool, pointer(40, 40), pointer(100, 100));
    const before = { ...store().selection!.bounds };

    // 真实鼠标的第一个 move 通常只挪了零点几像素
    marqueeRectTool.onPointerDown?.(pointer(60, 60), ctx);
    marqueeRectTool.onPointerMove?.(pointer(60.4, 60.2), ctx);
    marqueeRectTool.onPointerMove?.(pointer(61.1, 60.6), ctx);
    marqueeRectTool.onPointerMove?.(pointer(70, 68), ctx);
    marqueeRectTool.onPointerUp?.(pointer(70, 68), ctx);

    // 不能被一个小方框顶掉，必须是整块平移
    expect(store().selection!.bounds.width).toBe(before.width);
    expect(store().selection!.bounds.height).toBe(before.height);
    expect(store().selection!.bounds.x).toBe(before.x + 10);
    expect(store().selection!.bounds.y).toBe(before.y + 8);
  });

  it('选区内单击不拖动：取消选区，不留下小方框', () => {
    newDoc();
    drag(marqueeRectTool, pointer(2, 2), pointer(14, 14));
    expect(store().selection).not.toBeNull();

    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(8, 8), ctx);
    marqueeRectTool.onPointerMove?.(pointer(8.3, 8.1), ctx); // 抖动，未越阈值
    marqueeRectTool.onPointerUp?.(pointer(8.3, 8.1), ctx);

    expect(store().selection).toBeNull();
  });

  it('拖到画布外再拖回来，选区不丢且宽高复原', () => {
    newDoc(); // 16×16
    drag(marqueeRectTool, pointer(2, 2), pointer(10, 10));

    // 往右下猛拖，超出画布
    dragBy({ x: 5, y: 5 }, 40, 40);
    // 选区仍存在（被裁到画布边缘），没有变成 null
    expect(store().selection).not.toBeNull();
  });

  it('椭圆选区：按在外接矩形的角上（蒙版为空）是画新选区，不是移动', () => {
    newDoc();
    const ctx = context();
    marqueeEllipseTool.onPointerDown?.(pointer(2, 2), ctx);
    marqueeEllipseTool.onPointerMove?.(pointer(14, 14), ctx);
    marqueeEllipseTool.onPointerUp?.(pointer(14, 14), ctx);
    const before = { ...store().selection!.bounds };

    // (3,3) 在 bounds 内但在椭圆外，PS 在这里按下是画新选区
    marqueeEllipseTool.onPointerDown?.(pointer(3, 3), ctx);
    marqueeEllipseTool.onPointerMove?.(pointer(7, 7), ctx);
    marqueeEllipseTool.onPointerUp?.(pointer(7, 7), ctx);

    // 变成了新的小椭圆，而不是把原椭圆平移
    expect(store().selection!.bounds.width).toBeLessThan(before.width);
  });

  it('在选框工具下拖动选区内部，移动选区位置（蚂蚁线），像素不动', () => {
    newDoc(200, 200);
    const ctx = context();

    // 创建一个选区 (20,20) 到 (100,100)
    marqueeRectTool.onPointerDown?.(pointer(20, 20), ctx);
    marqueeRectTool.onPointerMove?.(pointer(100, 100), ctx);
    marqueeRectTool.onPointerUp?.(pointer(100, 100), ctx);

    const originalSelection = store().selection;
    expect(originalSelection).not.toBeNull();
    expect(originalSelection!.bounds).toMatchObject({ x: 20, y: 20, width: 80, height: 80 });

    // 在选区内部 (50,50) 按下，拖到 (70,70)，位移 (20,20)
    marqueeRectTool.onPointerDown?.(pointer(50, 50), ctx);
    marqueeRectTool.onPointerMove?.(pointer(55, 55), ctx);
    marqueeRectTool.onPointerMove?.(pointer(70, 70), ctx);
    marqueeRectTool.onPointerUp?.(pointer(70, 70), ctx);

    // 选区整块搬到 (40,40)，宽高不变
    const moved = store().selection;
    expect(moved).not.toBeNull();
    expect(moved!.bounds).toMatchObject({ x: 40, y: 40, width: 80, height: 80 });
  });

  it('在 add/subtract/intersect 模式下，即使点击在选区内也创建新选区而不是移动', () => {
    newDoc();

    // 创建第一个选区
    drag(marqueeRectTool, pointer(0, 0), pointer(10, 10));
    expect(store().selection!.bounds).toMatchObject({ x: 0, y: 0, width: 10, height: 10 });

    // 切换到 add 模式
    store().setToolOption('selectionMode', 'add');

    // 在选区内部 (5,5) 拖动，应该创建新选区并与原选区合并，而不是移动原选区
    drag(marqueeRectTool, pointer(5, 5), pointer(15, 15));

    const combined = store().selection;
    expect(combined).not.toBeNull();
    // 合并后的选区应该覆盖更大的范围
    expect(combined!.bounds.width).toBeGreaterThan(10);
  });

  it('Shift 修饰键临时切成 add 模式（PS 行为）', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(8, 8));
    // 工具栏还在 'new'，按 Shift 拖一个新区域
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(10, 10, { shiftKey: true }), ctx);
    marqueeRectTool.onPointerMove?.(pointer(14, 14, { shiftKey: true }), ctx);
    marqueeRectTool.onPointerUp?.(pointer(14, 14, { shiftKey: true }), ctx);

    // 应该并集，不是替换
    expect(selected(4, 4)).toBe(true);
    expect(selected(12, 12)).toBe(true);
  });

  it('Alt 修饰键临时切成 subtract 模式', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(12, 12));
    // 工具栏还在 'new'，按 Alt 减去中间一块
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(6, 6, { altKey: true }), ctx);
    marqueeRectTool.onPointerMove?.(pointer(12, 12, { altKey: true }), ctx);
    marqueeRectTool.onPointerUp?.(pointer(12, 12, { altKey: true }), ctx);

    expect(selected(3, 3)).toBe(true); // 左上角保留
    expect(selected(9, 9)).toBe(false); // 重叠部分被减掉
  });

  it('Shift+Alt 修饰键临时切成 intersect 模式', () => {
    newDoc();
    drag(marqueeRectTool, pointer(0, 0), pointer(10, 10));
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(6, 6, { shiftKey: true, altKey: true }), ctx);
    marqueeRectTool.onPointerMove?.(pointer(14, 14, { shiftKey: true, altKey: true }), ctx);
    marqueeRectTool.onPointerUp?.(pointer(14, 14, { shiftKey: true, altKey: true }), ctx);

    expect(selected(3, 3)).toBe(false); // 只有旧的
    expect(selected(8, 8)).toBe(true); // 交集
    expect(selected(12, 12)).toBe(false); // 只有新的
  });

  it('Shift 在无既有选区时只起正方形约束作用，不触发 add', () => {
    newDoc();
    // 没有既有选区，Shift 拖拽
    const ctx = context();
    marqueeRectTool.onPointerDown?.(pointer(2, 2, { shiftKey: true }), ctx);
    marqueeRectTool.onPointerMove?.(pointer(10, 6, { shiftKey: true }), ctx);
    marqueeRectTool.onPointerUp?.(pointer(10, 6, { shiftKey: true }), ctx);

    const bounds = store().selection!.bounds;
    // 应该是正方形（取长边 8）
    expect(bounds.width).toBe(8);
    expect(bounds.height).toBe(8);
  });
});

describe('套索', () => {
  it('三点以上闭合成多边形选区', () => {
    newDoc();
    const ctx = context();
    lassoTool.onPointerDown?.(pointer(2, 2), ctx);
    lassoTool.onPointerMove?.(pointer(12, 2), ctx);
    lassoTool.onPointerMove?.(pointer(12, 12), ctx);
    lassoTool.onPointerUp?.(pointer(12, 12), ctx);

    expect(store().selection).not.toBeNull();
    // 直角三角形：靠斜边内侧的点在选区里
    expect(selected(10, 5)).toBe(true);
  });

  it('不足三点时取消选区，避免退化成一条线', () => {
    newDoc();
    const ctx = context();
    lassoTool.onPointerDown?.(pointer(2, 2), ctx);
    lassoTool.onPointerMove?.(pointer(12, 2), ctx);
    lassoTool.onPointerUp?.(pointer(12, 2), ctx);

    expect(store().selection).toBeNull();
  });

  it('位移不足 2px 的移动被丢弃，避免顶点爆炸', () => {
    newDoc();
    const ctx = context();
    lassoTool.onPointerDown?.(pointer(2, 2), ctx);
    lassoTool.onPointerMove?.(pointer(2.5, 2), ctx);
    lassoTool.onPointerMove?.(pointer(3, 2), ctx);

    expect(currentDraft()!.points).toHaveLength(1);

    lassoTool.onPointerMove?.(pointer(8, 2), ctx);
    expect(currentDraft()!.points).toHaveLength(2);
    lassoTool.onDeactivate?.(ctx);
  });

  it('用套索形状的光标，不是通用十字线', () => {
    // 通用 crosshair 跟选框工具分不出来，也和工具栏图标对不上
    expect(lassoTool.cursor).toBe(CURSORS.lasso);
    expect(polygonLassoTool.cursor).toBe(CURSORS['polygon-lasso']);
  });
});

describe('魔棒', () => {
  it('在纯色底图上单击选中整片同色区域', () => {
    newDoc();
    click(wandTool, pointer(8, 8));

    const bounds = store().selection!.bounds;
    expect(bounds.width).toBe(16);
    expect(bounds.height).toBe(16);
  });

  it('透明区域也能选，PS 里同样允许选中透明像素', () => {
    newDoc();
    store().addLayer('raster', '空图层');
    click(wandTool, pointer(8, 8));

    // 整层都透明，于是整层都被选中
    expect(store().selection!.bounds).toMatchObject({ width: 16, height: 16 });
  });

  it('点在画布外时报错提示，不建选区', () => {
    newDoc();
    click(wandTool, pointer(99, 99));

    expect(store().selection).toBeNull();
    expect(store().toast?.kind).toBe('error');
    expect(store().toast?.message).toBe('error.selection.noPixels');
  });

  it('对所有图层取样时基于合成结果，取到的是底图颜色而不是透明', () => {
    newDoc();
    const canvas = store().layers[0].canvas;
    const context2d = canvas.getContext('2d')!;
    context2d.fillStyle = '#ff0000';
    context2d.fillRect(0, 0, 8, 16);
    store().addLayer('raster', '空图层');

    store().setToolOption('wandTolerance', 5);
    store().setToolOption('wandSampleAllLayers', true);
    click(wandTool, pointer(2, 8));

    // 合成后左半是红、右半是白，容差小的话只选到左半
    expect(store().selection!.bounds.width).toBeLessThan(16);
  });

  it('没有文档时不做任何事', () => {
    expect(() => click(wandTool, pointer(8, 8))).not.toThrow();
    expect(store().selection).toBeNull();
  });

  describe('图层被移出画布后', () => {
    /** 建一个左半红右半透明的图层，再整体右移 dx */
    function shiftedLayer(dx: number) {
      newDoc();
      store().addLayer('raster', '偏移层');
      const layer = store().activeLayer()!;
      const context2d = ctx2d(layer.canvas);
      context2d.fillStyle = '#ff0000';
      context2d.fillRect(0, 0, 8, 16);
      layer.bounds = { ...layer.bounds, x: layer.bounds.x + dx };
      store().bumpRevision();
    }

    it('取样按图层实际位置，落在红块挪走后的空白处选到的是透明区', () => {
      shiftedLayer(8);
      store().setToolOption('wandTolerance', 5);
      store().setToolOption('wandContiguous', true);
      // 红块本在 0-8，右移 8 后占 8-16；点 (2,8) 现在是透明
      click(wandTool, pointer(2, 8));

      const bounds = store().selection!.bounds;
      expect(bounds.x).toBe(0);
      expect(bounds.width).toBe(8);
    });

    it('点在偏移后的红块上选中的是右半边', () => {
      shiftedLayer(8);
      store().setToolOption('wandTolerance', 5);
      store().setToolOption('wandContiguous', true);
      click(wandTool, pointer(12, 8));

      const bounds = store().selection!.bounds;
      expect(bounds.x).toBe(8);
      expect(bounds.width).toBe(8);
    });

    it('选区蒙版尺寸始终是文档大小', () => {
      shiftedLayer(4);
      click(wandTool, pointer(12, 8));

      const { mask } = store().selection!;
      expect(mask.width).toBe(16);
      expect(mask.height).toBe(16);
    });
  });
});
