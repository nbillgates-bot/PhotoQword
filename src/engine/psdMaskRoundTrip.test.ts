/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/*
 * PSD 蒙版的往返对照：写出去再读回来，蒙版必须还在原位。
 *
 * 蒙版按图层 bounds 对齐（见 mask.ts 的 maskGeometry）。写出时如果只给 canvas
 * 不给位置，ag-psd 会把蒙版矩形当成从文档 (0,0) 起，读回来就整体偏移一个 bounds
 * ——存一遍开一遍蒙版就跑位，而画面上表现成「图层被抹掉一半」，很难往导出上想。
 * 所以这条链路必须整条测，只测写或只测读都放得过去。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { initializeCanvas, readPsd } from 'ag-psd';
import { createCanvas as nodeCanvas } from 'canvas';
import { writePsdFile } from './psdWrite';
import { flattenPsdLayers } from './psdLayers';
import { createCanvas, ctx2d, fillCanvas } from './canvasUtils';
import { createMask } from './mask';
import type { Doc, Layer } from '../types';

const DOC: Doc = { width: 64, height: 64, resolution: 72 } as Doc;

/** jsdom 里没有真 canvas，ag-psd 要靠 initializeCanvas 拿到 node-canvas 的实现 */
beforeAll(() => {
  initializeCanvas((width, height) => nodeCanvas(width, height) as unknown as HTMLCanvasElement);
});

/** 左半白右半黑的蒙版，尺寸跟图层画布一致 */
function halfMask(width: number, height: number): HTMLCanvasElement {
  const mask = createMask(width, height, true);
  const context = ctx2d(mask);
  context.fillStyle = '#000000';
  context.fillRect(Math.ceil(width / 2), 0, width - Math.ceil(width / 2), height);
  return mask;
}

function maskedLayer(bounds: { x: number; y: number; width: number; height: number }): Layer {
  const canvas = createCanvas(bounds.width, bounds.height);
  fillCanvas(canvas, '#ff0000');
  return {
    id: 'a',
    name: '带蒙版的偏移图层',
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds,
    mask: halfMask(bounds.width, bounds.height),
  } as Layer;
}

/** 走完整链路：写字节 → 读回 → 转成我们的 Layer */
async function roundTrip(layer: Layer): Promise<Layer> {
  const bytes = writePsdFile(DOC, [layer]);
  const psd = readPsd(bytes.buffer as ArrayBuffer);
  expect(psd.children?.length, '读回来没有图层').toBe(1);
  const back = await flattenPsdLayers(psd.children!, {
    done: 0,
    total: 1,
    yieldNow: () => null,
    doc: { width: DOC.width, height: DOC.height },
  });
  expect(back.length, '读回来没转成 Layer').toBe(1);
  return back[0];
}

/** 蒙版某点的灰度与自身 alpha */
function maskAt(mask: HTMLCanvasElement, x: number, y: number) {
  const [gray, , , alpha] = ctx2d(mask).getImageData(x, y, 1, 1).data;
  return { gray, alpha };
}

describe('PSD 蒙版往返', () => {
  it('bounds 在原点时蒙版原样回来', async () => {
    const back = await roundTrip(maskedLayer({ x: 0, y: 0, width: 20, height: 12 }));
    expect(back.mask, '蒙版丢了').toBeTruthy();
    expect(maskAt(back.mask!, 2, 2).gray).toBeGreaterThan(200);
    expect(maskAt(back.mask!, 18, 2).gray).toBeLessThan(60);
  });

  it('bounds 不在原点时蒙版不跑位', async () => {
    /*
     * 这条是回归用例：写出时不带 left/top 的话，蒙版矩形被当成从 (0,0) 起，
     * 读回来 drawImage 到 (0 - 20, 0 - 30)，左半的白整块移出画布，
     * 于是本该留下的那半边反而被抹掉。
     */
    const bounds = { x: 20, y: 30, width: 24, height: 16 };
    const back = await roundTrip(maskedLayer(bounds));
    expect(back.mask, '蒙版丢了').toBeTruthy();
    // 蒙版是图层局部坐标：局部 (2,2) 在白半边，局部 (22,2) 在黑半边
    expect(maskAt(back.mask!, 2, 2).gray).toBeGreaterThan(200);
    expect(maskAt(back.mask!, 22, 2).gray).toBeLessThan(60);
  });

  it('蒙版尺寸跟着图层画布，不是文档尺寸', async () => {
    const back = await roundTrip(maskedLayer({ x: 20, y: 30, width: 24, height: 16 }));
    expect(back.mask!.width).toBe(back.canvas.width);
    expect(back.mask!.height).toBe(back.canvas.height);
  });

  it('蒙版像素不透明，否则 maskToAlpha 会当成隐藏', async () => {
    // maskToAlpha 拿蒙版自身 alpha 乘亮度，透明处一律算隐藏，
    // 所以往返回来的蒙版任何一点都必须是不透明的，白的地方才真的是「显示」
    const back = await roundTrip(maskedLayer({ x: 20, y: 30, width: 24, height: 16 }));
    expect(maskAt(back.mask!, 2, 2).alpha).toBe(255);
    expect(maskAt(back.mask!, 22, 2).alpha).toBe(255);
  });
});
