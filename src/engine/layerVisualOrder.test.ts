/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer } from '../types';
import { createCanvas } from './canvasUtils';
import { boundsFor } from './layerBounds';
import { visualOrder } from './layerVisualOrder';

function mk(id: string, parentId?: string, type: Layer['type'] = 'raster'): Layer {
  const canvas = createCanvas(4, 4);
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas, 0, 0),
    ...(parentId ? { parentId } : {}),
  };
}

const ids = (layers: Layer[]) => layers.map((layer) => layer.id);

describe('visualOrder', () => {
  it('没有组时就是数组反转：数组末尾是最顶层', () => {
    const layers = [mk('bg'), mk('mid'), mk('top')];

    expect(ids(visualOrder(layers))).toEqual(['top', 'mid', 'bg']);
  });

  it('空数组返回空数组', () => {
    expect(visualOrder([])).toEqual([]);
  });

  it('单个图层原样返回', () => {
    expect(ids(visualOrder([mk('only')]))).toEqual(['only']);
  });

  /*
   * 这条是报的 bug 本身。
   * 组内子图层在扁平数组里紧跟着组，简单 reverse 会把它们排到组的位置上去，
   * 于是「组下面那层」被排到了「组上面那层」的前面，菜单第一项不是最顶层。
   */
  it('组内图层参与整体排序，不能靠扁平数组简单反转', () => {
    // 视觉自顶向底应为：top, childB, childA, bg
    const layers = [
      mk('bg'),
      mk('group', undefined, 'group'),
      mk('childA', 'group'),
      mk('childB', 'group'),
      mk('top'),
    ];

    expect(ids(visualOrder(layers))).toEqual(['top', 'childB', 'childA', 'bg']);
  });

  it('组在同级中的位置决定整棵子树的位置', () => {
    // 组排在 top 之上 → 组里的图层应该整体盖在 top 上面
    const layers = [
      mk('bg'),
      mk('top'),
      mk('group', undefined, 'group'),
      mk('childA', 'group'),
      mk('childB', 'group'),
    ];

    expect(ids(visualOrder(layers))).toEqual(['childB', 'childA', 'top', 'bg']);
  });

  it('组排在下面时，组内图层整体被组外的层盖住', () => {
    const layers = [
      mk('bg'),
      mk('group', undefined, 'group'),
      mk('childA', 'group'),
      mk('childB', 'group'),
      mk('top'),
    ];

    // top 在最前，组里两层跟在后面，顺序不会被打散
    expect(ids(visualOrder(layers))).toEqual(['top', 'childB', 'childA', 'bg']);
  });

  it('组默认不出现在结果里，它没有自己的像素', () => {
    const layers = [mk('group', undefined, 'group'), mk('child', 'group')];

    expect(ids(visualOrder(layers))).toEqual(['child']);
  });

  it('includeGroups 为真时组也列出来，排在自己子图层之前', () => {
    const layers = [mk('bg'), mk('group', undefined, 'group'), mk('child', 'group')];

    expect(ids(visualOrder(layers, true))).toEqual(['group', 'child', 'bg']);
  });

  it('折叠的组照样展开：折叠只影响面板显示，不影响画布堆叠', () => {
    const group = { ...mk('group', undefined, 'group'), collapsed: true };
    const layers = [group, mk('child', 'group')];

    expect(ids(visualOrder(layers))).toEqual(['child']);
  });

  it('多层嵌套逐级反转', () => {
    // outer 里有 inner，inner 里有两张图
    const layers = [
      mk('bg'),
      mk('outer', undefined, 'group'),
      mk('outerChild', 'outer'),
      mk('inner', 'outer', 'group'),
      mk('deep1', 'inner'),
      mk('deep2', 'inner'),
    ];

    // inner 排在 outerChild 之上，所以 inner 的内容整体在 outerChild 前面
    expect(ids(visualOrder(layers))).toEqual(['deep2', 'deep1', 'outerChild', 'bg']);
  });

  it('parentId 指向不存在的图层时按最外层处理，不会丢图层', () => {
    const layers = [mk('bg'), mk('orphan', 'ghost')];

    // 不管排在哪，两个都得在
    expect(ids(visualOrder(layers)).sort()).toEqual(['bg', 'orphan']);
  });

  /*
   * 决定性的一条：子图层在数组里与组不相邻时，简单反转必然算错。
   *
   * layerTree 的约定明确写着「不要求子图层在数组里与组相邻，读取侧只依赖
   * (顺序, parentId)」。子图层紧跟组时简单反转碰巧也能得到对的答案，
   * 所以这个坑平时不发作；一旦某个写入路径没保持相邻就立刻错位，
   * 而且错得很隐蔽。这条用例把差异钉死。
   */
  it('子图层与组不相邻时，位置仍由组决定而不是由它自己在数组里的下标决定', () => {
    // group 在 top 之下，所以 child 必须排在 top 之后，
    // 哪怕 child 在扁平数组里的下标比 top 还大
    const layers = [mk('group', undefined, 'group'), mk('top'), mk('child', 'group')];

    expect(ids(visualOrder(layers))).toEqual(['top', 'child']);

    // 对照：简单反转会得到 child, top —— child 被顶到了最前面，正是要修的错
    const naive = [...layers].reverse().filter((layer) => layer.type !== 'group');
    expect(ids(naive)).toEqual(['child', 'top']);
  });
});
