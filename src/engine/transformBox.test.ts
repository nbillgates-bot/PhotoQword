/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  boxMatrix,
  centerOf,
  cornerPositions,
  createTransformState,
  docToLocal,
  handlePositions,
  hitTransform,
  localToDoc,
  type TransformState,
} from './transformBox';
import { applyMatrix, determinant } from './matrix';

const RECT = { x: 100, y: 50, width: 200, height: 100 };
const base = (): TransformState => createTransformState({ ...RECT });

function rotated(angle: number): TransformState {
  return { ...base(), angle };
}

describe('createTransformState', () => {
  it('初始没有旋转和斜切', () => {
    const state = base();
    expect(state.angle).toBe(0);
    expect(state.skewX).toBe(0);
    expect(state.skewY).toBe(0);
  });
});

describe('centerOf', () => {
  it('取矩形中心', () => {
    expect(centerOf(RECT)).toEqual({ x: 200, y: 100 });
  });

  it('负宽高也给出几何中心', () => {
    expect(centerOf({ x: 100, y: 100, width: -40, height: -20 })).toEqual({ x: 80, y: 90 });
  });
});

describe('boxMatrix', () => {
  const source = { width: 400, height: 200 };

  it('未旋转时把源图左上角映到矩形左上角', () => {
    const p = applyMatrix(boxMatrix(base(), source), { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(100, 6);
    expect(p.y).toBeCloseTo(50, 6);
  });

  it('未旋转时把源图右下角映到矩形右下角', () => {
    const p = applyMatrix(boxMatrix(base(), source), { x: 400, y: 200 });
    expect(p.x).toBeCloseTo(300, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });

  it('源图中心映到矩形中心', () => {
    const p = applyMatrix(boxMatrix(base(), source), { x: 200, y: 100 });
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it('旋转时中心是不动点', () => {
    const p = applyMatrix(boxMatrix(rotated(0.7), source), { x: 200, y: 100 });
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it('转 180° 后左上角落到原右下角', () => {
    const p = applyMatrix(boxMatrix(rotated(Math.PI), source), { x: 0, y: 0 });
    expect(p.x).toBeCloseTo(300, 6);
    expect(p.y).toBeCloseTo(150, 6);
  });

  it('斜切不移动中心', () => {
    const state = { ...base(), skewX: 0.4, skewY: -0.2 };
    const p = applyMatrix(boxMatrix(state, source), { x: 200, y: 100 });
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(100, 6);
  });

  it('负宽度产生水平镜像：源左边跑到框右边', () => {
    const state = createTransformState({ x: 100, y: 50, width: -200, height: 100 });
    const p = applyMatrix(boxMatrix(state, source), { x: 0, y: 0 });
    // 中心在 x=0，宽度 -200，左上角映到中心 + 100
    expect(p.x).toBeCloseTo(100, 6);
  });

  it('源尺寸为 0 时不产生 NaN', () => {
    const m = boxMatrix(base(), { width: 0, height: 0 });
    for (const value of Object.values(m)) expect(Number.isNaN(value)).toBe(false);
  });

  it('矩形宽高为 0 时行列式为 0', () => {
    const state = createTransformState({ x: 10, y: 10, width: 0, height: 50 });
    expect(determinant(boxMatrix(state, source))).toBeCloseTo(0, 12);
  });

  it('1×1 源图能处理', () => {
    const p = applyMatrix(boxMatrix(base(), { width: 1, height: 1 }), { x: 0, y: 0 });
    expect(Number.isNaN(p.x)).toBe(false);
    expect(p.x).toBeCloseTo(100, 6);
  });
});

describe('localToDoc / docToLocal', () => {
  it('局部原点对应框中心', () => {
    const p = applyMatrix(localToDoc(base()), { x: 0, y: 0 });
    expect(p).toEqual({ x: 200, y: 100 });
  });

  it('来回换算能还原', () => {
    const state = { ...base(), angle: 0.6, skewX: 0.3, skewY: -0.15 };
    const doc = applyMatrix(localToDoc(state), { x: 40, y: -20 });
    const back = applyMatrix(docToLocal(state)!, doc);
    expect(back.x).toBeCloseTo(40, 6);
    expect(back.y).toBeCloseTo(-20, 6);
  });

  it('极端斜切仍然可逆：旋转和斜切都保面积，行列式恒为 1', () => {
    // tan(π/2) 在浮点里是 1.6e16 而不是 Infinity，所以矩阵没退化。
    // 这条钉住契约：localToDoc 不含缩放，正常参数下 docToLocal 一定拿得到
    const state = { ...base(), skewX: Math.PI / 2 };
    expect(determinant(localToDoc(state))).toBeCloseTo(1, 9);
    expect(docToLocal(state)).not.toBeNull();
  });

  it('角度是 NaN 时返回 null，不把 NaN 传下去', () => {
    // null 分支只在这种上游出错的情况下才走到，但必须挡住
    expect(docToLocal({ ...base(), angle: Number.NaN })).toBeNull();
    expect(docToLocal({ ...base(), skewX: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('旋转后局部 x 轴指向框自己的右方', () => {
    // 转 90° 后，局部 +x 在文档里朝下
    const p = applyMatrix(localToDoc(rotated(Math.PI / 2)), { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(200, 6);
    expect(p.y).toBeCloseTo(110, 6);
  });
});

describe('handlePositions', () => {
  it('给出八个控制点', () => {
    expect(handlePositions(base())).toHaveLength(8);
  });

  it('未旋转时四角落在矩形四角', () => {
    const map = new Map(handlePositions(base()).map((h) => [h.handle, h.point]));
    expect(map.get('nw')).toEqual({ x: 100, y: 50 });
    expect(map.get('ne')).toEqual({ x: 300, y: 50 });
    expect(map.get('se')).toEqual({ x: 300, y: 150 });
    expect(map.get('sw')).toEqual({ x: 100, y: 150 });
  });

  it('未旋转时边中点在边的中间', () => {
    const map = new Map(handlePositions(base()).map((h) => [h.handle, h.point]));
    expect(map.get('n')).toEqual({ x: 200, y: 50 });
    expect(map.get('s')).toEqual({ x: 200, y: 150 });
    expect(map.get('w')).toEqual({ x: 100, y: 100 });
    expect(map.get('e')).toEqual({ x: 300, y: 100 });
  });

  it('转 180° 后 nw 跑到原 se 的位置', () => {
    const map = new Map(handlePositions(rotated(Math.PI)).map((h) => [h.handle, h.point]));
    const nw = map.get('nw')!;
    expect(nw.x).toBeCloseTo(300, 6);
    expect(nw.y).toBeCloseTo(150, 6);
  });

  it('旋转不改变控制点到中心的距离', () => {
    const before = handlePositions(base());
    const after = handlePositions(rotated(1.2));
    const center = centerOf(RECT);
    for (let i = 0; i < before.length; i += 1) {
      const d1 = Math.hypot(before[i].point.x - center.x, before[i].point.y - center.y);
      const d2 = Math.hypot(after[i].point.x - center.x, after[i].point.y - center.y);
      expect(d2).toBeCloseTo(d1, 6);
    }
  });

  it('控制点坐标不含 NaN', () => {
    const state = { ...base(), angle: 2.5, skewX: 0.8, skewY: -0.6 };
    for (const item of handlePositions(state)) {
      expect(Number.isNaN(item.point.x)).toBe(false);
      expect(Number.isNaN(item.point.y)).toBe(false);
    }
  });
});

describe('cornerPositions', () => {
  it('按 nw→ne→se→sw 返回四个角', () => {
    expect(cornerPositions(base())).toEqual([
      { x: 100, y: 50 },
      { x: 300, y: 50 },
      { x: 300, y: 150 },
      { x: 100, y: 150 },
    ]);
  });

  it('旋转后仍是四个点且不含 NaN', () => {
    const corners = cornerPositions(rotated(0.9));
    expect(corners).toHaveLength(4);
    for (const corner of corners) {
      expect(Number.isNaN(corner.x)).toBe(false);
      expect(Number.isNaN(corner.y)).toBe(false);
    }
  });

  it('斜切后对边仍然平行', () => {
    const [nw, ne, se, sw] = cornerPositions({ ...base(), skewX: 0.5 });
    // 上边向量与下边向量应当同向
    const top = { x: ne.x - nw.x, y: ne.y - nw.y };
    const bottom = { x: se.x - sw.x, y: se.y - sw.y };
    expect(top.x).toBeCloseTo(bottom.x, 6);
    expect(top.y).toBeCloseTo(bottom.y, 6);
  });
});

describe('hitTransform', () => {
  it('正中控制点命中', () => {
    expect(hitTransform(base(), { x: 100, y: 50 }, 1)).toBe('nw');
    expect(hitTransform(base(), { x: 300, y: 150 }, 1)).toBe('se');
  });

  it('边中点命中', () => {
    expect(hitTransform(base(), { x: 200, y: 50 }, 1)).toBe('n');
    expect(hitTransform(base(), { x: 100, y: 100 }, 1)).toBe('w');
  });

  it('角优先于边', () => {
    // 一个 200×100 的框，nw 角和 n 边中点相距 100，不会互抢；
    // 造一个窄框让两者靠近，验证角赢
    const narrow = createTransformState({ x: 0, y: 0, width: 12, height: 40 });
    expect(hitTransform(narrow, { x: 0, y: 0 }, 1)).toBe('nw');
  });

  it('框内返回 inside', () => {
    expect(hitTransform(base(), { x: 200, y: 100 }, 1)).toBe('inside');
  });

  it('框外一圈返回 rotate', () => {
    expect(hitTransform(base(), { x: 200, y: 40 }, 1)).toBe('rotate');
  });

  it('离得很远返回 null', () => {
    expect(hitTransform(base(), { x: 200, y: -500 }, 1)).toBeNull();
  });

  it('旋转后按视觉位置命中，不是按原始矩形', () => {
    const state = rotated(Math.PI / 2);
    // 转 90° 后 nw 角的视觉位置在 (250, 0)
    expect(hitTransform(state, { x: 250, y: 0 }, 1)).toBe('nw');
    // 原来 nw 所在的 (100,50) 此时已经不是角了
    expect(hitTransform(state, { x: 100, y: 50 }, 1)).not.toBe('nw');
  });

  it('旋转后中心仍然是 inside', () => {
    expect(hitTransform(rotated(1.1), { x: 200, y: 100 }, 1)).toBe('inside');
  });

  it('缩放级别放大时容忍半径按比例缩小', () => {
    // zoom=4 时容忍半径是 2 文档像素，离 5 像素就不该命中
    expect(hitTransform(base(), { x: 105, y: 50 }, 4)).not.toBe('nw');
    expect(hitTransform(base(), { x: 101, y: 50 }, 4)).toBe('nw');
  });

  it('退化成一条线时只剩控制点可抓', () => {
    const flat = createTransformState({ x: 0, y: 0, width: 100, height: 0 });
    expect(hitTransform(flat, { x: 0, y: 0 }, 1)).toBe('nw');
    expect(hitTransform(flat, { x: 50, y: 30 }, 1)).toBeNull();
  });

  it('极小的框不会把整个框判成 inside', () => {
    // 框比容忍半径还小，内部区域为空，应当落到控制点或 rotate
    const tiny = createTransformState({ x: 0, y: 0, width: 4, height: 4 });
    expect(hitTransform(tiny, { x: 2, y: 2 }, 1)).not.toBe('inside');
  });
});
