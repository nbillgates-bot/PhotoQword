/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  CARET_ROOM,
  isParagraphText,
  pointEditorBox,
  textBoxLocal,
  textHitRects,
  textHitTest,
  textLayerBounds,
} from './textBox';
import { measureText } from './textRender';
import { createCanvas } from './canvasUtils';
import { boundsFor } from './layerBounds';
import type { Layer, Rect, TextData } from '../types';

const text = (patch: Partial<TextData> = {}): TextData => ({
  content: 'Hi',
  x: 20,
  y: 30,
  fontSize: 40,
  fontFamily: 'sans-serif',
  fontWeight: 400,
  color: '#000000',
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  lineHeight: 1.2,
  letterSpacing: 0,
  ...patch,
});

const para = (patch: Partial<TextData> = {}) => text({ width: 200, height: 100, ...patch });
const finite = (rect: Rect) => [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite);

describe('isParagraphText', () => {
  it('宽高成对出现才是段落文本', () => {
    expect(isParagraphText(para())).toBe(true);
    expect(isParagraphText(text())).toBe(false);
  });

  it('只有一个字段是半成品，按点文本处理', () => {
    expect(isParagraphText(text({ width: 200 }))).toBe(false);
    expect(isParagraphText(text({ height: 100 }))).toBe(false);
  });
});

describe('textLayerBounds', () => {
  it('段落文本的 bounds 原点是文字原点，canvas 就是那个框', () => {
    expect(textLayerBounds(createCanvas(200, 100), para())).toEqual({
      x: 20,
      y: 30,
      width: 200,
      height: 100,
    });
  });

  /*
   * 点文本的落笔基准是 canvas 本地 (data.x, data.y)，bounds 原点必须留在 (0,0)。
   * 曾经这里也用 (data.x, data.y)，位移被叠加两次，单击 (20,30) 打的字落到了 (40,60)。
   */
  it('点文本的 bounds 原点留在 (0,0)，位移不会被叠加两次', () => {
    expect(textLayerBounds(createCanvas(400, 400), text())).toEqual({
      x: 0,
      y: 0,
      width: 400,
      height: 400,
    });
  });

  it('原点为负也不丢符号', () => {
    expect(textLayerBounds(createCanvas(50, 50), para({ x: -12, y: -8 }))).toMatchObject({
      x: -12,
      y: -8,
    });
  });
});

describe('textBoxLocal 段落文本', () => {
  it('bounds 与文字同原点时框在本地 (0,0)', () => {
    const box = textBoxLocal(para(), { x: 20, y: 30, width: 200, height: 100 });
    expect(box).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('画布被撑到覆盖文档后，框按差值退回去', () => {
    // expandLayerForEdit 之后 bounds 原点变 (0,0)，框就该出现在 (20,30)
    const box = textBoxLocal(para(), { x: 0, y: 0, width: 400, height: 400 });
    expect(box).toEqual({ x: 20, y: 30, width: 200, height: 100 });
  });

  it('框尺寸只认 textData，不认画布', () => {
    const box = textBoxLocal(para({ width: 7, height: 3 }), { x: 20, y: 30, width: 7, height: 3 });
    expect(box).toMatchObject({ width: 7, height: 3 });
  });

  it('宽高为 1 的极端框不产生 NaN', () => {
    expect(finite(textBoxLocal(para({ width: 1, height: 1 }), { x: 0, y: 0, width: 1, height: 1 })))
      .toBe(true);
  });
});

describe('textBoxLocal 点文本', () => {
  const bounds = { x: 0, y: 0, width: 400, height: 400 };

  it('左对齐时框左边就是文字原点', () => {
    expect(textBoxLocal(text(), bounds)).toMatchObject({ x: 20, y: 30 });
  });

  it('居中对齐时框左边退半个宽度', () => {
    const left = textBoxLocal(text(), bounds);
    const center = textBoxLocal(text({ align: 'center' }), bounds);
    expect(center.width).toBeCloseTo(left.width);
    expect(center.x).toBeCloseTo(left.x - left.width / 2);
  });

  it('右对齐时框左边退一整个宽度', () => {
    const left = textBoxLocal(text(), bounds);
    const right = textBoxLocal(text({ align: 'right' }), bounds);
    expect(right.x).toBeCloseTo(left.x - left.width);
  });

  it('对齐方式不影响纵向位置，y 始终是首行行盒顶端', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      expect(textBoxLocal(text({ align }), bounds).y).toBe(30);
    }
  });

  it('高度按行数乘行盒高度', () => {
    expect(textBoxLocal(text({ content: 'a\nb\nc' }), bounds).height).toBeCloseTo(40 * 1.2 * 3);
  });

  it('空内容也有一行的高度，框不会塌成 0', () => {
    const box = textBoxLocal(text({ content: '' }), bounds);
    expect(box.height).toBeCloseTo(48);
    expect(box.width).toBe(0);
  });

  it('bounds 有偏移时按差值换算到本地坐标', () => {
    expect(textBoxLocal(text(), { x: 5, y: 8, width: 400, height: 400 })).toMatchObject({
      x: 15,
      y: 22,
    });
  });

  it('字号 1 / 行高小于 1 的极端值不产生 NaN', () => {
    expect(finite(textBoxLocal(text({ fontSize: 1, lineHeight: 0.5 }), bounds))).toBe(true);
  });

  it('字间距参与量宽，加了间距框只会变宽不会变窄', () => {
    const tight = textBoxLocal(text({ content: 'abc' }), bounds);
    const loose = textBoxLocal(text({ content: 'abc', letterSpacing: 10 }), bounds);
    // 有的环境不支持 letterSpacing，此时两者相等；支持时 loose 更宽。两条路径都成立
    expect(loose.width).toBeGreaterThanOrEqual(tight.width);
  });
});

/*
 * 编辑框尺寸是「进编辑那一下位置就变了」的关键一环：
 * 宽度不对会毁掉对齐（textAlign 相对这个盒子生效），高度不对会裁掉内容（overflow:hidden）。
 */
describe('pointEditorBox', () => {
  it('宽度比实测文字多留出光标的位置', () => {
    const data = text();
    expect(pointEditorBox(data).width).toBeCloseTo(measureText(data).width + CARET_ROOM);
  });

  it('高度不加余量，和实测一致——多一点就会把下一行顶下去', () => {
    const data = text({ content: 'a\nb\nc' });
    expect(pointEditorBox(data).height).toBeCloseTo(measureText(data).height);
  });

  it('空内容也有一行的高度，框不会塌成 0', () => {
    expect(pointEditorBox(text({ content: '' })).height).toBeGreaterThan(0);
  });

  it('空内容的宽度只剩光标余量', () => {
    expect(pointEditorBox(text({ content: '' })).width).toBeCloseTo(CARET_ROOM);
  });

  it('段落文本的 width/height 不参与，它量的始终是文字本身', () => {
    const data = text({ content: 'Hi' });
    expect(pointEditorBox({ ...data, width: 999, height: 999 })).toEqual(pointEditorBox(data));
  });

  it('极端字号与行高不产生 NaN', () => {
    const box = pointEditorBox(text({ fontSize: 1, lineHeight: 0.5, letterSpacing: 2 }));
    expect(Number.isFinite(box.width)).toBe(true);
    expect(Number.isFinite(box.height)).toBe(true);
  });

  it('留的余量是正数，否则光标照样被裁', () => {
    expect(CARET_ROOM).toBeGreaterThan(0);
  });
});

/*
 * 报的 bug：PSD 里的文字层，点在字上进不了编辑。
 * PSD 图层的像素是 PS 排好版搬过来的，我们按 textData 重排出来的框
 * 不保证和它重合，所以命中范围要并上图层自己的 bounds。
 */
describe('textHitRect', () => {
  const DOC = { width: 400, height: 400 };

  /** 造一个文字图层。canvas 尺寸和 bounds 保持 layerBounds 的不变量 */
  function textLayer(data: TextData | undefined, rect: Rect): Layer {
    const canvas = createCanvas(rect.width, rect.height);
    return {
      id: 'T',
      name: '文字',
      type: 'text',
      visible: true,
      locked: false,
      opacity: 100,
      blendMode: 'normal',
      canvas,
      bounds: boundsFor(canvas, rect.x, rect.y),
      textData: data,
      parentId: null,
    };
  }

  it('铺满文档的图层只用文字框，不再拿 bounds 当候选', () => {
    // 我们自己建的点文本就是这个形态：canvas 与文档同大
    const layer = textLayer(text({ x: 20, y: 30 }), { x: 0, y: 0, ...DOC });

    const rects = textHitRects(layer, DOC.width, DOC.height);

    // 算进去的话整张画布都算命中，点哪儿都会掉进这个文字层
    expect(rects).toHaveLength(1);
    expect(rects[0].width).toBeLessThan(DOC.width);
    expect(rects[0].x).toBe(20);
  });

  it('PSD 那种局部图层，bounds 整块都算命中', () => {
    // 文字框算在左上，像素却在右下——正是重排对不上的情形
    const layer = textLayer(text({ x: 0, y: 0 }), { x: 200, y: 220, width: 120, height: 60 });

    // 像素块的四个角都要能点中
    expect(textHitTest(layer, 200, 220, DOC)).toBe(true);
    expect(textHitTest(layer, 320, 280, DOC)).toBe(true);
    // 原来的文字框也照样有效
    expect(textHitTest(layer, 0, 0, DOC)).toBe(true);
  });

  it('多出一块像素候选，不会挤掉原来的文字框', () => {
    const data = text({ x: 10, y: 10 });
    const layer = textLayer(data, { x: 300, y: 300, width: 50, height: 50 });

    const rects = textHitRects(layer, DOC.width, DOC.height);
    const box = textBoxLocal(data, { x: 0, y: 0, ...DOC });

    expect(rects).toHaveLength(2);
    expect(rects.some((rect) => rect.x <= box.x && rect.width >= box.width)).toBe(true);
  });

  it('没有 textData 时退回图层 bounds，不抛错', () => {
    const layer = textLayer(undefined, { x: 5, y: 6, width: 20, height: 20 });
    expect(textHitRects(layer, DOC.width, DOC.height)).toEqual([layer.bounds]);
  });

  it('各分量都是有限数，不含 NaN', () => {
    const layer = textLayer(text({ content: '', fontSize: 1 }), {
      x: 1,
      y: 1,
      width: 1,
      height: 1,
    });
    const rects = textHitRects(layer, DOC.width, DOC.height);
    expect(rects.length).toBeGreaterThan(0);
    expect(rects.every(finite)).toBe(true);
  });

  it('居中的文字，落笔点和像素块都在命中范围内', () => {
    // 对齐位移和 bounds 并集要能同时成立
    const data = text({ align: 'center', x: 150, y: 40 });
    const layer = textLayer(data, { x: 100, y: 30, width: 100, height: 50 });

    expect(textHitTest(layer, 150, 40, DOC)).toBe(true);
    expect(textHitTest(layer, 100, 30, DOC)).toBe(true);
    expect(textHitTest(layer, 200, 80, DOC)).toBe(true);
  });

  /*
   * 报的 bug：点的是一个文字，进编辑的却是另一个文字图层。
   *
   * 病根是把「重排框」和「像素框」并成一个矩形。两块不重合时（PSD 文字层的
   * 常态，见本段开头的注释），并集会把中间大片空白也算成命中，于是这一层
   * 隔着老远就把邻居文字层的点击吃掉了。两块要分别判定，不能先并起来。
   */
  it('重排框和像素块之间的空白不算命中', () => {
    // 文字数据在左上角，像素在右下角
    const layer = textLayer(text({ x: 0, y: 0 }), { x: 200, y: 220, width: 120, height: 60 });

    // 两块各自都要命中
    expect(textHitTest(layer, 0, 0, DOC)).toBe(true);
    expect(textHitTest(layer, 260, 250, DOC)).toBe(true);
    // 中间的空白不能命中——那里没有字，点下去该轮到别的图层
    expect(textHitTest(layer, 150, 150, DOC)).toBe(false);
  });
});
