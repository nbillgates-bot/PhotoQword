/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  IDENTITY,
  applyMatrix,
  compose,
  concatContextTransform,
  determinant,
  invert,
  multiply,
  rotation,
  scaling,
  setContextTransform,
  skewing,
  translation,
} from './matrix';
import { createCanvas, ctx2d } from './canvasUtils';

/** 浮点比较的容差，三角函数免不了尾数误差 */
const EPS = 1e-9;

function expectPoint(actual: { x: number; y: number }, x: number, y: number) {
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
}

describe('基础矩阵', () => {
  it('单位矩阵不动点', () => {
    expectPoint(applyMatrix(IDENTITY, { x: 3, y: 7 }), 3, 7);
  });

  it('平移', () => {
    expectPoint(applyMatrix(translation(10, -5), { x: 1, y: 1 }), 11, -4);
  });

  it('缩放', () => {
    expectPoint(applyMatrix(scaling(2, 3), { x: 4, y: 5 }), 8, 15);
  });

  it('缩放为 0 时点被压到原点', () => {
    expectPoint(applyMatrix(scaling(0, 0), { x: 4, y: 5 }), 0, 0);
  });

  it('旋转 90° 把 x 轴转到 y 轴（画布 y 向下，视觉上顺时针）', () => {
    expectPoint(applyMatrix(rotation(Math.PI / 2), { x: 1, y: 0 }), 0, 1);
  });

  it('旋转 180° 取反', () => {
    expectPoint(applyMatrix(rotation(Math.PI), { x: 2, y: 3 }), -2, -3);
  });

  it('旋转 0 是恒等', () => {
    expectPoint(applyMatrix(rotation(0), { x: 2, y: 3 }), 2, 3);
  });

  it('旋转保长度', () => {
    const p = applyMatrix(rotation(0.7), { x: 3, y: 4 });
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 9);
  });

  it('水平斜切让高处的点横移', () => {
    const p = applyMatrix(skewing(Math.PI / 4, 0), { x: 0, y: 10 });
    expectPoint(p, 10, 10);
  });

  it('垂直斜切让远处的点下移', () => {
    const p = applyMatrix(skewing(0, Math.PI / 4), { x: 10, y: 0 });
    expectPoint(p, 10, 10);
  });

  it('斜切不动原点', () => {
    expectPoint(applyMatrix(skewing(0.3, 0.4), { x: 0, y: 0 }), 0, 0);
  });
});

describe('multiply', () => {
  it('语义是先第二个再第一个', () => {
    // 先缩放 2 倍再平移 10：点 1 应到 12，不是 22
    const m = multiply(translation(10, 0), scaling(2, 2));
    expectPoint(applyMatrix(m, { x: 1, y: 0 }), 12, 0);
  });

  it('顺序反了结果就不同', () => {
    const m = multiply(scaling(2, 2), translation(10, 0));
    expectPoint(applyMatrix(m, { x: 1, y: 0 }), 22, 0);
  });

  it('乘单位矩阵不变', () => {
    const m = multiply(rotation(0.4), IDENTITY);
    const r = rotation(0.4);
    expect(m.a).toBeCloseTo(r.a, 9);
    expect(m.b).toBeCloseTo(r.b, 9);
    expect(m.e).toBeCloseTo(r.e, 9);
  });

  it('两次 45° 旋转等于一次 90°', () => {
    const twice = multiply(rotation(Math.PI / 4), rotation(Math.PI / 4));
    expectPoint(applyMatrix(twice, { x: 1, y: 0 }), 0, 1);
  });
});

describe('compose', () => {
  it('最右边的先应用', () => {
    // compose(平移, 缩放) = 平移·缩放，点先被缩放再被平移
    const m = compose(translation(10, 0), scaling(2, 2));
    expectPoint(applyMatrix(m, { x: 1, y: 0 }), 12, 0);
  });

  it('与逐个 multiply 的结果一致', () => {
    const a = translation(3, 4);
    const b = rotation(0.5);
    const c = scaling(2, 2);
    const viaCompose = compose(a, b, c);
    const viaMultiply = multiply(multiply(a, b), c);
    expect(viaCompose.a).toBeCloseTo(viaMultiply.a, 9);
    expect(viaCompose.e).toBeCloseTo(viaMultiply.e, 9);
    expect(viaCompose.f).toBeCloseTo(viaMultiply.f, 9);
  });

  it('空参数是恒等', () => {
    expectPoint(applyMatrix(compose(), { x: 5, y: 6 }), 5, 6);
  });

  it('单个参数原样返回效果', () => {
    expectPoint(applyMatrix(compose(translation(3, 4)), { x: 0, y: 0 }), 3, 4);
  });

  it('绕点旋转：平移到原点、转、再平移回去', () => {
    // 绕 (10,10) 转 180°，点 (11,10) 应落到 (9,10)
    const m = compose(translation(10, 10), rotation(Math.PI), translation(-10, -10));
    expectPoint(applyMatrix(m, { x: 11, y: 10 }), 9, 10);
  });
});

describe('determinant 与 invert', () => {
  it('平移的行列式是 1', () => {
    expect(determinant(translation(9, 9))).toBeCloseTo(1, 9);
  });

  it('缩放的行列式是面积倍数', () => {
    expect(determinant(scaling(2, 3))).toBeCloseTo(6, 9);
  });

  it('旋转的行列式是 1（不改面积）', () => {
    expect(determinant(rotation(1.1))).toBeCloseTo(1, 9);
  });

  it('斜切的行列式是 1（不改面积）', () => {
    expect(determinant(skewing(0.5, 0))).toBeCloseTo(1, 9);
  });

  it('逆矩阵把点还原', () => {
    const m = compose(translation(20, 30), rotation(0.6), scaling(2, 3));
    const inverse = invert(m);
    expect(inverse).not.toBeNull();
    const round = applyMatrix(inverse!, applyMatrix(m, { x: 7, y: -4 }));
    expectPoint(round, 7, -4);
  });

  it('带斜切也能还原', () => {
    const m = compose(rotation(0.3), skewing(0.4, -0.2), scaling(1.5, 2));
    const round = applyMatrix(invert(m)!, applyMatrix(m, { x: 3, y: 9 }));
    expectPoint(round, 3, 9);
  });

  it('宽度被压成 0 时不可逆，返回 null', () => {
    expect(invert(scaling(0, 5))).toBeNull();
  });

  it('高度被压成 0 时不可逆', () => {
    expect(invert(scaling(5, 0))).toBeNull();
  });

  it('逆矩阵不含 NaN', () => {
    const inverse = invert(compose(rotation(2.2), scaling(0.25, 4)))!;
    for (const value of Object.values(inverse)) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });

  it('非有限行列式返回 null', () => {
    expect(invert({ a: Infinity, b: 0, c: 0, d: 1, e: 0, f: 0 })).toBeNull();
  });
});

describe('上下文变换：替换与叠加', () => {
  /** 在 1x1 源上画一个红点，经变换后画到 8x8 画布上，返回红点落在哪 */
  function drawDot(apply: (context: CanvasRenderingContext2D) => void) {
    const dot = createCanvas(1, 1);
    const dotCtx = ctx2d(dot);
    dotCtx.fillStyle = '#ff0000';
    dotCtx.fillRect(0, 0, 1, 1);

    const target = createCanvas(8, 8);
    const context = ctx2d(target);
    // 关掉平滑：放大 1x1 时插值会把 alpha 渗到相邻像素，扫描到的首个不透明点就不准了
    context.imageSmoothingEnabled = false;
    apply(context);
    context.drawImage(dot, 0, 0);
    context.setTransform(IDENTITY.a, IDENTITY.b, IDENTITY.c, IDENTITY.d, IDENTITY.e, IDENTITY.f);

    const { data } = context.getImageData(0, 0, 8, 8);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        const index = i / 4;
        return { x: index % 8, y: Math.floor(index / 8) };
      }
    }
    return null;
  }

  it('setContextTransform 会冲掉上下文已有的平移', () => {
    // 先平移 (3,3) 再 setTransform 平移 (1,1)：只剩后者，落在 (1,1)
    expect(
      drawDot((context) => {
        context.translate(3, 3);
        setContextTransform(context, translation(1, 1));
      }),
    ).toEqual({ x: 1, y: 1 });
  });

  it('concatContextTransform 保留上下文已有的平移', () => {
    // 先平移 (3,3) 再叠加平移 (1,1)：两者相加，落在 (4,4)
    expect(
      drawDot((context) => {
        context.translate(3, 3);
        concatContextTransform(context, translation(1, 1));
      }),
    ).toEqual({ x: 4, y: 4 });
  });

  it('叠加单位矩阵不改变已有变换', () => {
    expect(
      drawDot((context) => {
        context.translate(2, 5);
        concatContextTransform(context, IDENTITY);
      }),
    ).toEqual({ x: 2, y: 5 });
  });

  it('叠加时先套已有变换：平移后的缩放不放大平移量', () => {
    // translate(2,2) 再 concat scaling(3,3)：点 (0,0) 仍在 (2,2)，缩放只作用于后续坐标
    expect(
      drawDot((context) => {
        context.translate(2, 2);
        concatContextTransform(context, scaling(3, 3));
      }),
    ).toEqual({ x: 2, y: 2 });
  });

  it('两次叠加等于一次合成', () => {
    const twice = drawDot((context) => {
      concatContextTransform(context, translation(2, 1));
      concatContextTransform(context, translation(1, 2));
    });
    const once = drawDot((context) => {
      concatContextTransform(context, compose(translation(2, 1), translation(1, 2)));
    });
    expect(twice).toEqual(once);
    expect(twice).toEqual({ x: 3, y: 3 });
  });

  it('从单位状态叠加与替换效果相同', () => {
    const concatenated = drawDot((context) => concatContextTransform(context, translation(6, 7)));
    const replaced = drawDot((context) => setContextTransform(context, translation(6, 7)));
    expect(concatenated).toEqual(replaced);
    expect(concatenated).toEqual({ x: 6, y: 7 });
  });
});

describe('数值稳定性', () => {
  it('极小缩放仍可逆且能还原', () => {
    const m = scaling(1e-6, 1e-6);
    const round = applyMatrix(invert(m)!, applyMatrix(m, { x: 1, y: 1 }));
    expect(round.x).toBeCloseTo(1, 6);
  });

  it('负缩放（镜像）可逆', () => {
    const m = scaling(-2, 3);
    expect(determinant(m)).toBeCloseTo(-6, 9);
    expectPoint(applyMatrix(invert(m)!, applyMatrix(m, { x: 4, y: 5 })), 4, 5);
  });

  it('绕一圈回到原位', () => {
    let point = { x: 5, y: 0 };
    for (let i = 0; i < 4; i += 1) point = applyMatrix(rotation(Math.PI / 2), point);
    expect(point.x).toBeCloseTo(5, 9);
    expect(point.y).toBeCloseTo(0, 9);
    expect(Math.abs(point.y)).toBeLessThan(EPS);
  });
});
