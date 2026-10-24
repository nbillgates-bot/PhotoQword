/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { Layer, LayerType } from '../types';
import { createCanvas } from './canvasUtils';
import { boundsFor } from './layerBounds';
import {
  buildTree,
  childrenOf,
  depthOf,
  descendantIds,
  effectiveVisible,
  isAncestor,
  isHiddenByCollapse,
  moveSubtree,
  panelRows,
  revealAncestors,
  ungroupTarget,
} from './layerTree';

/** 造一个测试图层，只填树结构关心的字段 */
function mk(
  id: string,
  parentId: string | null = null,
  type: LayerType = 'raster',
  extra: Partial<Layer> = {},
): Layer {
  const canvas = createCanvas(1, 1);
  return {
    id,
    name: id,
    type,
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: type === 'group' ? 'pass-through' : 'normal',
    canvas,
    bounds: boundsFor(canvas),
    parentId,
    ...extra,
  };
}

const g = (id: string, parentId: string | null = null, extra: Partial<Layer> = {}) =>
  mk(id, parentId, 'group', extra);

describe('childrenOf', () => {
  it('按数组顺序取直接子图层', () => {
    const layers = [mk('a'), g('G'), mk('b', 'G'), mk('c', 'G'), mk('d')];
    expect(childrenOf(layers, 'G').map((l) => l.id)).toEqual(['b', 'c']);
    expect(childrenOf(layers, null).map((l) => l.id)).toEqual(['a', 'G', 'd']);
  });

  it('undefined 的 parentId 视为最外层', () => {
    const layers = [{ ...mk('a'), parentId: undefined }];
    expect(childrenOf(layers, null).map((l) => l.id)).toEqual(['a']);
  });
});

describe('buildTree', () => {
  it('嵌套组按层级建树', () => {
    const layers = [mk('a'), g('G'), mk('b', 'G'), g('H', 'G'), mk('c', 'H')];
    const tree = buildTree(layers);
    expect(tree.map((n) => n.layer.id)).toEqual(['a', 'G']);
    const group = tree[1];
    expect(group.children.map((n) => n.layer.id)).toEqual(['b', 'H']);
    expect(group.children[1].children.map((n) => n.layer.id)).toEqual(['c']);
  });

  it('子图层不与组相邻也能建对', () => {
    // 读取侧只依赖 (顺序, parentId)，不要求相邻
    const layers = [g('G'), mk('b', 'G'), mk('x'), mk('c', 'G')];
    const tree = buildTree(layers);
    expect(tree.map((n) => n.layer.id)).toEqual(['G', 'x']);
    expect(tree[0].children.map((n) => n.layer.id)).toEqual(['b', 'c']);
  });

  it('parentId 指向不存在的图层时挂回最外层，不凭空消失', () => {
    const layers = [mk('a', 'ghost'), mk('b')];
    expect(buildTree(layers).map((n) => n.layer.id)).toEqual(['a', 'b']);
  });

  it('非组图层即使被指为父也不吃子节点', () => {
    // a 不是组，b 说自己的父是 a：b 不该出现在 a 底下
    const layers = [mk('a'), mk('b', 'a')];
    const tree = buildTree(layers);
    expect(tree.map((n) => n.layer.id)).toEqual(['a']);
    expect(tree[0].children).toEqual([]);
  });

  it('互为父子的环不会让递归停不下来', () => {
    const layers = [g('A', 'B'), g('B', 'A')];
    // 两者都不在最外层，建出来是空树，但关键是不能死循环
    expect(() => buildTree(layers)).not.toThrow();
  });

  it('空数组返回空树', () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe('descendantIds', () => {
  it('收全部后代，不含自己', () => {
    const layers = [g('G'), mk('b', 'G'), g('H', 'G'), mk('c', 'H'), mk('x')];
    expect(descendantIds(layers, 'G').sort()).toEqual(['H', 'b', 'c']);
  });

  it('空组返回空数组', () => {
    expect(descendantIds([g('G')], 'G')).toEqual([]);
  });

  it('叶子图层没有后代', () => {
    expect(descendantIds([mk('a')], 'a')).toEqual([]);
  });

  it('环不会死循环', () => {
    const layers = [g('A', 'B'), g('B', 'A')];
    expect(() => descendantIds(layers, 'A')).not.toThrow();
  });
});

describe('isAncestor', () => {
  const layers = [g('G'), g('H', 'G'), mk('c', 'H'), mk('x')];

  it('识别隔代祖先', () => {
    expect(isAncestor(layers, 'G', 'c')).toBe(true);
    expect(isAncestor(layers, 'H', 'c')).toBe(true);
  });

  it('不是祖先就返回 false', () => {
    expect(isAncestor(layers, 'x', 'c')).toBe(false);
    expect(isAncestor(layers, 'c', 'G')).toBe(false);
  });

  it('自己不是自己的祖先', () => {
    expect(isAncestor(layers, 'G', 'G')).toBe(false);
  });

  it('环不会死循环', () => {
    const cyclic = [g('A', 'B'), g('B', 'A')];
    expect(() => isAncestor(cyclic, 'A', 'B')).not.toThrow();
  });
});

describe('depthOf', () => {
  it('最外层为 0，逐层加一', () => {
    const layers = [g('G'), g('H', 'G'), mk('c', 'H')];
    expect(depthOf(layers, 'G')).toBe(0);
    expect(depthOf(layers, 'H')).toBe(1);
    expect(depthOf(layers, 'c')).toBe(2);
  });

  it('父不存在时按最外层算', () => {
    expect(depthOf([mk('a', 'ghost')], 'a')).toBe(0);
  });
});

describe('panelRows', () => {
  it('自上而下渲染，与图层栈自顶向下一致', () => {
    // 栈自底向上是 a, b：面板应该 b 在上
    const layers = [mk('a'), mk('b')];
    expect(panelRows(layers).map((r) => r.layer.id)).toEqual(['b', 'a']);
  });

  it('组内也倒序，且带上缩进层级', () => {
    const layers = [mk('a'), g('G'), mk('b', 'G'), mk('c', 'G')];
    expect(panelRows(layers).map((r) => [r.layer.id, r.depth])).toEqual([
      ['G', 0],
      ['c', 1],
      ['b', 1],
      ['a', 0],
    ]);
  });

  it('折叠的组只出自己那一行', () => {
    // 栈自底向上是 G, a，所以面板里 a 在 G 上面；b 因为 G 折叠而不出现
    const layers = [g('G', null, { collapsed: true }), mk('b', 'G'), mk('a')];
    expect(panelRows(layers).map((r) => r.layer.id)).toEqual(['a', 'G']);
  });

  it('嵌套组的缩进逐层递增', () => {
    const layers = [g('G'), g('H', 'G'), mk('c', 'H')];
    expect(panelRows(layers).map((r) => r.depth)).toEqual([0, 1, 2]);
  });
});

describe('effectiveVisible', () => {
  it('自己隐藏就不显示', () => {
    expect(effectiveVisible([mk('a', null, 'raster', { visible: false })], 'a')).toBe(false);
  });

  it('祖先组隐藏时子图层也不显示', () => {
    const layers = [g('G', null, { visible: false }), mk('b', 'G')];
    expect(effectiveVisible(layers, 'b')).toBe(false);
  });

  it('隔代祖先隐藏一样不显示', () => {
    const layers = [g('G', null, { visible: false }), g('H', 'G'), mk('c', 'H')];
    expect(effectiveVisible(layers, 'c')).toBe(false);
  });

  it('自己和祖先都可见才显示', () => {
    const layers = [g('G'), mk('b', 'G')];
    expect(effectiveVisible(layers, 'b')).toBe(true);
  });

  it('不存在的 id 返回 false', () => {
    expect(effectiveVisible([mk('a')], 'ghost')).toBe(false);
  });
});

describe('isHiddenByCollapse', () => {
  it('祖先折叠时该行不显示', () => {
    const layers = [g('G', null, { collapsed: true }), mk('b', 'G')];
    expect(isHiddenByCollapse(layers, 'b')).toBe(true);
  });

  it('组自己折叠时它这一行仍要显示', () => {
    const layers = [g('G', null, { collapsed: true })];
    expect(isHiddenByCollapse(layers, 'G')).toBe(false);
  });

  it('最外层图层永不被折叠隐藏', () => {
    expect(isHiddenByCollapse([mk('a')], 'a')).toBe(false);
  });
});

/**
 * 报的 bug：画布右键选到藏在折叠组里的图层后，面板不会滚过去。
 * 根因是折叠组的子图层在面板上连 DOM 元素都没有，滚动无从谈起，
 * 所以选中时要先把祖先组一路展开。
 */
describe('revealAncestors', () => {
  it('展开折叠的祖先组，之后这一行就该显示了', () => {
    const layers = [g('G', null, { collapsed: true }), mk('b', 'G')];

    const next = revealAncestors(layers, 'b');

    expect(isHiddenByCollapse(next, 'b')).toBe(false);
    expect(next.find((l) => l.id === 'G')?.collapsed).toBe(false);
  });

  it('多层嵌套要一路开到最外层', () => {
    const layers = [
      g('G1', null, { collapsed: true }),
      g('G2', 'G1', { collapsed: true }),
      g('G3', 'G2', { collapsed: true }),
      mk('b', 'G3'),
    ];

    const next = revealAncestors(layers, 'b');

    expect(isHiddenByCollapse(next, 'b')).toBe(false);
    for (const id of ['G1', 'G2', 'G3']) {
      expect(next.find((l) => l.id === id)?.collapsed).toBe(false);
    }
  });

  it('目标自己是折叠的组时，只开祖先，不动它自己', () => {
    // 与 isHiddenByCollapse 同一条约定：组自己折不折叠不影响它这一行显不显示
    const layers = [g('G', null, { collapsed: true }), g('H', 'G', { collapsed: true })];

    const next = revealAncestors(layers, 'H');

    expect(next.find((l) => l.id === 'G')?.collapsed).toBe(false);
    expect(next.find((l) => l.id === 'H')?.collapsed).toBe(true);
  });

  it('本来就全展开时原样返回，不制造新数组', () => {
    // 引用相等是有意的契约：面板按引用比较，每次选中都换新数组会让行的 memo 全失效
    const layers = [g('G'), mk('b', 'G')];
    expect(revealAncestors(layers, 'b')).toBe(layers);
  });

  it('最外层图层没有祖先，原样返回', () => {
    const layers = [mk('a')];
    expect(revealAncestors(layers, 'a')).toBe(layers);
  });

  it('图层不存在时原样返回，不抛错', () => {
    const layers = [g('G', null, { collapsed: true }), mk('b', 'G')];
    expect(revealAncestors(layers, '不存在')).toBe(layers);
  });

  it('不改动无关的组', () => {
    const layers = [
      g('G', null, { collapsed: true }),
      mk('b', 'G'),
      g('H', null, { collapsed: true }),
    ];

    const next = revealAncestors(layers, 'b');

    expect(next.find((l) => l.id === 'H')?.collapsed).toBe(true);
    // 无关的图层对象连引用都不该换
    expect(next.find((l) => l.id === 'H')).toBe(layers[2]);
  });

  it('展开后 panelRows 里真的多出了那一行', () => {
    const layers = [g('G', null, { collapsed: true }), mk('b', 'G')];

    expect(panelRows(layers).map((row) => row.layer.id)).toEqual(['G']);
    expect(panelRows(revealAncestors(layers, 'b')).map((row) => row.layer.id)).toEqual(['G', 'b']);
  });

  it('父级指向不存在的图层时不死循环', () => {
    const layers = [mk('a', '幽灵')];
    expect(revealAncestors(layers, 'a')).toBe(layers);
  });

  it('parentId 成环时不死循环', () => {
    const layers = [g('A', 'B', { collapsed: true }), g('B', 'A', { collapsed: true })];
    // 只要能返回就算过关，环由 ancestorIds 的 seen 挡住
    expect(revealAncestors(layers, 'A')).toBeDefined();
  });
});

/** 把结果压成 "id:parentId" 便于断言 */
const shape = (layers: Layer[]) =>
  layers.map((l) => `${l.id}:${l.parentId ?? '-'}`).join(' ');

describe('moveSubtree', () => {
  it('把图层移进组，parentId 与位置都对', () => {
    const layers = [mk('a'), g('G')];
    expect(shape(moveSubtree(layers, 'a', 'G', 0))).toBe('G:- a:G');
  });

  it('把图层移出组回到最外层', () => {
    const layers = [g('G'), mk('a', 'G')];
    expect(shape(moveSubtree(layers, 'a', null, 0))).toBe('a:- G:-');
  });

  it('组连同子树一起搬走', () => {
    const layers = [mk('x'), g('G'), mk('a', 'G'), mk('b', 'G')];
    const out = moveSubtree(layers, 'G', null, 0);
    expect(shape(out)).toBe('G:- a:G b:G x:-');
  });

  it('在同层内调整位置', () => {
    const layers = [mk('a'), mk('b'), mk('c')];
    // 把 a 移到 index 2（b、c 之间的上方）
    expect(shape(moveSubtree(layers, 'a', null, 2))).toBe('b:- c:- a:-');
  });

  it('插到兄弟之前时跳过那个兄弟的整棵子树', () => {
    // 目标父级是最外层，兄弟有 G（带子树）和 x
    const layers = [g('G'), mk('gc', 'G'), mk('x'), mk('a')];
    // 把 a 插到 index 1，也就是 G 之上、x 之下
    const out = moveSubtree(layers, 'a', null, 1);
    // 关键：a 不能掉进 G 里面
    expect(shape(out)).toBe('G:- gc:G a:- x:-');
    expect(childrenOf(out, 'G').map((l) => l.id)).toEqual(['gc']);
  });

  it('移进空组时紧跟在组后面', () => {
    const layers = [g('G'), mk('x'), mk('a')];
    const out = moveSubtree(layers, 'a', 'G', 0);
    expect(shape(out)).toBe('G:- a:G x:-');
  });

  it('拒绝把组移进自己的后代', () => {
    const layers = [g('G'), g('H', 'G')];
    expect(moveSubtree(layers, 'G', 'H', 0)).toBe(layers);
  });

  it('拒绝把组移进自己', () => {
    const layers = [g('G')];
    expect(moveSubtree(layers, 'G', 'G', 0)).toBe(layers);
  });

  it('拒绝移进非组图层', () => {
    const layers = [mk('a'), mk('b')];
    expect(moveSubtree(layers, 'a', 'b', 0)).toBe(layers);
  });

  it('图层不存在时原样返回', () => {
    const layers = [mk('a')];
    expect(moveSubtree(layers, 'ghost', null, 0)).toBe(layers);
  });

  it('index 超出范围时夹到边界，不丢图层', () => {
    const layers = [mk('a'), mk('b')];
    expect(moveSubtree(layers, 'a', null, 99)).toHaveLength(2);
    expect(moveSubtree(layers, 'a', null, -5)).toHaveLength(2);
  });

  it('嵌套子树的内部父子关系保持不变', () => {
    const layers = [g('G'), g('H', 'G'), mk('c', 'H'), mk('x')];
    const out = moveSubtree(layers, 'G', null, 1);
    expect(childrenOf(out, 'G').map((l) => l.id)).toEqual(['H']);
    expect(childrenOf(out, 'H').map((l) => l.id)).toEqual(['c']);
  });
});

describe('ungroupTarget', () => {
  const layers = [g('G'), mk('a', 'G'), g('H', 'G'), mk('b', 'H'), mk('x')];

  it('选中的是组时返回它自己', () => {
    expect(ungroupTarget(layers, 'G')).toBe('G');
  });

  it('选中组内图层时返回它所在的组', () => {
    expect(ungroupTarget(layers, 'a')).toBe('G');
  });

  it('嵌套时只解散最近的那一层组', () => {
    expect(ungroupTarget(layers, 'b')).toBe('H');
  });

  it('最外层的图层没有可解散的组', () => {
    expect(ungroupTarget(layers, 'x')).toBeNull();
  });

  it('id 不存在或为 null 时返回 null', () => {
    expect(ungroupTarget(layers, 'nope')).toBeNull();
    expect(ungroupTarget(layers, null)).toBeNull();
  });
});
