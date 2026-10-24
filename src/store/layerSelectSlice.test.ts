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

/** 建一个 8x8 文档，返回其唯一图层 id */
function newDoc(): string {
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

/** 新增一个像素图层并返回 id */
function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

const selectedIds = () => store().selectedLayers().map((l) => l.id);

beforeEach(() => {
  store().closeDoc();
});

describe('selectLayer', () => {
  it('新建文档后选中集合就是那一个图层', () => {
    const bg = newDoc();
    expect(selectedIds()).toEqual([bg]);
    expect(store().activeLayerId).toBe(bg);
  });

  it('Ctrl+点击加选，活动层跟到新点的那个', () => {
    const bg = newDoc();
    const b = addLayer();
    store().selectLayer(bg, 'toggle');
    expect(selectedIds().sort()).toEqual([bg, b].sort());
    expect(store().activeLayerId).toBe(bg);
  });

  it('新建图层会把上一轮的多选收掉', () => {
    const bg = newDoc();
    const b = addLayer();
    store().selectLayer(bg, 'toggle');
    expect(selectedIds()).toHaveLength(2);
    // addLayer 只改 activeLayerId，选中集合靠 normalize 自动退回单选
    const c = addLayer();
    expect(selectedIds()).toEqual([c]);
    expect(b).not.toBe(c);
  });

  it('撤销之后选中集合不会指向已经消失的图层', () => {
    const bg = newDoc();
    const b = addLayer();
    // addLayer 之后 b 已是唯一选中项，加选背景层才凑够两个
    store().selectLayer(bg, 'toggle');
    expect(selectedIds()).toHaveLength(2);
    store().undo();
    // b 已经被撤销掉了，集合里不能还留着它
    expect(store().layers.some((l) => l.id === b)).toBe(false);
    expect(selectedIds()).not.toContain(b);
  });
});

describe('批量属性', () => {
  it('setSelectedOpacity 改所有选中层', () => {
    const bg = newDoc();
    const b = addLayer();
    store().selectLayer(bg, 'toggle');
    store().setSelectedOpacity(40);
    expect(store().layers.map((l) => l.opacity)).toEqual([40, 40]);
    expect(b).toBeTruthy();
  });

  it('setSelectedOpacity 不碰未选中的层', () => {
    newDoc();
    const b = addLayer();
    // 只选 b
    store().selectLayer(b);
    store().setSelectedOpacity(20);
    const byId = new Map(store().layers.map((l) => [l.id, l.opacity]));
    expect(byId.get(b)).toBe(20);
    expect([...byId.values()].filter((v) => v === 100)).toHaveLength(1);
  });

  it('setSelectedBlend 改所有选中层并记一条历史', () => {
    const bg = newDoc();
    addLayer();
    store().selectLayer(bg, 'toggle');
    const before = store().history.length;
    store().setSelectedBlend('multiply');
    expect(store().layers.every((l) => l.blendMode === 'multiply')).toBe(true);
    expect(store().history.length).toBe(before + 1);
  });

  it('setSelectedColor 打标记与清除都进历史', () => {
    newDoc();
    store().setSelectedColor('#ed1c24');
    expect(store().layers[0].color).toBe('#ed1c24');
    store().setSelectedColor(undefined);
    expect(store().layers[0].color).toBeUndefined();
  });

  it('颜色标记能被撤销', () => {
    newDoc();
    store().setSelectedColor('#00a651');
    store().undo();
    expect(store().layers[0].color).toBeUndefined();
  });
});

describe('deleteSelectedLayers', () => {
  it('一次删掉多层，只记一条历史', () => {
    const bg = newDoc();
    const b = addLayer();
    const c = addLayer();
    store().selectLayer(b);
    store().selectLayer(c, 'toggle');
    const before = store().history.length;
    store().deleteSelectedLayers();
    expect(store().layers.map((l) => l.id)).toEqual([bg]);
    expect(store().history.length).toBe(before + 1);
  });

  it('删完不剩像素图层时整体拒绝', () => {
    const bg = newDoc();
    store().selectLayer(bg);
    store().deleteSelectedLayers();
    // 一个都不能删掉
    expect(store().layers).toHaveLength(1);
  });

  it('删组连子图层一起删', () => {
    newDoc();
    const b = addLayer();
    const group = store().groupLayers([b]);
    expect(group).not.toBeNull();
    store().selectLayer(group!.id);
    store().deleteSelectedLayers();
    expect(store().layers.some((l) => l.id === b)).toBe(false);
    expect(store().layers.some((l) => l.id === group!.id)).toBe(false);
  });

  it('删完之后活动层在选中集合里', () => {
    newDoc();
    const b = addLayer();
    store().selectLayer(b);
    store().deleteSelectedLayers();
    expect(selectedIds()).toEqual([store().activeLayerId]);
  });

  it('删掉正在单独显示的图层时退出单独显示', () => {
    newDoc();
    const b = addLayer();
    store().toggleSolo(b);
    expect(store().soloLayerId).toBe(b);
    store().selectLayer(b);
    store().deleteSelectedLayers();
    expect(store().soloLayerId).toBeNull();
  });
});

describe('groupSelectedLayers', () => {
  it('把选中的多层打成一组', () => {
    const bg = newDoc();
    const b = addLayer();
    store().selectLayer(bg);
    store().selectLayer(b, 'toggle');
    store().groupSelectedLayers();
    const group = store().layers.find((l) => l.type === 'group');
    expect(group).toBeTruthy();
    expect(store().layers.filter((l) => l.parentId === group!.id)).toHaveLength(2);
  });

  it('编组后选中的是新组', () => {
    const bg = newDoc();
    store().selectLayer(bg);
    store().groupSelectedLayers();
    const group = store().layers.find((l) => l.type === 'group');
    expect(selectedIds()).toEqual([group!.id]);
  });
});

describe('toggleSolo', () => {
  it('点同一层两次回到未 solo', () => {
    newDoc();
    const b = addLayer();
    store().toggleSolo(b);
    expect(store().soloLayerId).toBe(b);
    store().toggleSolo(b);
    expect(store().soloLayerId).toBeNull();
  });

  it('点另一层直接换过去', () => {
    const bg = newDoc();
    const b = addLayer();
    store().toggleSolo(b);
    store().toggleSolo(bg);
    expect(store().soloLayerId).toBe(bg);
  });

  it('solo 不改图层的 visible，也不进历史', () => {
    newDoc();
    const b = addLayer();
    const before = store().history.length;
    store().toggleSolo(b);
    // visible 一旦被改就会随历史快照走，退出 solo 后撤销会让图层莫名消失
    expect(store().layers.every((l) => l.visible)).toBe(true);
    expect(store().history.length).toBe(before);
  });

  it('目标不存在时不进入 solo', () => {
    newDoc();
    store().toggleSolo('gone');
    expect(store().soloLayerId).toBeNull();
  });
});
