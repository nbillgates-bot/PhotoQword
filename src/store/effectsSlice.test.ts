/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { DEFAULT_DROP_SHADOW, DEFAULT_OUTER_GLOW, DEFAULT_STROKE } from '../types/effects';

const store = () => useEditorStore.getState();

/** 建一个 8x8 的白底文档并返回其唯一图层 id */
function newDoc(): string {
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

/** 取某图层当前的 effects */
function effectsOf(id: string) {
  return store().layers.find((layer) => layer.id === id)?.effects;
}

beforeEach(() => {
  store().closeDoc();
});

describe('setLayerEffects', () => {
  it('写入效果后能从图层上读回', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    expect(effectsOf(id)?.stroke).toEqual(DEFAULT_STROKE);
  });

  it('传 undefined 清空效果', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    store().setLayerEffects(id, undefined);
    expect(effectsOf(id)).toBeUndefined();
  });

  it('写入效果会推进 revision，否则画布不重绘', () => {
    const id = newDoc();
    const before = store().revision;
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    expect(store().revision).toBeGreaterThan(before);
  });

  it('图层 id 不存在时静默返回，不抛异常', () => {
    newDoc();
    const before = store().layers.length;
    expect(() => store().setLayerEffects('不存在的id', { stroke: DEFAULT_STROKE })).not.toThrow();
    expect(store().layers.length).toBe(before);
  });

  it('替换图层对象而不是就地改，保证 React 能看到变化', () => {
    const id = newDoc();
    const before = store().layers.find((layer) => layer.id === id);
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    const after = store().layers.find((layer) => layer.id === id);
    // 引用必须变，否则 zustand 的浅比较认为没变，面板不刷新
    expect(after).not.toBe(before);
  });

  it('设置效果不影响图层像素引用', () => {
    const id = newDoc();
    const canvasBefore = store().layers.find((layer) => layer.id === id)?.canvas;
    store().setLayerEffects(id, { dropShadow: DEFAULT_DROP_SHADOW });
    const canvasAfter = store().layers.find((layer) => layer.id === id)?.canvas;
    // 效果是非像素属性，不该动画布
    expect(canvasAfter).toBe(canvasBefore);
  });
});

describe('toggleEffect', () => {
  it('把已有效果关掉后 enabled 变 false', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, enabled: true } });
    store().toggleEffect(id, 'stroke', false);
    expect(effectsOf(id)?.stroke?.enabled).toBe(false);
  });

  it('关掉再开回来时参数保持不变', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 17, color: '#123456' } });
    store().toggleEffect(id, 'stroke', false);
    store().toggleEffect(id, 'stroke', true);
    const stroke = effectsOf(id)?.stroke;
    // 用户调过的参数不能因为切开关而丢
    expect(stroke?.size).toBe(17);
    expect(stroke?.color).toBe('#123456');
    expect(stroke?.enabled).toBe(true);
  });

  it('第一次勾选未配置的效果时用 PS 默认值初始化', () => {
    const id = newDoc();
    store().toggleEffect(id, 'dropShadow', true);
    const shadow = effectsOf(id)?.dropShadow;
    // 必须是完整对象，缺字段会让渲染时算出 NaN
    expect(shadow).toEqual({ ...DEFAULT_DROP_SHADOW, enabled: true });
  });

  it('初始化出来的效果与默认值常量不是同一个对象', () => {
    const id = newDoc();
    store().toggleEffect(id, 'stroke', true);
    // 共享引用的话，改一个图层的参数会串到所有图层
    expect(effectsOf(id)?.stroke).not.toBe(DEFAULT_STROKE);
  });

  it('切换一个效果不影响其他效果', () => {
    const id = newDoc();
    store().setLayerEffects(id, {
      stroke: { ...DEFAULT_STROKE, enabled: true },
      dropShadow: { ...DEFAULT_DROP_SHADOW, enabled: true },
    });
    store().toggleEffect(id, 'stroke', false);
    expect(effectsOf(id)?.dropShadow?.enabled).toBe(true);
  });

  it('图层 id 不存在时静默返回', () => {
    newDoc();
    expect(() => store().toggleEffect('不存在的id', 'stroke', true)).not.toThrow();
  });
});

describe('updateEffect', () => {
  it('只改传进来的字段，其余保持', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 5, color: '#abcdef' } });
    store().updateEffect(id, 'stroke', { size: 12 });
    const stroke = effectsOf(id)?.stroke;
    expect(stroke?.size).toBe(12);
    // 没点名的字段不能被顺手清掉
    expect(stroke?.color).toBe('#abcdef');
  });

  it('改一个效果的参数不影响其他效果', () => {
    const id = newDoc();
    store().setLayerEffects(id, {
      stroke: { ...DEFAULT_STROKE, size: 5 },
      dropShadow: { ...DEFAULT_DROP_SHADOW, distance: 30 },
    });
    store().updateEffect(id, 'stroke', { size: 9 });
    expect(effectsOf(id)?.dropShadow?.distance).toBe(30);
  });

  it('对未配置的效果调用时按默认值补齐，不留半成品对象', () => {
    const id = newDoc();
    store().updateEffect(id, 'outerGlow', { size: 20 });
    // 缺字段的对象渲染时会算出 NaN，所以必须字段齐全
    expect(effectsOf(id)?.outerGlow).toEqual({ ...DEFAULT_OUTER_GLOW, size: 20, enabled: false });
  });

  it('改未配置效果的参数不会顺带启用它', () => {
    const id = newDoc();
    store().updateEffect(id, 'outerGlow', { size: 20 });
    // DEFAULT_OUTER_GLOW.enabled 是 true，补齐时必须被压成 false
    expect(effectsOf(id)?.outerGlow?.enabled).toBe(false);
  });

  it('改已启用效果的参数不会把它关掉', () => {
    const id = newDoc();
    store().toggleEffect(id, 'outerGlow', true);
    store().updateEffect(id, 'outerGlow', { size: 20 });
    expect(effectsOf(id)?.outerGlow?.enabled).toBe(true);
  });

  it('图层 id 不存在时静默返回', () => {
    newDoc();
    expect(() => store().updateEffect('不存在的id', 'stroke', { size: 1 })).not.toThrow();
  });

  it('改参数会推进 revision', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    const before = store().revision;
    store().updateEffect(id, 'stroke', { size: 8 });
    expect(store().revision).toBeGreaterThan(before);
  });
});

describe('图层样式与历史记录', () => {
  it('撤销能还原到没有效果的状态', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: DEFAULT_STROKE });
    store().pushHistory('图层样式');
    expect(effectsOf(id)?.stroke).toBeDefined();

    store().undo();
    // 效果是非像素属性，走 meta 绝对存，撤销后必须干净地消失
    expect(effectsOf(id)).toBeUndefined();
  });

  it('重做能把效果恢复回来', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 9 } });
    store().pushHistory('图层样式');
    store().undo();
    store().redo();
    expect(effectsOf(id)?.stroke?.size).toBe(9);
  });

  it('撤销参数改动只回退一步，不会连效果本身一起丢', () => {
    const id = newDoc();
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 3 } });
    store().pushHistory('图层样式');
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 20 } });
    store().pushHistory('图层样式');

    store().undo();
    // 回到第一步的 size，而不是回到"没有效果"
    expect(effectsOf(id)?.stroke?.size).toBe(3);
  });

  it('历史里的效果是深拷贝，改当前状态不会污染快照', () => {
    const id = newDoc();
    const stroke = { ...DEFAULT_STROKE, size: 5 };
    store().setLayerEffects(id, { stroke });
    store().pushHistory('图层样式');

    // 直接改刚才传进去的那个对象
    stroke.size = 99;
    store().setLayerEffects(id, { stroke: { ...DEFAULT_STROKE, size: 40 } });
    store().pushHistory('再改一次');
    store().undo();

    // 快照必须存的是当时的值 5，而不是被外部改成的 99
    expect(effectsOf(id)?.stroke?.size).toBe(5);
  });
});
