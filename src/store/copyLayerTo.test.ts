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

const ids = () => store().layers.map((layer) => layer.id);
const at = (id: string) => store().layers.find((layer) => layer.id === id)!;

beforeEach(() => {
  store().closeDoc();
});

/*
 * PS 里在图层面板按住 Alt 拖动图层 = 复制一份并落到松手的位置。
 * 复制和落位必须是一步历史：分成「复制」+「移动」两步的话，
 * 撤销一次只退回到复制完还没落位的中间状态，那个状态用户从没见过。
 */
describe('copyLayerTo', () => {
  it('复制并落到指定位置', () => {
    const bg = newDoc();
    const a = addLayer();

    const newId = store().copyLayerTo(bg, null, 2);

    expect(newId).toBeTruthy();
    expect(ids()).toEqual([bg, a, newId]);
  });

  it('副本是深拷贝，改它不影响原图层', () => {
    const bg = newDoc();
    ctx2d(at(bg).canvas).fillRect(0, 0, 2, 2);

    const newId = store().copyLayerTo(bg, null, 1)!;

    expect(at(newId).canvas).not.toBe(at(bg).canvas);
    ctx2d(at(newId).canvas).clearRect(0, 0, 4, 4);
    expect(ctx2d(at(bg).canvas).getImageData(0, 0, 1, 1).data[3]).toBe(255);
  });

  it('只记一条历史，撤销一次就回到复制前', () => {
    const bg = newDoc();
    addLayer();
    const before = ids();

    store().copyLayerTo(bg, null, 2);
    store().undo();

    expect(ids()).toEqual(before);
  });

  it('副本成为活动图层，与 PS 一致', () => {
    const bg = newDoc();
    const newId = store().copyLayerTo(bg, null, 1)!;
    expect(store().activeLayerId).toBe(newId);
  });

  it('源图层不存在时什么都不做', () => {
    const bg = newDoc();
    expect(store().copyLayerTo('nope', null, 0)).toBeNull();
    expect(ids()).toEqual([bg]);
  });

  it('能复制进组里', () => {
    const bg = newDoc();
    const group = store().addGroup();
    if (!group) throw new Error('建组失败');

    const newId = store().copyLayerTo(bg, group.id, 0)!;

    expect(at(newId).parentId).toBe(group.id);
  });

  /*
   * 复制组要连整棵子树落到新位置。子图层如果留在原处，
   * 副本组就是个空壳，而那些子副本会挂在树外。
   */
  it('复制组时整棵子树跟着走', () => {
    newDoc();
    const kid = addLayer();
    const group = store().addGroup();
    if (!group) throw new Error('建组失败');
    store().moveLayerTo(kid, group.id, 0);

    const newId = store().copyLayerTo(group.id, null, 0)!;

    const copyKids = store().layers.filter((layer) => layer.parentId === newId);
    expect(copyKids).toHaveLength(1);
    // 原组里的那一层还在原组下
    expect(store().layers.filter((layer) => layer.parentId === group.id)).toHaveLength(1);
  });

  it('不能把组复制进它自己的副本之外的自己里（自环）', () => {
    newDoc();
    const group = store().addGroup();
    if (!group) throw new Error('建组失败');

    // 落点父级就是源组本身：副本是新 id，放进源组里是合法的
    const newId = store().copyLayerTo(group.id, group.id, 0);

    expect(newId).toBeTruthy();
    expect(at(newId!).parentId).toBe(group.id);
  });
});
