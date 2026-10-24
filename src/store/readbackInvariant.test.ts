/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { createReadbackCanvas, ctx2d } from '../engine/canvasUtils';
import { rectSelection } from '../engine/selection';
import { trackReadbackCanvases } from '../engine/testUtils';
import type { TextData } from '../types';

/**
 * 不变量：凡是挂在图层上的画布（layer.canvas / layer.mask），
 * 都必须在创建时就声明 willReadFrequently。
 *
 * 理由是 getContext('2d', options) 的 options 只有第一次调用生效。
 * 图层画布几乎都是「先 drawImage 填内容、后被历史差分反复 getImageData」，
 * 等要读的时候再声明已经晚了，Blink 会按图层数刷同样多条 readback 警告
 * （90 层的 PSD 就是 90 条），而控制台刷警告是交付红线。
 *
 * 用插桩判定而不是查画布属性：node-canvas 没实现 getContextAttributes。
 */

const store = () => useEditorStore.getState();

let tracker: ReturnType<typeof trackReadbackCanvases>;

beforeEach(() => {
  useEditorStore.getState().closeDoc();
  tracker = trackReadbackCanvases();
});

afterEach(() => {
  tracker.stop();
});

/** 列出所有没被声明的图层画布，附上图层名和是哪一张，便于定位 */
function offenders(): string[] {
  const bad: string[] = [];
  for (const layer of store().layers) {
    if (!tracker.isReadback(layer.canvas)) bad.push(`${layer.name}(${layer.type}).canvas`);
    if (layer.mask && !tracker.isReadback(layer.mask)) {
      bad.push(`${layer.name}(${layer.type}).mask`);
    }
  }
  return bad;
}

const TEXT: TextData = {
  content: '文字内容',
  fontFamily: 'sans-serif',
  fontSize: 24,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#000000',
  lineHeight: 1.2,
  letterSpacing: 0,
  x: 10,
  y: 30,
};

/** 建一个有内容的多图层文档 */
function docWithLayers(count = 3): void {
  store().createDoc({ name: '测试', width: 60, height: 60, background: 'white' });
  for (let i = 0; i < count; i += 1) {
    const layer = store().addLayer('raster', `层${i}`);
    if (!layer) throw new Error('建图层失败');
    const context = ctx2d(layer.canvas);
    context.fillStyle = `hsl(${i * 40} 70% 50%)`;
    context.fillRect(i * 4, i * 4, 20, 20);
  }
}

describe('图层画布的 readback 不变量', () => {
  it('新建文档的背景图层', () => {
    store().createDoc({ name: '测试', width: 40, height: 40, background: 'white' });
    expect(offenders()).toEqual([]);
  });

  it('addLayer 建出来的图层', () => {
    docWithLayers(3);
    expect(offenders()).toEqual([]);
  });

  it('加蒙版之后', () => {
    docWithLayers(2);
    store().addMask(store().layers[1].id);
    expect(offenders()).toEqual([]);
  });

  it('复制图层之后', () => {
    docWithLayers(2);
    store().duplicateLayer(store().layers[1].id);
    expect(offenders()).toEqual([]);
  });

  it('新建组之后', () => {
    docWithLayers(2);
    store().groupLayers([store().layers[1].id]);
    expect(offenders()).toEqual([]);
  });

  it('合并组之后', () => {
    docWithLayers(2);
    const group = store().groupLayers([store().layers[1].id]);
    store().mergeGroup(group!.id);
    expect(offenders()).toEqual([]);
  });

  /*
   * 这一条对着的是 expandToCover：图层画布小于文档时编辑才会真的换画布。
   * PSD 里的文字图层就是这样（画布只有文字框大小、带偏移），
   * 而 addLayer 建出来的画布本来就是文档尺寸，扩张分支根本不会走到。
   * 用 createReadbackCanvas 造这张小画布，模仿 psdLayers 的做法，
   * 免得用例因为夹具自己没声明而误报。
   */
  it('小画布图层编辑之后（画布会被 expandToCover 换掉）', () => {
    docWithLayers(1);
    const layer = store().addLayer('text', '文字')!;
    const small = createReadbackCanvas(20, 12);
    ctx2d(small).fillRect(0, 0, 20, 12);
    store().updateLayer(layer.id, {
      canvas: small,
      bounds: { x: 8, y: 6, width: 20, height: 12 },
      textData: TEXT,
    });

    store().enterTextEdit(layer.id);
    store().updateTextDraft(layer.id, { content: '改一段新文字' });
    store().exitTextEdit();

    expect(offenders()).toEqual([]);
  });

  it('栅格化文字图层之后', () => {
    docWithLayers(1);
    const layer = store().addLayer('text', '文字')!;
    store().updateLayer(layer.id, { textData: TEXT });
    store().updateTextLayer(layer.id, {});
    store().rasterizeLayer(layer.id);
    expect(offenders()).toEqual([]);
  });

  it('撤销一次删除之后（图层是从影子复活的）', () => {
    docWithLayers(3);
    store().pushHistory('基线');
    const doomed = store().layers[2].id;
    store().deleteLayer(doomed);
    store().undo();
    expect(store().layers.map((item) => item.id)).toContain(doomed);
    expect(offenders()).toEqual([]);
  });

  it('撤销一次「删除带蒙版的图层」之后', () => {
    docWithLayers(2);
    const target = store().layers[1].id;
    store().addMask(target);
    store().pushHistory('基线');
    store().deleteLayer(target);
    store().undo();
    expect(offenders()).toEqual([]);
  });

  it('调整图像大小 / 画布大小 / 旋转 / 翻转之后', () => {
    docWithLayers(2);
    store().resizeImage(40, 40);
    store().resizeCanvasTo(50, 50, 'center');
    store().rotateDoc(90);
    store().flipDoc('horizontal');
    expect(offenders()).toEqual([]);
  });

  it('反复压历史与撤销重做之后', () => {
    docWithLayers(3);
    for (let i = 0; i < 4; i += 1) {
      const top = store().layers[store().layers.length - 1];
      const context = ctx2d(top.canvas);
      context.fillStyle = '#123456';
      context.fillRect(i * 2, i * 2, 8, 8);
      store().pushHistory(`第 ${i} 步`, { layerIds: [top.id] });
    }
    for (let i = 0; i < 6; i += 1) store().undo();
    for (let i = 0; i < 6; i += 1) store().redo();
    expect(offenders()).toEqual([]);
  });

  it('向下合并与拼合图像之后', () => {
    docWithLayers(3);
    store().mergeDown(store().layers[2].id);
    expect(offenders()).toEqual([]);
    store().flattenAll();
    expect(offenders()).toEqual([]);
  });

  it('确认自由变换之后（画布会被变换结果换掉）', () => {
    docWithLayers(2);
    store().setActiveLayer(store().layers[1].id);
    store().setSelection(rectSelection(60, 60, { x: 6, y: 6, width: 24, height: 24 }));
    store().beginTransform();
    store().updateTransform({
      ...store().transformSession!.state,
      rect: { x: 10, y: 10, width: 30, height: 30 },
    });
    store().commitTransform();
    expect(offenders()).toEqual([]);
  });

  it('拷贝选区再粘贴之后', () => {
    docWithLayers(2);
    store().setActiveLayer(store().layers[1].id);
    store().setSelection(rectSelection(60, 60, { x: 4, y: 4, width: 20, height: 20 }));
    store().copySelection();
    store().pasteClipboard();
    expect(offenders()).toEqual([]);
  });
});
