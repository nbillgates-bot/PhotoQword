/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { layerThumbnail, thumbCanvas, thumbFrame, thumbSize } from './layerThumb';
import { createCanvas, ctx2d } from './canvasUtils';

/** 建一张画布，在指定矩形里涂红 */
function withRect(
  size: number,
  rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(rect.x, rect.y, rect.w, rect.h);
  return canvas;
}

const AT_ORIGIN = { x: 0, y: 0, docWidth: 8, docHeight: 8 };

describe('thumbFrame', () => {
  it('整个文档：取景框就是文档，坐标换算到图层画布坐标系', () => {
    const canvas = createCanvas(8, 8);
    // 图层在文档 (3,4) 处，所以文档原点在图层坐标里是 (-3,-4)
    const frame = thumbFrame(canvas, 'document', { x: 3, y: 4, docWidth: 8, docHeight: 8 });
    expect(frame).toEqual({ x: -3, y: -4, width: 8, height: 8 });
  });

  it('图层边界：取景框是内容的外接框', () => {
    const canvas = withRect(8, { x: 1, y: 2, w: 3, h: 4 });
    expect(thumbFrame(canvas, 'bounds', AT_ORIGIN)).toEqual({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('全透明图层扫不出内容，退回整幅', () => {
    const canvas = createCanvas(6, 6);
    expect(thumbFrame(canvas, 'bounds', AT_ORIGIN)).toEqual({ x: 0, y: 0, width: 6, height: 6 });
  });

  it('full 档就是整张画布，既不取景也不裁剪', () => {
    // 蒙版走这一档。有内容也不裁，位置参数一律忽略
    const canvas = withRect(6, { x: 1, y: 1, w: 2, h: 2 });
    expect(thumbFrame(canvas, 'full', { x: 9, y: 9, docWidth: 100, docHeight: 100 })).toEqual({
      x: 0,
      y: 0,
      width: 6,
      height: 6,
    });
  });
});

describe('thumbSize', () => {
  it('正方形取景框填满方框', () => {
    expect(thumbSize({ x: 0, y: 0, width: 100, height: 100 }, 40)).toEqual({
      width: 40,
      height: 40,
    });
  });

  it('宽图按长边贴合，保持宽高比', () => {
    expect(thumbSize({ x: 0, y: 0, width: 200, height: 100 }, 40)).toEqual({
      width: 40,
      height: 20,
    });
  });

  it('高图同理', () => {
    expect(thumbSize({ x: 0, y: 0, width: 100, height: 400 }, 40)).toEqual({
      width: 10,
      height: 40,
    });
  });

  it('比方框还小的取景框会被放大到贴合，与 PS 一致', () => {
    expect(thumbSize({ x: 0, y: 0, width: 4, height: 2 }, 40)).toEqual({ width: 40, height: 20 });
  });

  it('极扁的取景框短边至少 1 像素，不能算出 0', () => {
    // 0 尺寸的画布拿不到 2D 上下文，会直接抛错
    const size = thumbSize({ x: 0, y: 0, width: 1000, height: 1 }, 40);
    expect(size.width).toBe(40);
    expect(size.height).toBe(1);
  });

  it('1×1 取景框不出 0 尺寸', () => {
    expect(thumbSize({ x: 0, y: 0, width: 1, height: 1 }, 40)).toEqual({ width: 40, height: 40 });
  });
});

/** 缩略图上某点的 alpha */
function alphaAt(thumb: HTMLCanvasElement, x: number, y: number): number {
  return ctx2d(thumb).getImageData(x, y, 1, 1).data[3];
}

describe('thumbCanvas', () => {
  it('整幅内容缩下来铺满缩略图', () => {
    const canvas = withRect(8, { x: 0, y: 0, w: 8, h: 8 });
    const thumb = thumbCanvas(canvas, 'document', AT_ORIGIN, 8);
    expect(thumb).not.toBeNull();
    expect(alphaAt(thumb!, 0, 0)).toBeGreaterThan(200);
    expect(alphaAt(thumb!, 7, 7)).toBeGreaterThan(200);
  });

  it('内容只占左上角时，缩略图右下也是空的', () => {
    // 8×8 里只有左上 4×4 有内容，按整个文档取景
    const canvas = withRect(8, { x: 0, y: 0, w: 4, h: 4 });
    const thumb = thumbCanvas(canvas, 'document', AT_ORIGIN, 8)!;
    expect(alphaAt(thumb, 1, 1)).toBeGreaterThan(200);
    expect(alphaAt(thumb, 6, 6)).toBe(0);
  });

  it('按图层边界取景时，同样的内容会被放大到铺满', () => {
    const canvas = withRect(8, { x: 0, y: 0, w: 4, h: 4 });
    const thumb = thumbCanvas(canvas, 'bounds', AT_ORIGIN, 8)!;
    // 取景框就是那 4×4，所以缩略图四角都该有内容
    expect(alphaAt(thumb, 1, 1)).toBeGreaterThan(200);
    expect(alphaAt(thumb, 6, 6)).toBeGreaterThan(200);
  });

  it('图层整个移出文档时缩略图全空，不抛错', () => {
    const canvas = withRect(4, { x: 0, y: 0, w: 4, h: 4 });
    // 图层在文档 (100,100)，文档只有 8×8，完全不相交
    const thumb = thumbCanvas(canvas, 'document', { x: 100, y: 100, docWidth: 8, docHeight: 8 }, 8)!;
    expect(alphaAt(thumb, 0, 0)).toBe(0);
    expect(alphaAt(thumb, 7, 7)).toBe(0);
  });

  it('图层只露一半时，露出的那半画在缩略图对应的一侧', () => {
    /*
     * 这一条钉的是越界源矩形的裁剪：图层 8×8 摆在文档 (4,0)，
     * 文档 8×8，所以只有图层的左半落在文档右半里。
     * 交集算错的话内容会跑到左边去。
     */
    const canvas = withRect(8, { x: 0, y: 0, w: 8, h: 8 });
    const thumb = thumbCanvas(canvas, 'document', { x: 4, y: 0, docWidth: 8, docHeight: 8 }, 8)!;
    // 缩略图左半（对应文档左半）该是空的
    expect(alphaAt(thumb, 1, 4)).toBe(0);
    // 右半该有内容
    expect(alphaAt(thumb, 6, 4)).toBeGreaterThan(200);
  });

  it('图层被拖到文档左边时，只有仍在文档内的部分出现在缩略图左侧', () => {
    /*
     * 负位置：图层 8×8 摆在文档 (-4,0)，所以图层的右半落在文档左半里。
     * 取景框在图层坐标里是 x=4，宽 8 —— 右边一半越界，要靠交集裁掉。
     */
    const canvas = withRect(8, { x: 0, y: 0, w: 8, h: 8 });
    const thumb = thumbCanvas(canvas, 'document', { x: -4, y: 0, docWidth: 8, docHeight: 8 }, 8)!;
    // 文档左半有内容
    expect(alphaAt(thumb, 1, 4)).toBeGreaterThan(200);
    // 文档右半对应图层坐标 8..11，超出画布，是空的
    expect(alphaAt(thumb, 6, 4)).toBe(0);
  });

  it('1×1 文档也能出图，不抛错', () => {
    const canvas = withRect(4, { x: 0, y: 0, w: 4, h: 4 });
    const thumb = thumbCanvas(canvas, 'document', { x: 0, y: 0, docWidth: 1, docHeight: 1 }, 8);
    expect(thumb).not.toBeNull();
    expect(alphaAt(thumb!, 0, 0)).toBeGreaterThan(200);
  });

  it('被撑大的图层按文档取景，超出文档的部分不进缩略图', () => {
    // 图层 16×16、文档只有 8×8，只有左上 8×8 该出现
    const canvas = withRect(16, { x: 8, y: 8, w: 8, h: 8 });
    const thumb = thumbCanvas(canvas, 'document', { x: 0, y: 0, docWidth: 8, docHeight: 8 }, 8)!;
    // 内容全在文档外的那一块，所以缩略图是空的
    expect(alphaAt(thumb, 4, 4)).toBe(0);
  });

  it('缩略图像素不含 NaN', () => {
    /*
     * Uint8ClampedArray 会把 NaN 变成 0，画面只是黑一块，不报错也不崩，
     * 是最难查的一类 bug，所以负位置这种边界情形要显式扫一遍。
     */
    const canvas = withRect(4, { x: 0, y: 0, w: 4, h: 4 });
    const thumb = thumbCanvas(canvas, 'document', { x: -1, y: 2, docWidth: 8, docHeight: 8 }, 8)!;
    const { data } = ctx2d(thumb).getImageData(0, 0, thumb.width, thumb.height);
    for (const value of data) expect(Number.isNaN(value)).toBe(false);
  });

  it('box 为 0 时不出图', () => {
    expect(thumbCanvas(createCanvas(4, 4), 'document', AT_ORIGIN, 0)).toBeNull();
  });

  it('缩略图尺寸只跟 box 有关，与文档多大无关', () => {
    /*
     * 这是这次优化的关键性质：以前要先建一张文档尺寸的中间画布，
     * 大文档上就是每层几十 MB。现在产出的画布恒为 box 量级。
     */
    const canvas = withRect(8, { x: 0, y: 0, w: 8, h: 8 });
    const small = thumbCanvas(canvas, 'document', { x: 0, y: 0, docWidth: 8, docHeight: 8 }, 40)!;
    const huge = thumbCanvas(
      canvas,
      'document',
      { x: 0, y: 0, docWidth: 6000, docHeight: 6000 },
      40,
    )!;
    expect(small.width).toBeLessThanOrEqual(40);
    expect(huge.width).toBeLessThanOrEqual(40);
    expect(huge.height).toBeLessThanOrEqual(40);
  });
});

describe('layerThumbnail', () => {
  it('给出 PNG 的 data URL', () => {
    const url = layerThumbnail(withRect(8, { x: 0, y: 0, w: 8, h: 8 }), 'document', AT_ORIGIN, 8);
    expect(url.startsWith('data:image/png')).toBe(true);
  });

  it('画不出来时给空串，让调用方渲染占位方块', () => {
    expect(layerThumbnail(createCanvas(4, 4), 'document', AT_ORIGIN, 0)).toBe('');
  });
});
