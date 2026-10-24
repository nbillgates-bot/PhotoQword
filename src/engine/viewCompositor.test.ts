/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { compositeInView } from './viewCompositor';
import { makeViewportContext, prepareViewportCanvas } from './viewportRender';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask } from './mask';
import { DEFAULT_DROP_SHADOW, DEFAULT_OUTER_GLOW } from '../types/effects';
import type { BlendMode, Layer } from '../types';

const DOC = 100;

/** 视口与文档同尺寸、zoom=1、dpr=1:此时视口坐标就等于文档坐标,便于断言 */
function unitView() {
  return makeViewportContext({
    viewportWidth: DOC,
    viewportHeight: DOC,
    docWidth: DOC,
    docHeight: DOC,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
  });
}

/**
 * 一张纯色图层。canvas 尺寸始终由 bounds 推出——真实文档里两者恒等,
 * helper 里让它们脱钩会写出"画布没盖到断言点"的假失败。
 */
function solid(id: string, color: string, over: Partial<Layer> = {}): Layer {
  const bounds = over.bounds ?? { x: 0, y: 0, width: DOC, height: DOC };
  const canvas = createCanvas(bounds.width, bounds.height);
  fillCanvas(canvas, color);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas,
    ...over,
    bounds,
  } as Layer;
}

function render(layers: Layer[], view = unitView()) {
  const canvas = document.createElement('canvas');
  const context = prepareViewportCanvas(canvas, view);
  compositeInView(context, layers, view);
  return canvas;
}

/** 读视口像素 */
function at(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return Array.from(ctx2d(canvas).getImageData(x, y, 1, 1).data);
}

describe('基本合成', () => {
  it('单个图层原样画出来', () => {
    const canvas = render([solid('a', '#ff0000')]);
    expect(at(canvas, 50, 50)).toEqual([255, 0, 0, 255]);
  });

  it('上层盖住下层', () => {
    const canvas = render([solid('a', '#ff0000'), solid('b', '#00ff00')]);
    expect(at(canvas, 50, 50)).toEqual([0, 255, 0, 255]);
  });

  it('按 bounds 定位,不铺满文档', () => {
    const layer = solid('a', '#ff0000', { bounds: { x: 60, y: 60, width: 20, height: 20 } });
    const canvas = render([layer]);
    expect(at(canvas, 65, 65)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 10, 10)[3]).toBe(0);
  });

  it('不透明度生效', () => {
    const canvas = render([solid('a', '#ff0000', { opacity: 50 })]);
    const pixel = at(canvas, 50, 50);
    expect(pixel[3]).toBeGreaterThan(100);
    expect(pixel[3]).toBeLessThan(150);
  });

  it('隐藏的图层不画', () => {
    const canvas = render([solid('a', '#ff0000', { visible: false })]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('合成结果不含 NaN', () => {
    // Uint8ClampedArray 会把 NaN 变成 0,画面只是黑一块,不报错,最难查
    const canvas = render([solid('a', '#ff0000'), solid('b', '#0000ff', { opacity: 40 })]);
    const data = ctx2d(canvas).getImageData(0, 0, DOC, DOC).data;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });
});

describe('缩放', () => {
  it('放大后一个文档像素占多个视口像素', () => {
    const view = makeViewportContext({
      viewportWidth: DOC,
      viewportHeight: DOC,
      docWidth: DOC,
      docHeight: DOC,
      zoom: 2,
      panX: 0,
      panY: 0,
      dpr: 1,
    });
    // 文档 20×20 的红块放在原点;zoom=2 时占视口 40×40,
    // 而 origin 是 (100-200)/2 = -50,所以块落在视口 -50~-10:看不见
    const layer = solid('a', '#ff0000', { bounds: { x: 0, y: 0, width: 20, height: 20 } });
    const canvas = render([layer], view);
    expect(canvas.width).toBe(DOC);
    // 文档中心 (50,50) 映射到视口 (50*2-50) = 50
    const center = solid('b', '#00ff00', { bounds: { x: 45, y: 45, width: 10, height: 10 } });
    const canvas2 = render([center], view);
    expect(at(canvas2, 50, 50)).toEqual([0, 255, 0, 255]);
  });

  it('画布尺寸只跟视口有关,长文档不会撑大画布', () => {
    const view = makeViewportContext({
      viewportWidth: 200,
      viewportHeight: 150,
      docWidth: 790,
      docHeight: 16041,
      zoom: 1,
      panX: 0,
      panY: 0,
      dpr: 1,
    });
    const canvas = render(
      [solid('a', '#ff0000', { bounds: { x: 0, y: 0, width: 50, height: 50 } })],
      view,
    );
    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(150);
  });
});

describe('蒙版', () => {
  it('黑色蒙版把图层完全遮住', () => {
    const mask = createMask(DOC, DOC, false);
    const canvas = render([solid('a', '#ff0000', { mask })]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('白色蒙版不遮挡', () => {
    const mask = createMask(DOC, DOC, true);
    const canvas = render([solid('a', '#ff0000', { mask })]);
    expect(at(canvas, 50, 50)).toEqual([255, 0, 0, 255]);
  });

  it('maskEnabled 为 false 时蒙版不生效', () => {
    const mask = createMask(DOC, DOC, false);
    const canvas = render([solid('a', '#ff0000', { mask, maskEnabled: false })]);
    expect(at(canvas, 50, 50)).toEqual([255, 0, 0, 255]);
  });

  it('半边黑半边白的蒙版只遮一半', () => {
    const mask = createMask(DOC, DOC, true);
    const context = ctx2d(mask);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, DOC / 2, DOC);
    const canvas = render([solid('a', '#ff0000', { mask })]);
    expect(at(canvas, 25, 50)[3]).toBe(0);
    expect(at(canvas, 75, 50)[3]).toBe(255);
  });
});

describe('混合模式', () => {
  it('原生混合模式走 GPU 路径', () => {
    // multiply:红 × 蓝 = 黑
    const canvas = render([solid('a', '#ff0000'), solid('b', '#0000ff', { blendMode: 'multiply' })]);
    const pixel = at(canvas, 50, 50);
    expect(pixel[0]).toBeLessThan(10);
    expect(pixel[2]).toBeLessThan(10);
  });

  it('手写混合模式也能画出来', () => {
    const canvas = render([
      solid('a', '#808080'),
      solid('b', '#404040', { blendMode: 'vivid-light' }),
    ]);
    // 只断言画到了、且没有 NaN:具体数值属于混合公式的实现细节
    expect(at(canvas, 50, 50)[3]).toBeGreaterThan(0);
  });

  it('手写混合只处理图层自己的范围,框外不动', () => {
    const small = solid('b', '#404040', {
      blendMode: 'vivid-light',
      bounds: { x: 0, y: 0, width: 20, height: 20 },
    });
    const canvas = render([solid('a', '#ff0000'), small]);
    // 框外应当保持底层的红色
    expect(at(canvas, 80, 80)).toEqual([255, 0, 0, 255]);
  });
});

describe('组', () => {
  function group(id: string, over: Partial<Layer> = {}): Layer {
    const canvas = createCanvas(1, 1);
    return {
      id,
      name: id,
      type: 'group',
      visible: true,
      opacity: 100,
      blendMode: 'pass-through' as BlendMode,
      canvas,
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      ...over,
    } as Layer;
  }

  it('穿透组的子图层直接画出来', () => {
    const canvas = render([group('g'), solid('a', '#ff0000', { parentId: 'g' })]);
    expect(at(canvas, 50, 50)).toEqual([255, 0, 0, 255]);
  });

  it('组的不透明度作用在整组上', () => {
    const canvas = render([
      group('g', { opacity: 50 }),
      solid('a', '#ff0000', { parentId: 'g' }),
    ]);
    const pixel = at(canvas, 50, 50);
    expect(pixel[3]).toBeGreaterThan(100);
    expect(pixel[3]).toBeLessThan(150);
  });

  it('组蒙版遮住整组', () => {
    const canvas = render([
      group('g', { mask: createMask(DOC, DOC, false), opacity: 100 }),
      solid('a', '#ff0000', { parentId: 'g' }),
    ]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('组隐藏时子图层也不画,即使子图层自己 visible 为 true', () => {
    const canvas = render([
      group('g', { visible: false }),
      solid('a', '#ff0000', { parentId: 'g' }),
    ]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  /*
   * 组的缓冲按子节点的并集开(组自己的 canvas 是 1×1 占位符),
   * 于是子节点要按「缓冲即视口」重算坐标。这个换算错了内容会整体偏移,
   * 下面几条钉的就是偏移量为 0。
   */
  it('隔离组里的偏移子图层落点不变', () => {
    const child = solid('a', '#ff0000', {
      parentId: 'g',
      bounds: { x: 60, y: 20, width: 20, height: 30 },
    });
    const canvas = render([group('g', { opacity: 100, blendMode: 'normal' as BlendMode }), child]);
    expect(at(canvas, 61, 21)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 79, 49)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 59, 21)[3]).toBe(0);
    expect(at(canvas, 61, 19)[3]).toBe(0);
    expect(at(canvas, 81, 51)[3]).toBe(0);
  });

  it('隔离组里的多个子图层各自落在自己的位置', () => {
    const canvas = render([
      group('g', { blendMode: 'normal' as BlendMode }),
      solid('a', '#ff0000', { parentId: 'g', bounds: { x: 10, y: 10, width: 20, height: 20 } }),
      solid('b', '#00ff00', { parentId: 'g', bounds: { x: 70, y: 70, width: 20, height: 20 } }),
    ]);
    expect(at(canvas, 20, 20)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 80, 80)).toEqual([0, 255, 0, 255]);
    // 两块之间是空的,说明缓冲没把内容拉扯到一起
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('嵌套的隔离组落点也不变', () => {
    const canvas = render([
      group('outer', { blendMode: 'normal' as BlendMode }),
      group('inner', { parentId: 'outer', opacity: 100, blendMode: 'normal' as BlendMode }),
      solid('a', '#0000ff', {
        parentId: 'inner',
        bounds: { x: 40, y: 55, width: 15, height: 15 },
      }),
    ]);
    expect(at(canvas, 41, 56)).toEqual([0, 0, 255, 255]);
    expect(at(canvas, 54, 69)).toEqual([0, 0, 255, 255]);
    expect(at(canvas, 38, 56)[3]).toBe(0);
    expect(at(canvas, 41, 53)[3]).toBe(0);
  });

  it('组蒙版按文档坐标对齐,不随缓冲偏移', () => {
    // 蒙版左半白右半黑
    const mask = createMask(DOC, DOC, false);
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = '#ffffff';
    maskCtx.fillRect(0, 0, DOC / 2, DOC);
    const canvas = render([
      group('g', { mask }),
      solid('a', '#ff0000', { parentId: 'g', bounds: { x: 30, y: 40, width: 40, height: 20 } }),
    ]);
    expect(at(canvas, 40, 50)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 60, 50)[3]).toBe(0);
  });
});

describe('剪贴组', () => {
  it('成员只在基底的不透明区域内显示', () => {
    // 基底只占左半边
    const base = solid('base', '#ff0000', { bounds: { x: 0, y: 0, width: 50, height: DOC } });
    const member = solid('m', '#00ff00', { clipped: true });
    const canvas = render([base, member]);
    // 左半:成员盖在基底上
    expect(at(canvas, 25, 50)).toEqual([0, 255, 0, 255]);
    // 右半:基底没有像素,成员被剪掉
    expect(at(canvas, 75, 50)[3]).toBe(0);
  });

  it('基底隐藏时整组都不显示', () => {
    const base = solid('base', '#ff0000', { visible: false });
    const member = solid('m', '#00ff00', { clipped: true });
    const canvas = render([base, member]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('最终 alpha 等于基底的 alpha,不是两者相乘', () => {
    // 成员半透明时,PS 的结果仍是基底的 alpha(见 clipping.ts 的说明)
    const base = solid('base', '#ff0000');
    const member = solid('m', '#00ff00', { clipped: true, opacity: 50 });
    const canvas = render([base, member]);
    expect(at(canvas, 50, 50)[3]).toBe(255);
  });

  /*
   * 整组的缓冲只开到基底的可见范围:成员超出基底的部分反正会被 clipToAlpha
   * 抹掉。两张缓冲必须同 box,否则 clipToAlpha 会因尺寸不等而错位。
   */
  it('基底偏在一角时整组落点不变', () => {
    const base = solid('base', '#ff0000', { bounds: { x: 60, y: 60, width: 30, height: 30 } });
    const member = solid('m', '#00ff00', { clipped: true });
    const canvas = render([base, member]);
    // 基底范围内显示成员的绿
    expect(at(canvas, 61, 61)).toEqual([0, 255, 0, 255]);
    expect(at(canvas, 89, 89)).toEqual([0, 255, 0, 255]);
    // 基底范围外一律空
    expect(at(canvas, 58, 61)[3]).toBe(0);
    expect(at(canvas, 61, 58)[3]).toBe(0);
    expect(at(canvas, 91, 91)[3]).toBe(0);
  });

  it('成员比基底小时只在自己那块盖住基底,其余露出基底', () => {
    const base = solid('base', '#ff0000', { bounds: { x: 20, y: 20, width: 60, height: 60 } });
    const member = solid('m', '#00ff00', {
      clipped: true,
      bounds: { x: 40, y: 40, width: 20, height: 20 },
    });
    const canvas = render([base, member]);
    expect(at(canvas, 50, 50)).toEqual([0, 255, 0, 255]);
    // 基底有、成员没有的地方是基底的红
    expect(at(canvas, 25, 25)).toEqual([255, 0, 0, 255]);
    expect(at(canvas, 75, 75)).toEqual([255, 0, 0, 255]);
  });

  it('成员超出基底的部分被剪掉,不会画到基底范围外', () => {
    const base = solid('base', '#ff0000', { bounds: { x: 40, y: 40, width: 20, height: 20 } });
    const member = solid('m', '#00ff00', {
      clipped: true,
      bounds: { x: 0, y: 0, width: DOC, height: DOC },
    });
    const canvas = render([base, member]);
    expect(at(canvas, 50, 50)).toEqual([0, 255, 0, 255]);
    expect(at(canvas, 10, 10)[3]).toBe(0);
    expect(at(canvas, 90, 90)[3]).toBe(0);
  });

  it('基底是组时同样按内容范围开,落点不变', () => {
    const canvas = render([
      {
        id: 'g',
        name: 'g',
        type: 'group',
        visible: true,
        opacity: 100,
        blendMode: 'normal' as BlendMode,
        canvas: createCanvas(1, 1),
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      } as Layer,
      solid('inner', '#ff0000', {
        parentId: 'g',
        bounds: { x: 30, y: 30, width: 40, height: 40 },
      }),
      solid('m', '#00ff00', { clipped: true }),
    ]);
    expect(at(canvas, 50, 50)).toEqual([0, 255, 0, 255]);
    expect(at(canvas, 20, 20)[3]).toBe(0);
    expect(at(canvas, 80, 80)[3]).toBe(0);
  });
});

/*
 * 效果画在 bounds 之外,所以局部缓冲必须按 effectReach 往外留边。
 * 留少了投影和外发光会被缓冲边界切一刀,而且只在缩小视图下才看得出来
 * ——正是最容易漏过测试的那类回归。
 */
describe('效果不被局部缓冲切掉', () => {
  it('投影画到 bounds 之外', () => {
    // angle=0 → 阴影往 +x 偏 12px;size=0 不模糊,边界清晰好断言
    const layer = solid('a', '#ff0000', {
      bounds: { x: 30, y: 40, width: 20, height: 20 },
      effects: {
        dropShadow: {
          ...DEFAULT_DROP_SHADOW,
          enabled: true,
          angle: 0,
          distance: 12,
          size: 0,
          spread: 0,
          opacity: 100,
          blendMode: 'normal' as BlendMode,
        },
      },
    });
    const canvas = render([layer]);
    // 图层本体
    expect(at(canvas, 40, 50)).toEqual([255, 0, 0, 255]);
    // 阴影落在 bounds 右侧之外(x 50~62),这里必须有像素
    expect(at(canvas, 56, 50)[3]).toBeGreaterThan(0);
    // 再往外就没有了,说明留边是按 reach 算的、没有无脑开整幅视口
    expect(at(canvas, 70, 50)[3]).toBe(0);
  });

  it('外发光画到 bounds 四周之外', () => {
    const layer = solid('a', '#ff0000', {
      bounds: { x: 40, y: 40, width: 20, height: 20 },
      effects: {
        outerGlow: {
          ...DEFAULT_OUTER_GLOW,
          enabled: true,
          size: 8,
          spread: 100,
          opacity: 100,
          blendMode: 'normal' as BlendMode,
        },
      },
    });
    const canvas = render([layer]);
    expect(at(canvas, 50, 50)).toEqual([255, 0, 0, 255]);
    // 左右上下都要有发光溢出
    expect(at(canvas, 36, 50)[3]).toBeGreaterThan(0);
    expect(at(canvas, 63, 50)[3]).toBeGreaterThan(0);
    expect(at(canvas, 50, 36)[3]).toBeGreaterThan(0);
    expect(at(canvas, 50, 63)[3]).toBeGreaterThan(0);
  });
});

describe('调整图层', () => {
  it('提亮下方的合成结果', () => {
    const layers: Layer[] = [
      solid('a', '#808080'),
      {
        ...solid('adj', '#000000'),
        type: 'adjustment',
        adjustmentData: { kind: 'brightness-contrast', params: { brightness: 50 } },
      } as Layer,
    ];
    const canvas = render(layers);
    expect(at(canvas, 50, 50)[0]).toBeGreaterThan(128);
  });

  it('只影响它下方的图层', () => {
    const layers: Layer[] = [
      solid('a', '#808080'),
      {
        ...solid('adj', '#000000'),
        type: 'adjustment',
        adjustmentData: { kind: 'brightness-contrast', params: { brightness: -100 } },
      } as Layer,
      solid('top', '#808080', { bounds: { x: 60, y: 0, width: 40, height: DOC } }),
    ];
    const canvas = render(layers);
    // 右侧被上层盖住,保持原亮度
    expect(at(canvas, 80, 50)[0]).toBe(128);
    // 左侧被调暗
    expect(at(canvas, 20, 50)[0]).toBeLessThan(128);
  });

  it('调整之后不产生 NaN', () => {
    const layers: Layer[] = [
      solid('a', '#808080'),
      {
        ...solid('adj', '#000000'),
        type: 'adjustment',
        adjustmentData: {
          kind: 'brightness-contrast',
          params: { brightness: 80, contrast: 60, saturation: 50 },
        },
      } as Layer,
    ];
    const canvas = render(layers);
    const data = ctx2d(canvas).getImageData(0, 0, DOC, DOC).data;
    for (let i = 0; i < data.length; i += 1) {
      expect(Number.isNaN(data[i])).toBe(false);
    }
  });
});

describe('边界情形', () => {
  it('空图层列表画出空画布', () => {
    const canvas = render([]);
    expect(at(canvas, 50, 50)[3]).toBe(0);
  });

  it('1×1 的图层也能画', () => {
    const layer = solid('a', '#ff0000', { bounds: { x: 10, y: 10, width: 1, height: 1 } });
    const canvas = render([layer]);
    expect(at(canvas, 10, 10)[3]).toBeGreaterThan(0);
  });

  it('图层完全在文档外时不抛错', () => {
    const layer = solid('a', '#ff0000', { bounds: { x: 500, y: 500, width: 20, height: 20 } });
    expect(() => render([layer])).not.toThrow();
  });
});
