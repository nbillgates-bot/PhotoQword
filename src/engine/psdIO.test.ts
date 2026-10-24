/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  initializeCanvas,
  readPsd,
  writePsd,
  readPsd as agReadPsd,
  writePsd as agWritePsd,
  type Psd as AgPsd,
} from 'ag-psd';
import { createCanvas as nodeCanvas } from 'canvas';
import { readPsdBuffer, writePsdFile } from './psdIO';
import { createCanvas, ctx2d } from './canvasUtils';
import type { Doc, Layer } from '../types';

/**
 * PSD 读写。
 * jsdom 里没有真 canvas，ag-psd 要靠 initializeCanvas 拿到 node-canvas 的实现，
 * 否则读像素时拿不到 2D 上下文。
 */

beforeAll(() => {
  initializeCanvas(
    (width, height) => nodeCanvas(width, height) as unknown as HTMLCanvasElement,
  );
});

function makeDoc(width = 8, height = 8): Doc {
  return { id: 'doc', name: '测试', width, height, resolution: 72 };
}

/** 顺序锚定用例要直接拿 ag-psd 造图层，这里给它一张纯色画布 */
function solidCanvas(color: string, size = 4): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, size, size);
  return canvas;
}

/** writePsdFile 给的是 Uint8Array 视图，agReadPsd 要 ArrayBuffer */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

/** 造一个纯色栅格图层 */
function makeLayer(options: {
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  id?: string;
}): Layer {
  const { name, x = 0, y = 0, width = 8, height = 8, color = '#ff0000', id = name } = options;
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
  return {
    id,
    name,
    type: 'raster',
    visible: true,
    bounds: { x, y, width, height },
    locked: false,
    // 我们的刻度是 0-100，100 才是全不透明
    opacity: 100,
    blendMode: 'normal',
    canvas,
  };
}

/** 写成 PSD 再用 ag-psd 读回来，验证往返 */
function roundTrip(doc: Doc, layers: Layer[]) {
  const buffer = writePsdFile(doc, layers);
  return readPsd(buffer, { useImageData: false });
}

/*
 * 读取测走 readPsdBuffer 而不是 readPsdFile：
 * jsdom 的 File 没有实现 arrayBuffer()，而那一层只是把文件读进内存再转手，
 * 分支都在 readPsdBuffer 里。
 *
 * readPsdBuffer 是 async 的——它在图层之间让出主线程，好让进度条能画出来。
 * 所以下面每处调用都要 await。
 */

describe('writePsdFile', () => {
  it('写出的是合法 PSD，尺寸对得上', () => {
    const psd = roundTrip(makeDoc(16, 12), [makeLayer({ name: '图层 1' })]);
    expect(psd.width).toBe(16);
    expect(psd.height).toBe(12);
  });

  it('图层名与可见性保留', () => {
    const layer = makeLayer({ name: '隐藏层' });
    layer.visible = false;
    const psd = roundTrip(makeDoc(), [layer]);
    expect(psd.children?.[0].name).toBe('隐藏层');
    expect(psd.children?.[0].hidden).toBe(true);
  });

  it('bounds 转成 PSD 的 left/top/right/bottom', () => {
    const layer = makeLayer({ name: '偏移层', x: 3, y: 5, width: 4, height: 2 });
    const psd = roundTrip(makeDoc(16, 16), [layer]);
    const child = psd.children?.[0];
    expect(child?.left).toBe(3);
    expect(child?.top).toBe(5);
    expect(child?.right).toBe(7);
    expect(child?.bottom).toBe(7);
  });

  it('我们的 0-100 要换算成 ag-psd 的 0-1', () => {
    const layer = makeLayer({ name: '半透明' });
    layer.opacity = 50;
    const psd = roundTrip(makeDoc(), [layer]);
    /*
     * 三套刻度：我们 0-100、ag-psd 0-1、PSD 文件内部 0-255。
     * 50 → 0.5 → 128/255 = 0.502，量化误差在这里，所以用近似断言。
     * 不用 toBe(0.5) 是因为误差是格式本身的，不是代码的。
     */
    expect(psd.children?.[0].opacity).toBeCloseTo(0.5, 2);
  });

  it('混合模式映射到 PSD 的写法', () => {
    const layer = makeLayer({ name: '正片叠底' });
    layer.blendMode = 'multiply';
    const psd = roundTrip(makeDoc(), [layer]);
    expect(psd.children?.[0].blendMode).toBe('multiply');
  });

  it('canvas 没有原生支持的混合模式也能写出去', () => {
    const layer = makeLayer({ name: '线性加深' });
    layer.blendMode = 'linear-burn';
    const psd = roundTrip(makeDoc(), [layer]);
    expect(psd.children?.[0].blendMode).toBe('linear burn');
  });

  it('分辨率写进 imageResources', () => {
    const doc = makeDoc();
    doc.resolution = 300;
    const psd = roundTrip(doc, [makeLayer({ name: '图层 1' })]);
    expect(psd.imageResources?.resolutionInfo?.horizontalResolution).toBe(300);
  });

  it('图层组写成嵌套 children', () => {
    const group: Layer = {
      ...makeLayer({ name: '组', id: 'g1', width: 1, height: 1 }),
      type: 'group',
    };
    const child = makeLayer({ name: '组内层', id: 'c1' });
    child.parentId = 'g1';
    const psd = roundTrip(makeDoc(), [group, child]);
    expect(psd.children?.[0].name).toBe('组');
    expect(psd.children?.[0].children?.[0].name).toBe('组内层');
  });

  it('蒙版一并写出', () => {
    const layer = makeLayer({ name: '带蒙版' });
    const mask = createCanvas(8, 8);
    const context = ctx2d(mask);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 8);
    layer.mask = mask;
    const psd = roundTrip(makeDoc(), [layer]);
    expect(psd.children?.[0].mask).toBeDefined();
  });
});

describe('readPsdBuffer', () => {
  /*
   * 这一组钉的是「PSD 打开后画布上看不到图」那个 bug。
   * ag-psd 给的 opacity 是 0-1，我们的 Layer.opacity 是 0-100，
   * 忘了乘 100 的话合成器按 globalAlpha = 1/100 画，整张图等于隐形。
   * 所以断言的是刻度，不只是「有值」。
   */
  it('不透明图层读进来是 100，不是 1', async () => {
    const buffer = writePsdFile(makeDoc(), [makeLayer({ name: '实心' })]);
    const { layers } = await readPsdBuffer(buffer, 'a.psd');
    expect(layers[0].opacity).toBeCloseTo(100, 0);
  });

  it('半透明图层读进来落在 0-100 刻度上', async () => {
    const layer = makeLayer({ name: '半透明' });
    layer.opacity = 40;
    const buffer = writePsdFile(makeDoc(), [layer]);
    const { layers } = await readPsdBuffer(buffer, 'a.psd');
    expect(layers[0].opacity).toBeGreaterThan(1);
    expect(layers[0].opacity).toBeCloseTo(40, 0);
  });

  it('读回文档尺寸与名称', async () => {
    const buffer = writePsdFile(makeDoc(20, 10), [makeLayer({ name: '图层 1' })]);
    const { doc } = await readPsdBuffer(buffer, '风景.psd');
    expect(doc.width).toBe(20);
    expect(doc.height).toBe(10);
    // 扩展名要去掉
    expect(doc.name).toBe('风景');
  });

  it('读回分辨率', async () => {
    const source = makeDoc();
    source.resolution = 300;
    const buffer = writePsdFile(source, [makeLayer({ name: '图层 1' })]);
    const { doc } = await readPsdBuffer(buffer, '测试.psd');
    expect(doc.resolution).toBe(300);
  });

  it('图层往返一圈属性不变', async () => {
    const layer = makeLayer({ name: '正片叠底层', x: 2, y: 3, width: 4, height: 5 });
    layer.blendMode = 'multiply';
    layer.opacity = 50;
    layer.visible = false;

    const buffer = writePsdFile(makeDoc(16, 16), [layer]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');

    expect(layers).toHaveLength(1);
    const back = layers[0];
    expect(back.name).toBe('正片叠底层');
    expect(back.blendMode).toBe('multiply');
    // 回到 0-100 刻度。50 → 0.5 → 50.2，量化误差来自 PSD 的 0-255
    expect(back.opacity).toBeCloseTo(50, 0);
    expect(back.visible).toBe(false);
    expect(back.bounds).toEqual({ x: 2, y: 3, width: 4, height: 5 });
  });

  it('bounds 的宽高等于画布宽高（合成的硬不变量）', async () => {
    const buffer = writePsdFile(makeDoc(16, 16), [
      makeLayer({ name: '偏移层', x: 5, y: 5, width: 3, height: 7 }),
    ]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    for (const layer of layers) {
      expect(layer.bounds.width).toBe(layer.canvas.width);
      expect(layer.bounds.height).toBe(layer.canvas.height);
    }
  });

  it('像素读回来没有 NaN', async () => {
    const buffer = writePsdFile(makeDoc(), [makeLayer({ name: '红块' })]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    const canvas = layers[0].canvas;
    const { data } = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });

  it('组读回来是扁平数组 + parentId', async () => {
    const group: Layer = {
      ...makeLayer({ name: '组', id: 'g1', width: 1, height: 1 }),
      type: 'group',
    };
    const child = makeLayer({ name: '组内层', id: 'c1' });
    child.parentId = 'g1';

    const buffer = writePsdFile(makeDoc(), [group, child]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');

    const readGroup = layers.find((item) => item.name === '组');
    const readChild = layers.find((item) => item.name === '组内层');
    expect(readGroup?.type).toBe('group');
    expect(readChild?.type).toBe('raster');
    // id 是重新生成的，靠 parentId 指回组
    expect(readChild?.parentId).toBe(readGroup?.id);
  });

  it('一个图层都没有的 PSD 给一张空白背景', async () => {
    const buffer = writePsdFile(makeDoc(8, 8), []);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('背景');
    expect(layers[0].bounds).toEqual({ x: 0, y: 0, width: 8, height: 8 });
  });

  it('拼合 PSD 的背景名可以由调用方按界面语言传入', async () => {
    const buffer = writePsdFile(makeDoc(8, 8), []);
    const { layers } = await readPsdBuffer(buffer, '测试.psd', {
      backgroundName: 'Background',
    });
    expect(layers[0].name).toBe('Background');
  });

  it('不是 PSD 的字节流抛错，不静默失败', async () => {
    // 文件头签名不对，ag-psd 会抛。调用方靠这个抛出去提示用户
    const junk = new Uint8Array([1, 2, 3, 4]).buffer;
    await expect(readPsdBuffer(junk, '假的.psd')).rejects.toThrow();
  });

  it('.psb 扩展名同样去掉', async () => {
    const buffer = writePsdFile(makeDoc(), [makeLayer({ name: '图层 1' })]);
    expect((await readPsdBuffer(buffer, '大文件.psb')).doc.name).toBe('大文件');
  });

  it('只有点号没扩展名的文件名不被误切', async () => {
    const buffer = writePsdFile(makeDoc(), [makeLayer({ name: '图层 1' })]);
    // 「.ps」不是我们支持的扩展名，不该被切掉
    expect((await readPsdBuffer(buffer, '存档.ps')).doc.name).toBe('存档.ps');
  });

  it('像素内容读回来对得上', async () => {
    const layer = makeLayer({ name: '红块', width: 4, height: 4, color: '#ff0000' });
    const buffer = writePsdFile(makeDoc(4, 4), [layer]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    const { data } = ctx2d(layers[0].canvas).getImageData(0, 0, 1, 1);
    expect(data[0]).toBeGreaterThan(200);
    expect(data[1]).toBeLessThan(60);
    expect(data[3]).toBeGreaterThan(200);
  });

  it('嵌套两层的组结构保留', async () => {
    const outer: Layer = {
      ...makeLayer({ name: '外组', id: 'g1', width: 1, height: 1 }),
      type: 'group',
    };
    const inner: Layer = {
      ...makeLayer({ name: '内组', id: 'g2', width: 1, height: 1 }),
      type: 'group',
    };
    inner.parentId = 'g1';
    const leaf = makeLayer({ name: '最里层', id: 'c1' });
    leaf.parentId = 'g2';

    const buffer = writePsdFile(makeDoc(), [outer, inner, leaf]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');

    const readOuter = layers.find((item) => item.name === '外组');
    const readInner = layers.find((item) => item.name === '内组');
    const readLeaf = layers.find((item) => item.name === '最里层');
    expect(readInner?.parentId).toBe(readOuter?.id);
    expect(readLeaf?.parentId).toBe(readInner?.id);
  });

  it('图层栈顺序保留：写进去在上的读回来还在上', async () => {
    const bottom = makeLayer({ name: '底层', id: 'a' });
    const middle = makeLayer({ name: '中层', id: 'b' });
    const top = makeLayer({ name: '顶层', id: 'c' });

    const buffer = writePsdFile(makeDoc(), [bottom, middle, top]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');

    // 我们的约定：layers[0] 在栈底
    expect(layers.map((item) => item.name)).toEqual(['底层', '中层', '顶层']);
  });

  /*
   * 上面那条往返用例曾经放过一个真 bug：读和写两边都把顺序反了，
   * 反两次刚好抵消，往返看起来完全正常，但用 PS 存的文件一打开就是倒的。
   * 所以顺序必须钉在「PSD 文件的绝对语义」上，而不是只钉往返自洽：
   * PSD children[0] 是栈底，我们的 layers[0] 也必须是栈底。
   * 这两条用例各自只测一个方向，任一边单独反了都会红。
   */
  it('读入方向锚定：ag-psd children[0] 必须落到 layers[0]', async () => {
    const psd: AgPsd = {
      width: 4,
      height: 4,
      children: [
        { name: '我在栈底', top: 0, left: 0, bottom: 4, right: 4, canvas: solidCanvas('#ff0000') },
        { name: '我在栈顶', top: 0, left: 0, bottom: 4, right: 4, canvas: solidCanvas('#0000ff') },
      ],
    };
    const bytes = agWritePsd(psd, { generateThumbnail: false });
    const { layers } = await readPsdBuffer(bytes, '测试.psd');
    expect(layers.map((item) => item.name)).toEqual(['我在栈底', '我在栈顶']);
  });

  it('写出方向锚定：layers[0] 必须落到 ag-psd children[0]', () => {
    const bottom = makeLayer({ name: '我在栈底', id: 'a' });
    const top = makeLayer({ name: '我在栈顶', id: 'b' });
    const buffer = writePsdFile(makeDoc(), [bottom, top]);
    // 绕过我们自己的读入逻辑，直接问 ag-psd 拿到的是什么顺序
    const raw = agReadPsd(toArrayBuffer(buffer), { skipLayerImageData: true });
    expect(raw.children?.map((child) => child.name)).toEqual(['我在栈底', '我在栈顶']);
  });
});

describe('大文件与边界', () => {
  it('1×1 文档能完整往返', async () => {
    const layer = makeLayer({ name: '一个像素', width: 1, height: 1 });
    const buffer = writePsdFile(makeDoc(1, 1), [layer]);
    const { doc, layers } = await readPsdBuffer(buffer, '测试.psd');
    expect(doc.width).toBe(1);
    expect(layers[0].bounds).toEqual({ x: 0, y: 0, width: 1, height: 1 });
  });

  it('伸出文档之外的图层原样存下来，不被裁掉', async () => {
    // 文档 8×8，图层整块在文档右下之外
    const layer = makeLayer({ name: '画布外', x: 20, y: 20, width: 4, height: 4 });
    const buffer = writePsdFile(makeDoc(8, 8), [layer]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    expect(layers[0].bounds).toEqual({ x: 20, y: 20, width: 4, height: 4 });
  });

  it('负坐标的图层也保留位置', async () => {
    const layer = makeLayer({ name: '左上外', x: -6, y: -3, width: 4, height: 4 });
    const buffer = writePsdFile(makeDoc(8, 8), [layer]);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    expect(layers[0].bounds.x).toBe(-6);
    expect(layers[0].bounds.y).toBe(-3);
  });

  it('拼合保存的 PSD 用复合图像当背景，不能丢像素', async () => {
    // 没有图层、只有复合图像的 PSD——PS 存「拼合」时就是这种
    const composite = createCanvas(6, 6);
    const context = ctx2d(composite);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 6, 6);
    const bytes = writePsd(
      { width: 6, height: 6, canvas: composite },
      { generateThumbnail: false },
    );

    const { layers } = await readPsdBuffer(bytes, '拼合.psd');
    expect(layers).toHaveLength(1);
    expect(layers[0].name).toBe('背景');
    // 关键：绿色要真的在画布上，不是一张空白
    const { data } = ctx2d(layers[0].canvas).getImageData(0, 0, 1, 1);
    expect(data[1]).toBeGreaterThan(200);
    expect(data[3]).toBeGreaterThan(200);
  });

  it('图层多的文档不丢层', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      makeLayer({ name: `图层 ${i}`, id: `L${i}`, width: 4, height: 4 }),
    );
    const buffer = writePsdFile(makeDoc(8, 8), many);
    const { layers } = await readPsdBuffer(buffer, '测试.psd');
    expect(layers).toHaveLength(30);
  });
});


