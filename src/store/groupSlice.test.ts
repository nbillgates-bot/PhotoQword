/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { childrenOf, descendantIds } from '../engine/layerTree';

const store = () => useEditorStore.getState();

/** 建一个 8x8 文档，返回其唯一图层 id */
function newDoc(): string {
  /*
   * 组名与「副本」后缀都按界面语言取（I18N.md §3），所以要钉死语言 ——
   * jsdom 的 navigator.language 是 en-US，不钉的话副本会叫「组1 copy」。
   */
  store().setLocale('zh-CN');
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

/** 新增一个像素图层并返回 id */
function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

/** 当前图层结构，压成 "id:parentId" 便于断言 */
const shape = () =>
  store()
    .layers.map((l) => `${l.name}:${l.parentId ?? '-'}`)
    .join(' ');

beforeEach(() => {
  store().closeDoc();
});

describe('addGroup', () => {
  it('新建组默认是穿透，且不含像素', () => {
    newDoc();
    const group = store().addGroup('测试组');
    expect(group).not.toBeNull();
    expect(group!.type).toBe('group');
    expect(group!.blendMode).toBe('pass-through');
    // 组的画布是 1x1 占位，不按文档尺寸分配
    expect(group!.canvas.width).toBe(1);
    expect(group!.canvas.height).toBe(1);
  });

  it('没有文档时不建组', () => {
    expect(store().addGroup()).toBeNull();
  });

  it('记一条历史', () => {
    newDoc();
    const before = store().history.length;
    store().addGroup();
    expect(store().history.length).toBe(before + 1);
  });
});

describe('groupLayers', () => {
  it('把图层打进新组，组落在原来的位置', () => {
    const bg = newDoc();
    const top = addLayer();
    const group = store().groupLayers([top], '组1');
    expect(group).not.toBeNull();
    // 栈自底向上：背景、组，组里是 top
    expect(childrenOf(store().layers, group!.id).map((l) => l.id)).toEqual([top]);
    expect(childrenOf(store().layers, null).map((l) => l.id)).toEqual([bg, group!.id]);
  });

  it('多个图层编组时保持相对顺序', () => {
    newDoc();
    const a = addLayer();
    const b = addLayer();
    const group = store().groupLayers([a, b], '组1');
    expect(childrenOf(store().layers, group!.id).map((l) => l.id)).toEqual([a, b]);
  });

  it('祖先已在选中集里时不重复移动', () => {
    newDoc();
    const inner = addLayer();
    const g1 = store().groupLayers([inner], '内组')!;
    // 同时选中组和它的子图层，子图层应该跟着组走，不单独提出来
    const g2 = store().groupLayers([g1.id, inner], '外组')!;
    expect(childrenOf(store().layers, g2.id).map((l) => l.id)).toEqual([g1.id]);
    expect(childrenOf(store().layers, g1.id).map((l) => l.id)).toEqual([inner]);
  });

  it('空 ids 不做事', () => {
    newDoc();
    expect(store().groupLayers([])).toBeNull();
  });

  it('全是不存在的 id 时不做事', () => {
    newDoc();
    expect(store().groupLayers(['ghost'])).toBeNull();
  });

  it('编组后选中新组', () => {
    newDoc();
    const top = addLayer();
    const group = store().groupLayers([top])!;
    expect(store().activeLayerId).toBe(group.id);
  });
});

describe('ungroup', () => {
  it('子图层原地提到组的父级，组本身消失', () => {
    const bg = newDoc();
    const top = addLayer();
    const group = store().groupLayers([top])!;
    store().ungroup(group.id);

    expect(store().layers.some((l) => l.id === group.id)).toBe(false);
    expect(childrenOf(store().layers, null).map((l) => l.id)).toEqual([bg, top]);
  });

  it('嵌套组解散后内层组挂到外层的父级', () => {
    newDoc();
    const inner = addLayer();
    const g1 = store().groupLayers([inner], '内组')!;
    const g2 = store().groupLayers([g1.id], '外组')!;
    store().ungroup(g2.id);

    expect(store().layers.find((l) => l.id === g1.id)?.parentId ?? null).toBeNull();
    // 内层组自己的子图层不受影响
    expect(childrenOf(store().layers, g1.id).map((l) => l.id)).toEqual([inner]);
  });

  it('空组解散后直接消失', () => {
    newDoc();
    const group = store().addGroup()!;
    store().ungroup(group.id);
    expect(store().layers.some((l) => l.id === group.id)).toBe(false);
  });

  it('对非组图层无效', () => {
    const bg = newDoc();
    const before = shape();
    store().ungroup(bg);
    expect(shape()).toBe(before);
  });
});

describe('moveLayerTo', () => {
  it('把图层拖进组', () => {
    newDoc();
    const layer = addLayer();
    const group = store().addGroup()!;
    store().moveLayerTo(layer, group.id, 0);
    expect(childrenOf(store().layers, group.id).map((l) => l.id)).toEqual([layer]);
  });

  it('拒绝把组拖进自己的后代，且不记历史', () => {
    newDoc();
    const inner = addLayer();
    const g1 = store().groupLayers([inner], '内组')!;
    const g2 = store().groupLayers([g1.id], '外组')!;

    const before = store().history.length;
    store().moveLayerTo(g2.id, g1.id, 0);
    // 结构不变，也不该多出一条历史
    expect(store().layers.find((l) => l.id === g2.id)?.parentId ?? null).toBeNull();
    expect(store().history.length).toBe(before);
  });
});

describe('toggleGroupCollapsed', () => {
  it('来回切换折叠状态', () => {
    newDoc();
    const group = store().addGroup()!;
    expect(store().layers.find((l) => l.id === group.id)?.collapsed).toBe(false);
    store().toggleGroupCollapsed(group.id);
    expect(store().layers.find((l) => l.id === group.id)?.collapsed).toBe(true);
    store().toggleGroupCollapsed(group.id);
    expect(store().layers.find((l) => l.id === group.id)?.collapsed).toBe(false);
  });

  it('折叠不进历史：PS 里展开收起也不产生历史记录', () => {
    newDoc();
    const group = store().addGroup()!;
    const before = store().history.length;
    store().toggleGroupCollapsed(group.id);
    expect(store().history.length).toBe(before);
  });

  it('对非组图层无效', () => {
    const bg = newDoc();
    store().toggleGroupCollapsed(bg);
    expect(store().layers.find((l) => l.id === bg)?.collapsed).toBeUndefined();
  });
});

describe('mergeGroup', () => {
  it('整组变成一个像素图层，子图层一并消失', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    store().mergeGroup(group.id);

    expect(store().layers.some((l) => l.id === group.id)).toBe(false);
    expect(store().layers.some((l) => l.id === inner)).toBe(false);
    const merged = store().layers.find((l) => l.name === '组1');
    expect(merged?.type).toBe('raster');
  });

  it('合成结果是文档尺寸的画布，不是 1x1 占位', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    store().mergeGroup(group.id);
    const merged = store().layers.find((l) => l.name === '组1')!;
    expect(merged.canvas.width).toBe(8);
    expect(merged.canvas.height).toBe(8);
  });

  it('对非组图层无效', () => {
    const bg = newDoc();
    const before = shape();
    store().mergeGroup(bg);
    expect(shape()).toBe(before);
  });
});

describe('删除与复制组', () => {
  it('删组连子图层一起删', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    store().deleteLayer(group.id);
    expect(store().layers.some((l) => l.id === group.id)).toBe(false);
    expect(store().layers.some((l) => l.id === inner)).toBe(false);
  });

  it('删到只剩组时挡住：只有组的文档等于空的', () => {
    const bg = newDoc();
    const group = store().addGroup()!;
    store().deleteLayer(bg);
    // 唯一的像素图层不能删，否则剩一个空组
    expect(store().layers.some((l) => l.id === bg)).toBe(true);
    expect(store().layers.some((l) => l.id === group.id)).toBe(true);
  });

  it('复制组时整棵子树都复制，且副本内部父子指向副本自己', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    store().duplicateLayer(group.id);

    const copy = store().layers.find((l) => l.name === '组1 副本')!;
    expect(copy).toBeTruthy();
    const kids = childrenOf(store().layers, copy.id);
    expect(kids).toHaveLength(1);
    // 副本的子图层必须是新 id，不能还指着原来那个
    expect(kids[0].id).not.toBe(inner);
    // 原组不受影响
    expect(childrenOf(store().layers, group.id).map((l) => l.id)).toEqual([inner]);
  });
});

describe('组不接受像素绘制', () => {
  it('选中组时 paintTarget 为 null，笔刷无处可画', () => {
    newDoc();
    const group = store().addGroup()!;
    store().setActiveLayer(group.id);
    expect(store().paintTarget()).toBeNull();
  });

  it('组有蒙版且选中蒙版时可以画', () => {
    newDoc();
    const group = store().addGroup()!;
    store().addMask(group.id, 'reveal');
    store().setActiveLayer(group.id);
    store().setMaskSelected(group.id, true);
    expect(store().paintTarget()).not.toBeNull();
  });

  it('向下合并对组给出提示而不是默默做错', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    const before = shape();
    store().mergeDown(group.id);
    expect(shape()).toBe(before);
  });
});

describe('组的历史回退', () => {
  it('撤销编组能回到编组之前的结构', () => {
    const bg = newDoc();
    const top = addLayer();
    const before = shape();

    const group = store().groupLayers([top])!;
    expect(store().layers.some((l) => l.id === group.id)).toBe(true);

    store().undo();
    expect(shape()).toBe(before);
    expect(childrenOf(store().layers, null).map((l) => l.id)).toEqual([bg, top]);
  });

  it('撤销删组能把组和子图层都恢复回来', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    const before = shape();

    store().deleteLayer(group.id);
    store().undo();

    expect(shape()).toBe(before);
    expect(childrenOf(store().layers, group.id).map((l) => l.id)).toEqual([inner]);
  });

  it('恢复出来的组画布仍是 1x1，不会变成全尺寸空画布', () => {
    newDoc();
    const inner = addLayer();
    const group = store().groupLayers([inner], '组1')!;
    store().deleteLayer(group.id);
    store().undo();

    const revived = store().layers.find((l) => l.id === group.id)!;
    expect(revived.type).toBe('group');
    expect(revived.canvas.width).toBe(1);
  });

  it('重做编组能再回到编组之后', () => {
    newDoc();
    const top = addLayer();
    const group = store().groupLayers([top])!;
    const after = shape();

    store().undo();
    store().redo();

    expect(shape()).toBe(after);
    expect(descendantIds(store().layers, group.id)).toEqual([top]);
  });
});
