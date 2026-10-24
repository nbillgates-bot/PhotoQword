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
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

const clippedOf = (id: string) => store().layers.find((l) => l.id === id)?.clipped;

beforeEach(() => {
  store().closeDoc();
});

describe('toggleClipped', () => {
  it('给活动层加剪贴标记', () => {
    newDoc();
    const top = addLayer();
    store().toggleClipped();
    expect(clippedOf(top)).toBe(true);
  });

  it('再调一次释放', () => {
    newDoc();
    const top = addLayer();
    store().toggleClipped();
    store().toggleClipped();
    expect(clippedOf(top)).toBe(false);
  });

  it('同级最底那层不能创建，给出提示', () => {
    const bg = newDoc();
    store().toggleClipped();
    expect(clippedOf(bg)).toBeFalsy();
    expect(store().toast?.kind).toBe('error');
  });

  it('多选时按活动层的状态整批设成同一个值，不是逐层取反', () => {
    newDoc();
    const a = addLayer();
    const b = addLayer();
    // 先只给 a 打标记
    store().selectLayer(a);
    store().toggleClipped();
    expect(clippedOf(a)).toBe(true);

    // 选 a + b，活动层是 a（已剪贴），整批应当被释放
    store().selectLayer(b);
    store().selectLayer(a, 'toggle');
    expect(store().activeLayerId).toBe(a);
    store().toggleClipped();
    expect(clippedOf(a)).toBe(false);
    expect(clippedOf(b)).toBe(false);
  });

  it('多选里混着无法剪贴的最底层时，只跳过它，其余照做', () => {
    const bg = newDoc();
    const top = addLayer();
    store().selectLayer(top);
    store().selectLayer(bg, 'toggle');
    // 活动层是 bg（未剪贴），所以整批意图是"创建"
    store().toggleClipped();
    expect(clippedOf(bg)).toBeFalsy();
    expect(clippedOf(top)).toBe(true);
  });

  it('没有图层时什么都不做', () => {
    expect(() => store().toggleClipped()).not.toThrow();
  });

  it('能被撤销', () => {
    newDoc();
    const top = addLayer();
    store().toggleClipped();
    expect(clippedOf(top)).toBe(true);
    store().undo();
    expect(clippedOf(top)).toBeFalsy();
  });

  it('撤销释放之后标记回来', () => {
    newDoc();
    const top = addLayer();
    store().toggleClipped();
    store().toggleClipped();
    expect(clippedOf(top)).toBe(false);
    store().undo();
    expect(clippedOf(top)).toBe(true);
  });
});

describe('toggleLayerClipped', () => {
  it('只动指定的那一层，不改选中集合', () => {
    newDoc();
    const a = addLayer();
    const b = addLayer();
    expect(store().activeLayerId).toBe(b);
    store().toggleLayerClipped(a);
    expect(clippedOf(a)).toBe(true);
    expect(clippedOf(b)).toBeFalsy();
    // 选中集合不受影响，与 PS 里 Alt+点分界线一致
    expect(store().activeLayerId).toBe(b);
  });

  it('同级最底那层拒绝并提示', () => {
    const bg = newDoc();
    addLayer();
    store().toggleLayerClipped(bg);
    expect(clippedOf(bg)).toBeFalsy();
    expect(store().toast?.kind).toBe('error');
  });

  it('图层不存在时什么都不做', () => {
    newDoc();
    expect(() => store().toggleLayerClipped('nope')).not.toThrow();
  });

  it('已剪贴的随时能释放，即使被移到了栈底', () => {
    newDoc();
    const top = addLayer();
    store().toggleLayerClipped(top);
    // 移到最底：剪贴关系失效，但标记还在，应当仍能释放
    store().reorderLayer(top, 'bottom');
    store().toggleLayerClipped(top);
    expect(clippedOf(top)).toBe(false);
  });
});
