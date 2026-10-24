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

/**
 * 增量历史的集成测试。
 * 这些路径老的整存实现天然正确（因为整幅深拷贝），换成增量后
 * 每一条都可能出错，所以必须单独钉住。
 */

function freshDoc(width = 8, height = 8): void {
  /*
   * 背景图层名按创建时的界面语言取值，所以这里必须把语言钉死 ——
   * 否则断言会跟着跑测试机器的浏览器语言变（jsdom 给的是 en-US）。
   */
  useEditorStore.getState().setLocale('zh-CN');
  useEditorStore.getState().createDoc({ name: '测试', width, height, background: 'white' });
}

function paintOn(layerId: string, color: string, x = 0, y = 0, w = 4, h = 4): void {
  const layer = useEditorStore.getState().layers.find((item) => item.id === layerId);
  if (!layer) throw new Error(`找不到图层 ${layerId}`);
  const context = ctx2d(layer.canvas);
  context.fillStyle = color;
  context.fillRect(x, y, w, h);
}

function pixelOn(layerId: string, x = 0, y = 0): number[] {
  const layer = useEditorStore.getState().layers.find((item) => item.id === layerId);
  if (!layer) throw new Error(`找不到图层 ${layerId}`);
  const d = ctx2d(layer.canvas).getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

const store = () => useEditorStore.getState();
const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

describe('增量历史：图层增删', () => {
  beforeEach(() => store().closeDoc());

  it('撤销新增图层后图层消失，重做后回来', () => {
    freshDoc();
    const added = store().addLayer('raster', '新图层');
    expect(added).not.toBeNull();
    expect(store().layers).toHaveLength(2);

    store().undo();
    expect(store().layers).toHaveLength(1);
    store().redo();
    expect(store().layers).toHaveLength(2);
    expect(store().layers[1].name).toBe('新图层');
  });

  it('撤销删除图层后像素完整回来', () => {
    freshDoc();
    const added = store().addLayer('raster', '要删的');
    const id = added!.id;
    paintOn(id, '#ff0000');
    store().pushHistory('涂红');

    store().deleteLayer(id);
    expect(store().layers.find((l) => l.id === id)).toBeUndefined();

    store().undo();
    const revived = store().layers.find((l) => l.id === id);
    expect(revived).toBeDefined();
    // 关键：删除再撤销，像素不能丢
    expect(pixelOn(id, 1, 1)).toEqual(RED);
  });

  it('多次增删后历史仍然一致', () => {
    freshDoc();
    const a = store().addLayer('raster', 'A')!.id;
    paintOn(a, '#ff0000');
    store().pushHistory('涂 A');
    const b = store().addLayer('raster', 'B')!.id;
    paintOn(b, '#008000');
    store().pushHistory('涂 B');
    store().deleteLayer(a);

    expect(store().layers.map((l) => l.name)).toEqual(['背景', 'B']);
    store().undo(); // 撤销删除 A
    expect(store().layers.map((l) => l.name)).toEqual(['背景', 'A', 'B']);
    expect(pixelOn(a, 1, 1)).toEqual(RED);
    expect(pixelOn(b, 1, 1)).toEqual([0, 128, 0, 255]);
  });
});

describe('增量历史：图层属性与顺序', () => {
  beforeEach(() => store().closeDoc());

  it('不透明度改动能撤销（非像素属性走绝对存储）', () => {
    freshDoc();
    const id = store().layers[0].id;
    // setLayerOpacity 自身不压历史：它对应滑块拖动，由 UI 在 onCommit 时提交一次
    store().setLayerOpacity(id, 40);
    store().pushHistory('修改不透明度');
    expect(store().layers[0].opacity).toBe(40);

    store().undo();
    expect(store().layers[0].opacity).toBe(100);
    store().redo();
    expect(store().layers[0].opacity).toBe(40);
  });

  it('可见性与混合模式改动能各自撤销一步', () => {
    freshDoc();
    const id = store().layers[0].id;
    store().updateLayer(id, { visible: false });
    store().pushHistory('隐藏图层');
    store().setLayerBlend(id, 'multiply'); // 这个自己会压历史

    expect(store().history).toHaveLength(3);
    store().undo();
    expect(store().layers[0].blendMode).toBe('normal');
    expect(store().layers[0].visible).toBe(false); // 只退了混合模式
    store().undo();
    expect(store().layers[0].visible).toBe(true);
  });

  it('图层顺序调整能撤销', () => {
    freshDoc();
    store().addLayer('raster', 'A');
    store().addLayer('raster', 'B');
    const before = store().layers.map((l) => l.name);

    store().reorderLayer(store().layers[2].id, 'bottom');
    expect(store().layers.map((l) => l.name)).not.toEqual(before);
    store().undo();
    expect(store().layers.map((l) => l.name)).toEqual(before);
  });
});

describe('增量历史：像素隔离', () => {
  beforeEach(() => store().closeDoc());

  it('只改一个图层时，另一个图层的像素不受影响', () => {
    freshDoc();
    const bg = store().layers[0].id;
    const top = store().addLayer('raster', '上层')!.id;
    paintOn(bg, '#ff0000');
    store().pushHistory('涂背景');
    paintOn(top, '#008000');
    store().pushHistory('涂上层');

    store().undo(); // 撤销"涂上层"
    expect(pixelOn(top, 1, 1)).toEqual([0, 0, 0, 0]); // 上层回到透明
    expect(pixelOn(bg, 1, 1)).toEqual(RED); // 背景不该被动到
  });

  it('局部涂改撤销后，同图层其他区域不受影响', () => {
    freshDoc(16, 16);
    const bg = store().layers[0].id;
    paintOn(bg, '#ff0000', 0, 0, 4, 4);
    store().pushHistory('涂左上');
    paintOn(bg, '#008000', 10, 10, 4, 4);
    store().pushHistory('涂右下');

    store().undo();
    expect(pixelOn(bg, 11, 11)).toEqual(WHITE); // 右下撤销了
    expect(pixelOn(bg, 1, 1)).toEqual(RED); // 左上还在
  });

  it('hint 命中时结果与全扫一致', () => {
    freshDoc(16, 16);
    const bg = store().layers[0].id;
    const top = store().addLayer('raster', '上层')!.id;
    paintOn(top, '#ff0000', 2, 2, 3, 3);
    store().pushHistory('只改上层', { layerIds: [top] });

    store().undo();
    expect(pixelOn(top, 3, 3)).toEqual([0, 0, 0, 0]);
    store().redo();
    expect(pixelOn(top, 3, 3)).toEqual(RED);
    expect(pixelOn(bg, 3, 3)).toEqual(WHITE);
  });
});

describe('增量历史：文档尺寸变化', () => {
  beforeEach(() => store().closeDoc());

  it('改画布大小后撤销，尺寸和像素都回退', () => {
    freshDoc(8, 8);
    const bg = store().layers[0].id;
    paintOn(bg, '#ff0000', 0, 0, 8, 8);
    store().pushHistory('涂满');

    store().resizeCanvasTo(16, 16, 'top-left');
    expect(store().layers[0].canvas.width).toBe(16);

    store().undo();
    expect(store().layers[0].canvas.width).toBe(8);
    expect(pixelOn(bg, 4, 4)).toEqual(RED);
  });

  it('缩放图像后撤销能回到原尺寸', () => {
    freshDoc(8, 8);
    store().resizeImage(4, 4);
    expect(store().layers[0].canvas.width).toBe(4);
    store().undo();
    expect(store().layers[0].canvas.width).toBe(8);
  });
});
