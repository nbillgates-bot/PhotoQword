/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';
import { createTransformState } from '../engine/transformBox';
import type { Rect, TextData } from '../types';

const store = () => useEditorStore.getState();

/** 只改矩形、不旋转不斜切的变换，覆盖原来纯缩放的那批用例 */
const setRect = (rect: Rect) => store().updateTransform(createTransformState(rect));

function newDoc(width = 32, height = 32) {
  store().createDoc({ width, height, background: 'transparent', name: '测试' });
}

/** 在活动图层左上角画一块红方块，用来观察变换结果 */
function paintBlock(x = 0, y = 0, w = 16, h = 16) {
  const layer = store().activeLayer()!;
  const context = ctx2d(layer.canvas);
  context.fillStyle = '#ff0000';
  context.fillRect(x, y, w, h);
  store().bumpRevision();
}

function pixelAt(x: number, y: number): number[] {
  const layer = store().activeLayer()!;
  return Array.from(ctx2d(layer.canvas).getImageData(x, y, 1, 1).data);
}

const isRed = (x: number, y: number) => pixelAt(x, y)[0] > 200 && pixelAt(x, y)[3] > 200;

beforeEach(() => {
  store().closeDoc();
  store().cancelTransform();
});

describe('beginTransform', () => {
  it('没有文档时不开会话', () => {
    store().beginTransform();
    expect(store().transformSession).toBeNull();
  });

  it('整幅都有内容时，会话的矩形就是整幅画布', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();

    const session = store().transformSession!;
    expect(session.originalRect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(session.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(session.layerId).toBe(store().activeLayerId);
  });

  it('保存了原始快照，尺寸跟着变换框', () => {
    newDoc(32, 32);
    // 左上角 16×16 的红块，框贴着它，所以快照也是 16×16
    paintBlock();
    store().beginTransform();

    const { origin } = store().transformSession!;
    expect(origin.width).toBe(16);
    expect(origin.height).toBe(16);
    const data = ctx2d(origin).getImageData(4, 4, 1, 1).data;
    expect(data[0]).toBeGreaterThan(200);
  });

  it('锁定图层不能变换，且给出提示', () => {
    newDoc(32, 32);
    const id = store().activeLayerId!;
    store().updateLayer(id, { locked: true });
    store().beginTransform();

    expect(store().transformSession).toBeNull();
    // toast.message 存的是词条 key，翻译在 Toast 组件里做
    expect(store().toast?.message).toBe('toast.layerLocked');
  });

  it('开启会话本身不写历史', () => {
    newDoc(32, 32);
    const before = store().history.length;
    store().beginTransform();
    expect(store().history.length).toBe(before);
  });
});

describe('updateTransform 预览', () => {
  it('缩小一半后右下角变空', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 16, height: 16 });

    expect(isRed(2, 2)).toBe(true);
    expect(isRed(20, 20)).toBe(false);
  });

  it('平移后原位置变空', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 16, 16);
    store().beginTransform();
    setRect({ x: 16, y: 16, width: 32, height: 32 });

    expect(isRed(2, 2)).toBe(false);
    expect(isRed(20, 20)).toBe(true);
  });

  it('每帧都从快照重算，反复拖动不累积模糊', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();

    // 缩小再放回原尺寸，像素应当和一开始一致
    setRect({ x: 0, y: 0, width: 8, height: 8 });
    setRect({ x: 0, y: 0, width: 4, height: 4 });
    setRect({ x: 0, y: 0, width: 32, height: 32 });

    expect(isRed(2, 2)).toBe(true);
    expect(isRed(30, 30)).toBe(true);
  });

  it('负宽高先归一化再画', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    // 从 (32,32) 往左上拖成负值，等价于 (16,16,16,16)
    setRect({ x: 32, y: 32, width: -16, height: -16 });

    expect(isRed(20, 20)).toBe(true);
    expect(isRed(2, 2)).toBe(false);
  });

  it('预览会推进 revision，界面才会刷新', () => {
    newDoc(32, 32);
    store().beginTransform();
    const before = store().revision;
    setRect({ x: 0, y: 0, width: 16, height: 16 });
    expect(store().revision).toBeGreaterThan(before);
  });

  it('没有会话时调用是空操作', () => {
    newDoc(32, 32);
    expect(() => setRect({ x: 0, y: 0, width: 8, height: 8 })).not.toThrow();
    expect(store().transformSession).toBeNull();
  });

  it('预览不产生 NaN 像素', () => {
    newDoc(16, 16);
    paintBlock(0, 0, 16, 16);
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 1, height: 1 });

    const layer = store().activeLayer()!;
    const data = ctx2d(layer.canvas).getImageData(0, 0, 16, 16).data;
    expect(Array.from(data).some(Number.isNaN)).toBe(false);
  });

  it('预览期间不写历史', () => {
    newDoc(32, 32);
    store().beginTransform();
    const before = store().history.length;
    setRect({ x: 0, y: 0, width: 16, height: 16 });
    setRect({ x: 0, y: 0, width: 8, height: 8 });
    expect(store().history.length).toBe(before);
  });
});

describe('commitTransform', () => {
  it('确认后会话结束，像素保留', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 16, height: 16 });
    store().commitTransform();

    expect(store().transformSession).toBeNull();
    expect(isRed(2, 2)).toBe(true);
    expect(isRed(20, 20)).toBe(false);
  });

  it('写入一条历史，可以整步撤销', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().pushHistory('画方块');
    const before = store().history.length;

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 16, height: 16 });
    store().commitTransform();

    expect(store().history.length).toBe(before + 1);
    expect(store().history.at(-1)?.label).toBe('action.freeTransform');

    store().undo();
    expect(isRed(30, 30)).toBe(true);
  });

  it('没有会话时是空操作', () => {
    newDoc(32, 32);
    const before = store().history.length;
    store().commitTransform();
    expect(store().history.length).toBe(before);
  });

  /**
   * 建一个文字层。给 width/height 就是段落文本，不给就是点文本
   * （两者成对出现是 TextData 的契约）。
   */
  function textLayerWith(patch: Partial<TextData>) {
    const layer = store().insertLayer('text', '文字')!;
    store().updateLayer(layer.id, {
      textData: {
        content: '测试',
        x: 0,
        y: 0,
        fontSize: 40,
        fontFamily: 'sans-serif',
        fontWeight: 400,
        color: '#000',
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
        ...patch,
      },
    });
    store().setActiveLayer(layer.id);
    return layer;
  }

  it('文字图层同步坐标与字号', () => {
    newDoc(64, 64);
    const layer = store().insertLayer('text', '文字')!;
    store().updateLayer(layer.id, {
      textData: {
        content: '测试',
        x: 10,
        y: 20,
        fontSize: 40,
        fontFamily: 'sans-serif',
        fontWeight: 400,
        color: '#000',
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    });
    store().setActiveLayer(layer.id);

    store().beginTransform();
    /*
     * 期望值从会话的初始框推，不写死：框贴的是文字外框（见「文字层的初始框」），
     * 写死数字等于把外框的具体尺寸当成契约，字体量出来差一点测试就红。
     * 这里测的契约是「文字原点跟着框的映射走，字号按缩放比走」。
     */
    const from = store().transformSession!.originalRect;
    const to = { x: 0, y: 0, width: from.width / 2, height: from.height / 4 };
    setRect(to);
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData!;
    // 原点在框的左上角，缩放后跟着落到新框的左上角
    expect(text.x).toBeCloseTo(to.x);
    expect(text.y).toBeCloseTo(to.y);
    // 字号取两个方向里小的那个，等比时才不会被拉扁
    expect(text.fontSize).toBeCloseTo(40 * 0.25);
  });

  it('点文本变换后不会凭空长出边界框', () => {
    newDoc(64, 64);
    const layer = textLayerWith({ x: 10, y: 20 });

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 32, height: 32 });
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData!;
    expect(text.width).toBeUndefined();
    expect(text.height).toBeUndefined();
  });

  /*
   * 段落文本的边界框不跟着缩放，下次进编辑时框还是变换前的尺寸，
   * 而且 renderText 会按旧宽度重新折行，把这次变换悄悄丢掉。
   */
  it('段落文本的边界框按比例缩放', () => {
    newDoc(64, 64);
    const layer = textLayerWith({ x: 0, y: 0, width: 40, height: 20 });

    store().beginTransform();
    // 框贴的就是这个 40×20 的边界框，所以拉到 32×16 之后框本身就该是 32×16
    setRect({ x: 0, y: 0, width: 32, height: 16 });
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData!;
    expect(text.width).toBe(32);
    expect(text.height).toBe(16);
  });

  it('边界框缩放后仍是整像素', () => {
    newDoc(64, 64);
    const layer = textLayerWith({ x: 0, y: 0, width: 33, height: 33 });

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 41, height: 41 });
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData!;
    expect(Number.isInteger(text.width!)).toBe(true);
    expect(Number.isInteger(text.height!)).toBe(true);
  });

  it('缩得极小时边界框保底 1px，不塌成 0', () => {
    newDoc(64, 64);
    const layer = textLayerWith({ x: 0, y: 0, width: 40, height: 40 });

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 1, height: 1 });
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData!;
    expect(text.width).toBeGreaterThanOrEqual(1);
    expect(text.height).toBeGreaterThanOrEqual(1);
  });

  it('形状图层同步矩形', () => {
    newDoc(64, 64);
    const layer = store().insertLayer('shape', '形状')!;
    store().updateLayer(layer.id, {
      shapeData: {
        kind: 'rect',
        rect: { x: 10, y: 10, width: 20, height: 20 },
        fill: '#f00',
        stroke: '#000',
        strokeWidth: 1,
        filled: true,
        radius: 0,
        points: 0,
      },
    });
    store().setActiveLayer(layer.id);

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 32, height: 32 });
    store().commitTransform();

    const shape = store().layers.find((item) => item.id === layer.id)!.shapeData!;
    expect(shape.rect.width).toBeCloseTo(10);
    expect(shape.rect.height).toBeCloseTo(10);
    expect(shape.rect.x).toBeCloseTo(5);
  });

  it('普通栅格图层不带 textData/shapeData 也能确认', () => {
    newDoc(32, 32);
    paintBlock();
    store().beginTransform();
    setRect({ x: 4, y: 4, width: 16, height: 16 });
    expect(() => store().commitTransform()).not.toThrow();
    expect(store().activeLayer()!.textData).toBeUndefined();
  });

  /*
   * 文字层的框贴文字外框，不贴墨迹。PS 里对文字层按 Ctrl+T 出来的就是那个定界框，
   * 贴墨迹的话一段没写满的段落文本，框会缩到只包住写了字的几行，跟编辑态的框对不上。
   */
  describe('文字层的初始框', () => {
    /** 建一个真渲染过的文字层：走 updateTextLayer 才会画像素并摆正 bounds */
    function renderedText(patch: Partial<TextData>) {
      const layer = textLayerWith(patch);
      store().updateTextLayer(layer.id, {});
      return layer;
    }

    it('段落文本的框就是那个边界框，不缩到墨迹上', () => {
      newDoc(400, 400);
      renderedText({ content: '一', x: 20, y: 30, width: 200, height: 160 });

      store().beginTransform();

      expect(store().transformSession!.originalRect).toEqual({
        x: 20,
        y: 30,
        width: 200,
        height: 160,
      });
    });

    it('内容为空的段落文本照样开得出框', () => {
      newDoc(400, 400);
      renderedText({ content: '', x: 10, y: 10, width: 120, height: 80 });

      store().beginTransform();

      expect(store().transformSession!.originalRect).toEqual({
        x: 10,
        y: 10,
        width: 120,
        height: 80,
      });
    });

    it('点文本的框从文字原点起算，不是整幅画布', () => {
      newDoc(400, 400);
      renderedText({ content: '一', x: 40, y: 50 });

      store().beginTransform();
      const rect = store().transformSession!.originalRect;

      expect(rect.x).toBe(40);
      expect(rect.y).toBe(50);
      // 框贴文字，不该是整幅 400×400
      expect(rect.width).toBeLessThan(200);
      expect(rect.height).toBeLessThan(200);
    });

    it('框与快照同尺寸，映射才对得上', () => {
      newDoc(400, 400);
      renderedText({ content: '一二', x: 20, y: 30, width: 200, height: 160 });

      store().beginTransform();
      const { originalRect, origin } = store().transformSession!;

      expect(origin.width).toBe(originalRect.width);
      expect(origin.height).toBe(originalRect.height);
    });

    /*
     * 缩小确认之后再开一次框，框必须贴新尺寸。
     * 这条曾经因为 bounds 被撑到整个文档而失败，表现是「框还停在缩放前的位置」。
     */
    it('缩小确认后再开框，框贴的是新尺寸', () => {
      newDoc(400, 400);
      renderedText({ content: '一', x: 0, y: 0, width: 200, height: 160 });

      store().beginTransform();
      setRect({ x: 0, y: 0, width: 100, height: 80 });
      store().commitTransform();
      store().beginTransform();

      expect(store().transformSession!.originalRect).toMatchObject({
        x: 0,
        y: 0,
        width: 100,
        height: 80,
      });
    });
  });
});

describe('旋转与斜切预览', () => {
  /*
   * 改角度要基于会话当前的矩形，不能自己另写一个。
   * 框贴着图层内容，写死 {0,0,32,32} 就等于顺手把内容拉满整幅画布，
   * 测的就不是旋转了。UI 里也是拿 session.state 改一个字段。
   */
  const setState = (over: Partial<ReturnType<typeof createTransformState>>) =>
    store().updateTransform({ ...store().transformSession!.state, ...over });

  it('旋转 90° 后左半边跑到上半或下半', () => {
    newDoc(32, 32);
    /*
     * 整幅都要有像素，框才等于整幅画布，这样旋转中心就是画布中心。
     * 左半红右半绿，转 90° 之后红的应该跑到上下某一半。
     */
    paintBlock(0, 0, 32, 32);
    const context = ctx2d(store().activeLayer()!.canvas);
    context.fillStyle = '#00ff00';
    context.fillRect(16, 0, 16, 32);

    store().beginTransform();
    setState({ angle: Math.PI / 2 });

    // 红色只占上下之一，不可能两半都是红的，也不可能都不是
    expect(isRed(16, 4)).not.toBe(isRed(16, 28));
    // 转成横条后，同一行左右两端颜色应该一致
    expect(isRed(4, 4)).toBe(isRed(28, 4));
  });

  it('旋转 360° 与不旋转的结果一致', () => {
    newDoc(32, 32);
    paintBlock(8, 8, 16, 16);
    store().beginTransform();
    setState({ angle: Math.PI * 2 });
    expect(isRed(16, 16)).toBe(true);
    expect(isRed(2, 2)).toBe(false);
  });

  it('旋转不改会话里的矩形，只改角度', () => {
    newDoc(32, 32);
    store().beginTransform();
    setState({ angle: Math.PI / 4 });

    const session = store().transformSession!;
    expect(session.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(session.state.angle).toBeCloseTo(Math.PI / 4);
  });

  it('斜切能画出来且不报错，中心像素保留', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    expect(() => setState({ skewX: Math.PI / 6 })).not.toThrow();
    // 斜切绕中心，中心点不动
    expect(isRed(16, 16)).toBe(true);
  });

  it('连续改角度都从快照重算，不累积模糊', () => {
    newDoc(32, 32);
    paintBlock(8, 8, 16, 16);
    store().beginTransform();
    setState({ angle: Math.PI / 3 });
    setState({ angle: Math.PI / 6 });
    setState({ angle: 0 });

    // 回到 0° 应该跟原图一样：方块在中间，四角是空的
    expect(isRed(16, 16)).toBe(true);
    expect(isRed(1, 1)).toBe(false);
    expect(isRed(30, 30)).toBe(false);
  });

  it('预览后 context 的矩阵已复位，后续普通绘制不受影响', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setState({ angle: Math.PI / 4, skewX: 0.3 });

    // 直接在图层上按文档坐标画一笔，位置必须还是文档坐标
    const context = ctx2d(store().activeLayer()!.canvas);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 4, 4);
    const [r, g] = pixelAt(1, 1);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(100);
  });

  it('旋转结果不含 NaN', () => {
    newDoc(8, 8);
    paintBlock(0, 0, 8, 8);
    store().beginTransform();
    setState({ angle: Math.PI / 5, skewY: 0.2 });

    const layer = store().activeLayer()!;
    const data = ctx2d(layer.canvas).getImageData(0, 0, 8, 8).data;
    expect(Array.from(data).some((value) => Number.isNaN(value))).toBe(false);
  });
});

describe('commitTransform 遇到旋转/斜切时栅格化', () => {
  function textLayer() {
    newDoc(32, 32);
    const layer = store().insertLayer('text', '文字')!;
    store().updateLayer(layer.id, {
      textData: {
        content: '甲',
        x: 4,
        y: 8,
        fontSize: 12,
        fontFamily: 'sans-serif',
        fontWeight: 400,
        color: '#000',
        bold: false,
        italic: false,
        underline: false,
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
      },
    });
    store().setActiveLayer(layer.id);
    return store().activeLayer()!;
  }

  it('旋转后文字图层的 textData 被摘掉', () => {
    const layer = textLayer();
    expect(layer.textData).toBeTruthy();

    store().beginTransform();
    store().updateTransform({
      ...createTransformState({ x: 0, y: 0, width: 32, height: 32 }),
      angle: Math.PI / 4,
    });
    store().commitTransform();

    expect(store().layers.find((item) => item.id === layer.id)!.textData).toBeUndefined();
  });

  it('斜切后同样栅格化', () => {
    const layer = textLayer();
    store().beginTransform();
    store().updateTransform({
      ...createTransformState({ x: 0, y: 0, width: 32, height: 32 }),
      skewX: 0.4,
    });
    store().commitTransform();

    expect(store().layers.find((item) => item.id === layer.id)!.textData).toBeUndefined();
  });

  it('纯缩放不栅格化，textData 照常按比例更新', () => {
    const layer = textLayer();
    store().beginTransform();
    // 比例从初始框推，不写死：框贴文字外框，尺寸取决于字体量出来多宽
    const from = store().transformSession!.originalRect;
    setRect({ x: 0, y: 0, width: from.width / 2, height: from.height / 2 });
    store().commitTransform();

    const text = store().layers.find((item) => item.id === layer.id)!.textData;
    expect(text).toBeTruthy();
    expect(text!.fontSize).toBeCloseTo(6);
  });

  it('栅格化也要写历史', () => {
    textLayer();
    const before = store().history.length;
    store().beginTransform();
    store().updateTransform({
      ...createTransformState({ x: 0, y: 0, width: 32, height: 32 }),
      angle: 0.5,
    });
    store().commitTransform();
    expect(store().history.length).toBe(before + 1);
  });

  it('旋转普通像素图层不受影响，不报错', () => {
    newDoc(32, 32);
    paintBlock();
    store().beginTransform();
    store().updateTransform({
      ...createTransformState({ x: 0, y: 0, width: 32, height: 32 }),
      angle: 0.5,
    });
    expect(() => store().commitTransform()).not.toThrow();
    expect(store().transformSession).toBeNull();
  });
});

describe('变换到画布外的像素不能丢', () => {
  /*
   * PS 里图层像素是「无界」的：把图层拖出画布再拖回来，出界那部分照样在。
   * 我们的图层画布是有界的，预览每帧都 clearCanvas + 重画，出界的部分
   * 会被画布边界裁掉。所以提交时必须把画布重新长到装得下变换后的整块内容，
   * 否则确认那一刻出界像素就永久没了，再拖回来只剩一半。
   */

  /** 按文档坐标读图层像素；落在画布外按透明处理 */
  function docPixel(x: number, y: number): number[] {
    const layer = store().activeLayer()!;
    const lx = x - layer.bounds.x;
    const ly = y - layer.bounds.y;
    if (lx < 0 || ly < 0 || lx >= layer.canvas.width || ly >= layer.canvas.height) {
      return [0, 0, 0, 0];
    }
    return Array.from(ctx2d(layer.canvas).getImageData(lx, ly, 1, 1).data);
  }

  const redAtDoc = (x: number, y: number) => docPixel(x, y)[0] > 200 && docPixel(x, y)[3] > 200;

  it('往右移出一半再确认，出界的一半仍然在图层里', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    // 整块往右挪 16，右半边（源 x 16..31）越过画布右边界
    setRect({ x: 16, y: 0, width: 32, height: 32 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    expect(layer.bounds).toEqual({ x: 16, y: 0, width: 32, height: 32 });
    // 出界的那半边落在文档 32..47，必须还是红的
    expect(redAtDoc(20, 16)).toBe(true);
    expect(redAtDoc(40, 16)).toBe(true);
  });

  it('移出画布再拖回来，整块图像完好', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);

    store().beginTransform();
    setRect({ x: 16, y: 0, width: 32, height: 32 });
    store().commitTransform();

    // 第二次会话：画布会先长到覆盖文档，再整体往左挪回原位
    store().beginTransform();
    const back = store().transformSession!.state.rect;
    setRect({ ...back, x: back.x - 16 });
    store().commitTransform();

    for (const x of [1, 10, 20, 30]) expect(redAtDoc(x, 16)).toBe(true);
  });

  it('旋转 45° 后画布长大到装下四个角', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    store().updateTransform({
      ...createTransformState({ x: 0, y: 0, width: 32, height: 32 }),
      angle: Math.PI / 4,
    });
    store().commitTransform();

    const layer = store().activeLayer()!;
    // 32 的正方形转 45° 后跨度 32√2 ≈ 45.3，画布必须长到这么大
    expect(layer.canvas.width).toBeGreaterThanOrEqual(45);
    expect(layer.bounds.x).toBeLessThan(0);
    // 菱形的左尖落在文档 x≈-6.6、y=16 上，这一点原来会被裁掉
    expect(redAtDoc(-5, 16)).toBe(true);
  });

  it('缩小时画布跟着收缩，不留一圈空白', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setRect({ x: 4, y: 4, width: 8, height: 8 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    expect(layer.bounds).toEqual({ x: 4, y: 4, width: 8, height: 8 });
  });

  it('确认后画布尺寸变了，撤销照样回得去', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().pushHistory('画方块');

    store().beginTransform();
    setRect({ x: 16, y: 0, width: 32, height: 32 });
    store().commitTransform();
    expect(store().activeLayer()!.bounds.x).toBe(16);

    store().undo();
    const layer = store().activeLayer()!;
    expect(layer.bounds).toEqual({ x: 0, y: 0, width: 32, height: 32 });
    expect(redAtDoc(30, 16)).toBe(true);
  });

  it('蒙版跟着图层一起变换，不会被拉变形', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    const id = store().activeLayerId!;
    store().addMask(id);
    // 蒙版左半黑（遮住），右半白（露出）
    const mask = store().activeLayer()!.mask!;
    const context = ctx2d(mask);
    context.fillStyle = '#000000';
    context.fillRect(0, 0, 16, 32);

    store().beginTransform();
    setRect({ x: 16, y: 0, width: 32, height: 32 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    // 蒙版尺寸必须与画布一致，否则合成时会被拉伸对齐、整体跑偏
    expect(layer.mask!.width).toBe(layer.canvas.width);
    expect(layer.mask!.height).toBe(layer.canvas.height);
    // 黑白分界原来在文档 x=16，整块右移 16 之后应当在 x=32
    const maskLuma = (docX: number) => {
      const lx = docX - layer.bounds.x;
      return ctx2d(layer.mask!).getImageData(lx, 16, 1, 1).data[0];
    };
    expect(maskLuma(20)).toBeLessThan(60);
    expect(maskLuma(40)).toBeGreaterThan(200);
  });

  it('取消变换时蒙版也还原', () => {
    newDoc(32, 32);
    const id = store().activeLayerId!;
    store().addMask(id);
    const mask = store().activeLayer()!.mask!;
    ctx2d(mask).fillStyle = '#000000';
    ctx2d(mask).fillRect(0, 0, 16, 32);

    store().beginTransform();
    setRect({ x: 16, y: 0, width: 32, height: 32 });
    store().cancelTransform();

    const after = store().activeLayer()!.mask!;
    expect(ctx2d(after).getImageData(4, 16, 1, 1).data[0]).toBeLessThan(60);
    expect(ctx2d(after).getImageData(20, 16, 1, 1).data[0]).toBeGreaterThan(200);
  });
});

describe('变换框贴住图层内容', () => {
  /*
   * PS 里 Ctrl+T 的框是贴着图层「有像素的那一块」画的，不是贴着图层画布。
   * 我们的画布在编辑前会先长到覆盖整个文档，如果框跟着画布走，
   * 缩小确认之后再按一次 Ctrl+T，框又回到整幅文档的大小——
   * 表现就是「框还停在第一次缩放前的位置」。
   */
  it('只有一小块内容时，框贴着内容而不是整幅画布', () => {
    newDoc(32, 32);
    paintBlock(4, 4, 8, 8);
    store().beginTransform();

    expect(store().transformSession!.state.rect).toEqual({ x: 4, y: 4, width: 8, height: 8 });
  });

  it('缩小确认后再开一次，框贴着缩小后的内容', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);

    store().beginTransform();
    setRect({ x: 8, y: 8, width: 16, height: 16 });
    store().commitTransform();

    store().beginTransform();
    expect(store().transformSession!.state.rect).toEqual({ x: 8, y: 8, width: 16, height: 16 });
  });

  it('框贴内容之后，缩放比例是按内容算的', () => {
    newDoc(32, 32);
    paintBlock(8, 8, 16, 16);
    store().beginTransform();
    // 把 16×16 的内容缩成 8×8，落在原处
    setRect({ x: 8, y: 8, width: 8, height: 8 });
    store().commitTransform();

    const layer = store().activeLayer()!;
    expect(layer.bounds).toEqual({ x: 8, y: 8, width: 8, height: 8 });
    expect(isRed(2, 2)).toBe(true);
  });

  it('整幅都有内容时行为不变，框仍是整幅画布', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();

    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });

  it('全透明图层没有内容，退回整幅画布，不至于开不出框', () => {
    newDoc(32, 32);
    store().beginTransform();

    expect(store().transformSession!.state.rect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});

describe('cancelTransform', () => {
  it('像素还原成开始变换前的样子', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 8, height: 8 });
    expect(isRed(20, 20)).toBe(false);

    store().cancelTransform();
    expect(isRed(20, 20)).toBe(true);
    expect(isRed(2, 2)).toBe(true);
  });

  it('取消后会话清空', () => {
    newDoc(32, 32);
    store().beginTransform();
    store().cancelTransform();
    expect(store().transformSession).toBeNull();
  });

  it('取消不写历史', () => {
    newDoc(32, 32);
    paintBlock();
    const before = store().history.length;
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 8, height: 8 });
    store().cancelTransform();
    expect(store().history.length).toBe(before);
  });

  it('没有会话时调用安全', () => {
    newDoc(32, 32);
    expect(() => store().cancelTransform()).not.toThrow();
  });

  /*
   * 快照是按内容裁过的，只覆盖 originalRect 那一块。
   * 还原时画到 (0,0) 会把内容整体搬到画布左上角——取消一次图像就跳位了。
   */
  it('内容不在画布左上角时，取消也回到原位', () => {
    newDoc(32, 32);
    paintBlock(12, 12, 8, 8);

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 32, height: 32 });
    store().cancelTransform();

    expect(isRed(14, 14)).toBe(true);
    // 原来空着的地方必须还是空的
    expect(isRed(2, 2)).toBe(false);
    expect(isRed(28, 28)).toBe(false);
  });

  it('取消后蒙版内容外的像素也不丢', () => {
    newDoc(32, 32);
    paintBlock(12, 12, 8, 8);
    const id = store().activeLayerId!;
    store().addMask(id);
    // 在图层内容之外涂一块黑：这块盖在透明区上看不出效果，但是用户的数据
    const mask = store().activeLayer()!.mask!;
    ctx2d(mask).fillStyle = '#000000';
    ctx2d(mask).fillRect(0, 0, 4, 4);

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 32, height: 32 });
    store().cancelTransform();

    const after = store().activeLayer()!.mask!;
    expect(ctx2d(after).getImageData(2, 2, 1, 1).data[0]).toBeLessThan(60);
    // 内容外其余地方仍是白的（露出），没被裁过的快照抹成透明
    expect(ctx2d(after).getImageData(28, 28, 1, 1).data[0]).toBeGreaterThan(200);
  });

  it('取消后可以重新开一次变换', () => {
    newDoc(32, 32);
    paintBlock(0, 0, 32, 32);
    store().beginTransform();
    setRect({ x: 0, y: 0, width: 8, height: 8 });
    store().cancelTransform();

    store().beginTransform();
    setRect({ x: 0, y: 0, width: 16, height: 16 });
    expect(isRed(2, 2)).toBe(true);
    expect(isRed(20, 20)).toBe(false);
  });
});
