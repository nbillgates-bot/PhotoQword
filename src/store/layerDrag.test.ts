/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';

const store = () => useEditorStore.getState();

function newDoc(): string {
  store().createDoc({ name: '测试', width: 4, height: 4, background: 'white' });
  return store().layers[0].id;
}

function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

beforeEach(() => {
  store().closeDoc();
});

/*
 * PS 里图层可以直接拖到面板底部的垃圾桶上删除。
 * 拖拽起点在 LayerList、垃圾桶在 LayerToolbar，两者是兄弟组件，
 * 按 CLAUDE.md §1.3 不能互相 import，所以正在拖的图层 id 放在 store 里。
 */
describe('拖到垃圾桶删除图层', () => {
  it('开始拖时记下 id，结束时清掉', () => {
    newDoc();
    const id = addLayer();

    store().beginLayerDrag(id);
    expect(store().draggingLayerId).toBe(id);

    store().endLayerDrag();
    expect(store().draggingLayerId).toBeNull();
  });

  it('拖单个图层过去，只删那一个', () => {
    const bg = newDoc();
    const a = addLayer();
    const b = addLayer();
    store().selectLayer(b);

    store().beginLayerDrag(a);
    store().dropLayerToTrash();

    const ids = store().layers.map((layer) => layer.id);
    expect(ids).toEqual([bg, b]);
  });

  it('删完要清掉拖拽状态，否则垃圾桶一直亮着', () => {
    newDoc();
    const a = addLayer();

    store().beginLayerDrag(a);
    store().dropLayerToTrash();

    expect(store().draggingLayerId).toBeNull();
  });

  /*
   * PS：拖的那层本来就在多选集合里，就整批删；不在集合里则只删被拖的那一个
   * （拖拽本身不改变选中状态）。
   */
  it('拖的是多选里的一员，整批删', () => {
    const bg = newDoc();
    const a = addLayer();
    const b = addLayer();
    store().selectLayer(a);
    store().selectLayer(b, 'toggle');

    store().beginLayerDrag(a);
    store().dropLayerToTrash();

    expect(store().layers.map((layer) => layer.id)).toEqual([bg]);
  });

  it('拖的层不在多选里，只删它，选中的那些留着', () => {
    const bg = newDoc();
    const a = addLayer();
    const b = addLayer();
    store().selectLayer(b);

    store().beginLayerDrag(a);
    store().dropLayerToTrash();

    expect(store().layers.map((layer) => layer.id)).toEqual([bg, b]);
    expect(store().activeLayerId).not.toBe(a);
  });

  it('没在拖就调用，什么都不该发生', () => {
    const bg = newDoc();
    const a = addLayer();

    store().dropLayerToTrash();

    expect(store().layers.map((layer) => layer.id)).toEqual([bg, a]);
  });

  it('删到只剩一个图层时拒绝，图层还在', () => {
    const bg = newDoc();

    store().beginLayerDrag(bg);
    store().dropLayerToTrash();

    expect(store().layers.map((layer) => layer.id)).toEqual([bg]);
  });
});

/*
 * PS 里把图层拖到面板底部的「新建图层」按钮上就是复制一份。
 * 我们的面板把新建和复制拆成了两个按钮，两个都收这个拖拽落点。
 * 生效范围和垃圾桶一致：拖的层在多选集合里就整批复制，否则只复制它自己。
 */
describe('拖到复制按钮复制图层', () => {
  it('拖单个图层过去，多出一个副本', () => {
    const bg = newDoc();
    const a = addLayer();

    store().beginLayerDrag(a);
    store().dropLayerToCopy();

    const ids = store().layers.map((layer) => layer.id);
    expect(ids).toHaveLength(3);
    // 副本插在原层上方
    expect(ids.slice(0, 2)).toEqual([bg, a]);
  });

  it('复制完要清掉拖拽状态，否则按钮一直亮着', () => {
    newDoc();
    const a = addLayer();

    store().beginLayerDrag(a);
    store().dropLayerToCopy();

    expect(store().draggingLayerId).toBeNull();
  });

  it('拖的是多选里的一员，整批复制', () => {
    newDoc();
    const a = addLayer();
    const b = addLayer();
    store().selectLayer(a);
    store().selectLayer(b, 'toggle');

    store().beginLayerDrag(a);
    store().dropLayerToCopy();

    // 原来 3 个，复制 2 个，共 5 个
    expect(store().layers).toHaveLength(5);
  });

  it('拖的层不在多选里，只复制它', () => {
    newDoc();
    const a = addLayer();
    const b = addLayer();
    store().selectLayer(b);

    store().beginLayerDrag(a);
    store().dropLayerToCopy();

    expect(store().layers).toHaveLength(4);
  });

  it('没在拖就调用，什么都不该发生', () => {
    const bg = newDoc();
    const a = addLayer();

    store().dropLayerToCopy();

    expect(store().layers.map((layer) => layer.id)).toEqual([bg, a]);
  });

  it('复制的是组，组内图层跟着复制', () => {
    newDoc();
    const a = addLayer();
    const group = store().groupLayers([a]);
    if (!group) throw new Error('建组失败');
    // 背景 + 组 + 组内一层 = 3
    expect(store().layers).toHaveLength(3);

    store().beginLayerDrag(group.id);
    store().dropLayerToCopy();

    // 再多出一个组和它的一个子图层
    expect(store().layers).toHaveLength(5);
  });
});
