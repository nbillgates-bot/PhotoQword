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

function newDoc(width = 32, height = 32) {
  store().createDoc({ width, height, background: 'transparent', name: '测试' });
}

beforeEach(() => {
  store().closeDoc();
  store().cancelCrop();
});

describe('setCropRect', () => {
  it('没有文档时不设置', () => {
    store().setCropRect({ x: 0, y: 0, width: 10, height: 10 });
    expect(store().cropRect).toBeNull();
  });

  it('正常矩形直接记录', () => {
    newDoc();
    store().setCropRect({ x: 4, y: 6, width: 10, height: 12 });
    expect(store().cropRect).toEqual({ x: 4, y: 6, width: 10, height: 12 });
  });

  it('负宽高先归一化', () => {
    newDoc();
    store().setCropRect({ x: 20, y: 20, width: -10, height: -12 });
    expect(store().cropRect).toEqual({ x: 10, y: 8, width: 10, height: 12 });
  });

  it('传 null 清空', () => {
    newDoc();
    store().setCropRect({ x: 4, y: 4, width: 8, height: 8 });
    store().setCropRect(null);
    expect(store().cropRect).toBeNull();
  });
});

describe('setCropRect 边界夹取', () => {
  it('负坐标夹到 0', () => {
    newDoc();
    store().setCropRect({ x: -10, y: -20, width: 15, height: 25 });
    const r = store().cropRect!;
    expect(r.x).toBe(0);
    expect(r.y).toBe(0);
  });

  it('超出右下边界时宽高被截断', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 20, y: 24, width: 100, height: 100 });
    const r = store().cropRect!;
    expect(r.x + r.width).toBe(32);
    expect(r.y + r.height).toBe(32);
  });

  it('起点超出文档时被拉回，仍留得下最小尺寸', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 100, y: 100, width: 10, height: 10 });
    const r = store().cropRect!;
    expect(r.x).toBe(28);
    expect(r.y).toBe(28);
    expect(r.width).toBeGreaterThanOrEqual(4);
    expect(r.height).toBeGreaterThanOrEqual(4);
  });

  it('宽高为 0 时提到最小尺寸', () => {
    newDoc();
    store().setCropRect({ x: 4, y: 4, width: 0, height: 0 });
    const r = store().cropRect!;
    expect(r.width).toBe(4);
    expect(r.height).toBe(4);
  });

  it('小于 1 的小数宽高也提到最小尺寸', () => {
    newDoc();
    store().setCropRect({ x: 4, y: 4, width: 0.3, height: 0.7 });
    const r = store().cropRect!;
    expect(r.width).toBe(4);
    expect(r.height).toBe(4);
  });

  it('1×1 文档上不产生 NaN 或负值', () => {
    newDoc(1, 1);
    store().setCropRect({ x: 0, y: 0, width: 1, height: 1 });
    const r = store().cropRect!;
    for (const v of [r.x, r.y, r.width, r.height]) {
      expect(Number.isNaN(v)).toBe(false);
    }
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeGreaterThanOrEqual(0);
  });

  it('整幅画布也能作为裁剪框', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 0, y: 0, width: 32, height: 32 });
    expect(store().cropRect).toEqual({ x: 0, y: 0, width: 32, height: 32 });
  });
});

describe('commitCrop', () => {
  it('按框裁剪文档', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 4, y: 6, width: 10, height: 12 });
    store().commitCrop();

    expect(store().doc!.width).toBe(10);
    expect(store().doc!.height).toBe(12);
  });

  it('裁完清空裁剪框', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 4, y: 4, width: 8, height: 8 });
    store().commitCrop();
    expect(store().cropRect).toBeNull();
  });

  it('没有框时什么都不做', () => {
    newDoc(32, 32);
    store().commitCrop();
    expect(store().doc!.width).toBe(32);
  });

  it('给出可见反馈', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 0, y: 0, width: 10, height: 12 });
    store().commitCrop();
    expect(store().toast?.message).toBe('toast.cropped');
    expect(store().toast?.params).toMatchObject({ width: 10, height: 12 });
  });

  it('裁剪可撤销', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 4, y: 4, width: 10, height: 10 });
    store().commitCrop();
    expect(store().doc!.width).toBe(10);
    expect(store().doc!.height).toBe(10);
    store().undo();
    expect(store().doc!.width).toBe(32);
    expect(store().doc!.height).toBe(32);
  });

  it('整幅裁剪等于不变尺寸', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 0, y: 0, width: 32, height: 32 });
    store().commitCrop();
    expect(store().doc!.width).toBe(32);
    expect(store().doc!.height).toBe(32);
  });

  it('参考线跟着新原点走，不留在原图的位置上', () => {
    newDoc(32, 32);
    store().clearGuides();
    store().addGuide('v', 12);
    store().addGuide('h', 20);
    store().setCropRect({ x: 8, y: 8, width: 16, height: 16 });
    store().commitCrop();

    expect(store().guides.map((g) => g.position)).toEqual([4, 12]);
  });

  it('沿参考线裁剪后，那条线正好落在新文档的边缘', () => {
    newDoc(32, 32);
    store().clearGuides();
    store().addGuide('v', 8);
    store().setCropRect({ x: 8, y: 0, width: 16, height: 32 });
    store().commitCrop();

    expect(store().guides[0].position).toBe(0);
  });

  it('被裁掉那半边上的参考线一并删除', () => {
    newDoc(32, 32);
    store().clearGuides();
    store().addGuide('v', 4);
    store().addGuide('v', 20);
    store().setCropRect({ x: 8, y: 8, width: 16, height: 16 });
    store().commitCrop();

    expect(store().guides).toHaveLength(1);
    expect(store().guides[0].position).toBe(12);
  });
});

describe('cancelCrop', () => {
  it('清空框且不动文档', () => {
    newDoc(32, 32);
    store().setCropRect({ x: 4, y: 4, width: 10, height: 10 });
    store().cancelCrop();

    expect(store().cropRect).toBeNull();
    expect(store().doc!.width).toBe(32);
  });

  it('没有框时调用也安全', () => {
    newDoc(32, 32);
    expect(() => store().cancelCrop()).not.toThrow();
    expect(store().cropRect).toBeNull();
  });

  it('取消后不留历史记录', () => {
    newDoc(32, 32);
    const before = store().history.length;
    store().setCropRect({ x: 4, y: 4, width: 10, height: 10 });
    store().cancelCrop();
    expect(store().history.length).toBe(before);
  });
});
