/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { initializeCanvas, type Layer as PsdLayer } from 'ag-psd';
import { createCanvas as nodeCanvas } from 'canvas';
import { countPsdLayers, flattenPsdLayers, type ConvertContext } from './psdLayers';
import { ctx2d } from './canvasUtils';
import { ReadCancelled } from './fileRead';
import { recordContextOptionsAsync } from './testUtils';

/** jsdom 里没有真 canvas，ag-psd 要靠 initializeCanvas 拿到 node-canvas 的实现 */
beforeAll(() => {
  initializeCanvas((width, height) => nodeCanvas(width, height) as unknown as HTMLCanvasElement);
});

/** 造一个有正常边界的 PSD 图层。没有 rawData，decodeLayerPixels 对它是空操作 */
function psdLayer(name: string, box = { left: 0, top: 0, right: 4, bottom: 4 }): PsdLayer {
  return { name, ...box };
}

/** 零尺寸的占位层，就是拼合 PSD 里那个该被跳过的条目 */
function placeholder(): PsdLayer {
  return { name: '', left: 0, top: 0, right: 0, bottom: 0 };
}

/** 默认的转换上下文：不让行、不取消 */
function context(patch: Partial<ConvertContext> = {}): ConvertContext {
  return { done: 0, total: 0, yieldNow: () => null, doc: { width: 64, height: 64 }, ...patch };
}

describe('countPsdLayers', () => {
  it('没有图层时是 0', () => {
    expect(countPsdLayers(undefined)).toBe(0);
    expect(countPsdLayers([])).toBe(0);
  });

  it('平铺的图层按个数算', () => {
    expect(countPsdLayers([psdLayer('a'), psdLayer('b'), psdLayer('c')])).toBe(3);
  });

  it('组自己也算一个，加上它的子层', () => {
    const group: PsdLayer = { name: '组', children: [psdLayer('子1'), psdLayer('子2')] };
    expect(countPsdLayers([group])).toBe(3);
  });

  it('嵌套多层能数全', () => {
    const inner: PsdLayer = { name: '内组', children: [psdLayer('叶')] };
    const outer: PsdLayer = { name: '外组', children: [inner, psdLayer('平级')] };
    // 外组 + 内组 + 叶 + 平级
    expect(countPsdLayers([outer])).toBe(4);
  });

  it('占位层不算进总数', () => {
    // 分母要和实际转出来的层数一致，否则进度条到不了 100%
    expect(countPsdLayers([psdLayer('真的'), placeholder()])).toBe(1);
  });

  it('数出来的和真正转出来的层数一致', async () => {
    const tree = [
      psdLayer('底'),
      placeholder(),
      { name: '组', children: [psdLayer('子'), placeholder()] } as PsdLayer,
    ];
    const total = countPsdLayers(tree);
    const layers = await flattenPsdLayers(tree, context({ total }));
    // 这两个数必须相等，否则进度条会停在 80% 或者冲过 100%
    expect(layers).toHaveLength(total);
  });
});

describe('flattenPsdLayers', () => {
  it('空树给空数组', async () => {
    expect(await flattenPsdLayers(undefined, context())).toEqual([]);
    expect(await flattenPsdLayers([], context())).toEqual([]);
  });

  it('顺序保持：PSD children[0] 在栈底，我们 layers[0] 也在栈底', async () => {
    // ag-psd 的 children[0] 是栈底，children[n-1] 是栈顶，我们直接照搬
    const layers = await flattenPsdLayers(
      [psdLayer('底'), psdLayer('中'), psdLayer('顶')],
      context(),
    );
    expect(layers.map((item) => item.name)).toEqual(['底', '中', '顶']);
  });

  it('占位层被跳过', async () => {
    const layers = await flattenPsdLayers([psdLayer('真的'), placeholder()], context());
    expect(layers.map((item) => item.name)).toEqual(['真的']);
  });

  it('图层画布在创建时就声明 willReadFrequently', async () => {
    /*
     * PSD 图层画布建好马上就 drawImage 填像素，上下文在那时就定型了。
     * 等历史差分来 getImageData 已经补不上声明（options 只有首次 getContext 生效），
     * 90 层的 PSD 就会刷出 90 条 readback 警告。
     */
    const { options } = await recordContextOptionsAsync(() =>
      flattenPsdLayers([psdLayer('一'), psdLayer('二')], context()),
    );
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((item) => item?.willReadFrequently === true)).toBe(true);
  });

  it('组转成 group 类型，子层用 parentId 指回去', async () => {
    const group: PsdLayer = { name: '组', children: [psdLayer('子')] };
    const layers = await flattenPsdLayers([group], context());
    const parent = layers.find((item) => item.name === '组');
    const child = layers.find((item) => item.name === '子');
    expect(parent?.type).toBe('group');
    expect(child?.type).toBe('raster');
    expect(child?.parentId).toBe(parent?.id);
  });

  it('组的画布是 1×1 占位', async () => {
    const group: PsdLayer = { name: '组', children: [psdLayer('子')] };
    const layers = await flattenPsdLayers([group], context());
    const parent = layers.find((item) => item.name === '组');
    // PSD 里组的边界恒为 0，我们收紧到 1×1，0 尺寸的画布拿不到上下文
    expect(parent?.canvas.width).toBe(1);
    expect(parent?.canvas.height).toBe(1);
  });

  it('bounds 的宽高等于画布宽高（合成的硬不变量）', async () => {
    const layers = await flattenPsdLayers(
      [psdLayer('偏移', { left: 5, top: 7, right: 9, bottom: 15 })],
      context(),
    );
    expect(layers[0].bounds).toEqual({ x: 5, y: 7, width: 4, height: 8 });
    expect(layers[0].canvas.width).toBe(4);
    expect(layers[0].canvas.height).toBe(8);
  });

  it('opacity 缺失时按全不透明，落在 0-100 刻度', async () => {
    // ag-psd 不给 opacity 就意味着 1（全不透明），我们的刻度上是 100
    const layers = await flattenPsdLayers([psdLayer('无 opacity')], context());
    expect(layers[0].opacity).toBe(100);
  });

  it('ag-psd 的 0-1 换算成我们的 0-100', async () => {
    const layer: PsdLayer = { ...psdLayer('半透明'), opacity: 0.5 };
    const layers = await flattenPsdLayers([layer], context());
    // 漏了这一步就是「PSD 打开后画布上看不到图」那个 bug
    expect(layers[0].opacity).toBe(50);
  });
});

/** 造一张纯色的 PSD 侧蒙版画布，尺寸就是蒙版矩形的尺寸 */
function maskCanvas(width: number, height: number, gray: number): HTMLCanvasElement {
  const canvas = nodeCanvas(width, height) as unknown as HTMLCanvasElement;
  const context = ctx2d(canvas);
  context.fillStyle = `rgb(${gray},${gray},${gray})`;
  context.fillRect(0, 0, width, height);
  return canvas;
}

/** 取一个像素的灰度与 alpha */
function pixelAt(canvas: HTMLCanvasElement, x: number, y: number): { gray: number; alpha: number } {
  const data = ctx2d(canvas).getImageData(x, y, 1, 1).data;
  return { gray: data[0], alpha: data[3] };
}

/** 带蒙版的 PSD 图层。mask 的 left/top 默认按文档坐标算 */
function withMask(
  layer: PsdLayer,
  mask: { left: number; top: number; width: number; height: number },
  extra: { defaultColor?: number; positionRelativeToLayer?: boolean } = {},
): PsdLayer {
  return {
    ...layer,
    mask: {
      left: mask.left,
      top: mask.top,
      right: mask.left + mask.width,
      bottom: mask.top + mask.height,
      canvas: maskCanvas(mask.width, mask.height, 255),
      ...extra,
    },
  };
}

describe('PSD 蒙版的对齐与尺寸', () => {
  const offsetLayer = () => psdLayer('偏移', { left: 5, top: 7, right: 9, bottom: 15 });

  it('蒙版画布按图层 bounds 建，不按文档尺寸', async () => {
    // 合成时蒙版画在 bounds，尺寸必须和 bounds 一致，否则 destination-in 会错位
    const tree = [withMask(offsetLayer(), { left: 5, top: 7, width: 4, height: 8 })];
    const layers = await flattenPsdLayers(tree, context());
    expect(layers[0].mask?.width).toBe(4);
    expect(layers[0].mask?.height).toBe(8);
    expect(layers[0].maskEnabled).toBe(true);
  });

  it('蒙版矩形按 bounds 换算成局部坐标，不画在文档原点', async () => {
    /*
     * 图层在文档 (5,7)，蒙版矩形在文档 (7,9)，所以蒙版画布里白块应该落在局部 (2,2)。
     * 以前一律画到 (0,0)，白块会跑到左上角——这就是带蒙版的 PSD 图层显示丢失的根因。
     */
    const tree = [withMask(offsetLayer(), { left: 7, top: 9, width: 2, height: 2 })];
    const layers = await flattenPsdLayers(tree, context());
    const mask = layers[0].mask;
    expect(mask).toBeDefined();
    expect(pixelAt(mask!, 2, 2).gray).toBe(255);
    expect(pixelAt(mask!, 0, 0).gray).toBe(0);
  });

  it('positionRelativeToLayer 为真时 left/top 相对图层', async () => {
    // 相对坐标 (2,2) 等于文档 (7,9)，结论应与上一例一致
    const tree = [
      withMask(offsetLayer(), { left: 2, top: 2, width: 2, height: 2 }, {
        positionRelativeToLayer: true,
      }),
    ];
    const layers = await flattenPsdLayers(tree, context());
    expect(pixelAt(layers[0].mask!, 2, 2).gray).toBe(255);
    expect(pixelAt(layers[0].mask!, 0, 0).gray).toBe(0);
  });

  it('矩形外按 defaultColor 填，缺省当隐藏', async () => {
    const tree = [withMask(psdLayer('大', { left: 0, top: 0, right: 10, bottom: 10 }), {
      left: 0,
      top: 0,
      width: 4,
      height: 4,
    })];
    const layers = await flattenPsdLayers(tree, context());
    expect(pixelAt(layers[0].mask!, 1, 1).gray).toBe(255);
    expect(pixelAt(layers[0].mask!, 8, 8).gray).toBe(0);
  });

  it('defaultColor=255 时矩形外是白且不透明', async () => {
    /*
     * 画布没画到的地方是透明，而 maskToAlpha 把透明当「隐藏」。
     * 不显式填 255 的话，defaultColor=255 的蒙版会被反过来，
     * 图层只剩蒙版矩形那一小块。所以 alpha 也要断言。
     */
    const tree = [withMask(
      psdLayer('大', { left: 0, top: 0, right: 10, bottom: 10 }),
      { left: 0, top: 0, width: 4, height: 4 },
      { defaultColor: 255 },
    )];
    const layers = await flattenPsdLayers(tree, context());
    expect(pixelAt(layers[0].mask!, 8, 8)).toEqual({ gray: 255, alpha: 255 });
  });

  it('组的蒙版按文档尺寸建，不会被截成 1×1', async () => {
    /*
     * 组的画布是 1×1 占位，照它建蒙版会把整张蒙版截成一个像素，
     * 那一格是黑的就整组消失。组的蒙版按文档尺寸、文档坐标建。
     */
    const group: PsdLayer = {
      ...withMask({ name: '组' }, { left: 0, top: 0, width: 8, height: 8 }),
      children: [psdLayer('子')],
    };
    const layers = await flattenPsdLayers([group], context());
    const parent = layers.find((item) => item.name === '组');
    expect(parent?.mask?.width).toBe(64);
    expect(parent?.mask?.height).toBe(64);
    expect(pixelAt(parent!.mask!, 1, 1).gray).toBe(255);
  });
});

describe('进度与取消', () => {
  it('每转一层报一次进度，分子逐个递增', async () => {
    const onLayer = vi.fn();
    const tree = [psdLayer('a'), psdLayer('b'), psdLayer('c')];
    await flattenPsdLayers(tree, context({ total: 3, onLayer }));
    expect(onLayer.mock.calls.map(([done]) => done)).toEqual([1, 2, 3]);
    // 分母每次都一样，进度条不能中途换刻度
    for (const [, total] of onLayer.mock.calls) expect(total).toBe(3);
  });

  it('组和子层都各报一次', async () => {
    const onLayer = vi.fn();
    const group: PsdLayer = { name: '组', children: [psdLayer('子')] };
    await flattenPsdLayers([group], context({ total: 2, onLayer }));
    expect(onLayer).toHaveBeenCalledTimes(2);
  });

  it('跳过的占位层不报进度', async () => {
    const onLayer = vi.fn();
    await flattenPsdLayers([psdLayer('真的'), placeholder()], context({ total: 1, onLayer }));
    expect(onLayer).toHaveBeenCalledTimes(1);
  });

  it('让行器返回 Promise 时会真的 await', async () => {
    let yields = 0;
    const yieldNow = () => {
      yields += 1;
      return Promise.resolve();
    };
    const layers = await flattenPsdLayers([psdLayer('a'), psdLayer('b')], context({ yieldNow }));
    // 每层问一次；结果不能因为让行而丢层
    expect(yields).toBe(2);
    expect(layers).toHaveLength(2);
  });

  it('一开始就取消，一层都不转', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      flattenPsdLayers([psdLayer('a')], context({ signal: controller.signal })),
    ).rejects.toThrow(ReadCancelled);
  });

  it('转到一半取消，抛出去而不是返回半份结果', async () => {
    const controller = new AbortController();
    // 第一层转完就取消：半份结果绝不能被当成正常结果返回
    const onLayer = () => controller.abort();
    await expect(
      flattenPsdLayers(
        [psdLayer('a'), psdLayer('b'), psdLayer('c')],
        context({ total: 3, onLayer, signal: controller.signal }),
      ),
    ).rejects.toThrow(ReadCancelled);
  });
});
