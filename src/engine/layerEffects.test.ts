/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { createCanvas, ctx2d } from './canvasUtils';
import {
  dilate,
  erode,
  extractSilhouette,
  renderDropShadow,
  renderOuterGlow,
  renderInnerGlow,
  renderStroke,
} from './layerEffects';
import {
  DEFAULT_DROP_SHADOW,
  DEFAULT_OUTER_GLOW,
  DEFAULT_INNER_GLOW,
  DEFAULT_STROKE,
} from '../types/effects';

/** 在画布中央画一个实心方块 */
function squareCanvas(size = 40, box = 20, color = '#ff0000'): HTMLCanvasElement {
  const canvas = createCanvas(size, size);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  const offset = Math.floor((size - box) / 2);
  context.fillRect(offset, offset, box, box);
  return canvas;
}

/** 读某点的 RGBA */
function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return [...ctx2d(canvas).getImageData(x, y, 1, 1).data];
}

/** 整幅有没有 NaN 残留 */
function hasNaN(canvas: HTMLCanvasElement): boolean {
  const image = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return [...image.data].some((value) => Number.isNaN(value));
}

/** 统计不透明像素数（alpha > 阈值） */
function opaqueCount(canvas: HTMLCanvasElement, threshold = 8): number {
  const image = ctx2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  let count = 0;
  for (let i = 3; i < image.data.length; i += 4) {
    if (image.data[i] > threshold) count += 1;
  }
  return count;
}

describe('extractSilhouette', () => {
  it('把 RGB 全部改成白色但保留 alpha', () => {
    const source = squareCanvas(20, 10, '#ff0000');
    const sil = extractSilhouette(source);

    // 方块内部：RGB 变白，alpha 保持不透明
    const inside = px(sil, 10, 10);
    expect(inside[0]).toBe(255);
    expect(inside[1]).toBe(255);
    expect(inside[2]).toBe(255);
    expect(inside[3]).toBe(255);

    // 方块外部仍然全透明
    expect(px(sil, 1, 1)[3]).toBe(0);
  });

  it('返回新画布，不改动入参', () => {
    const source = squareCanvas(20, 10, '#ff0000');
    const sil = extractSilhouette(source);
    expect(sil).not.toBe(source);
    // 入参的红色必须完好，否则调用方的图层像素就被破坏了
    expect(px(source, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it('半透明像素的 alpha 按原值保留', () => {
    const canvas = createCanvas(10, 10);
    const context = ctx2d(canvas);
    context.globalAlpha = 0.5;
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 10, 10);
    const sil = extractSilhouette(canvas);
    const alpha = px(sil, 5, 5)[3];
    // 0.5 的 alpha 大约是 128，不应被推成 0 或 255
    expect(alpha).toBeGreaterThan(100);
    expect(alpha).toBeLessThan(160);
  });
});

describe('dilate', () => {
  it('膨胀后不透明区域变大', () => {
    const sil = extractSilhouette(squareCanvas(40, 10));
    const before = opaqueCount(sil);
    const after = opaqueCount(dilate(sil, 3));
    expect(after).toBeGreaterThan(before);
  });

  it('半径小于 0.5 时按原样返回副本', () => {
    const sil = extractSilhouette(squareCanvas(20, 10));
    const result = dilate(sil, 0);
    // 是副本而不是同一个对象，避免调用方误改到源
    expect(result).not.toBe(sil);
    expect(opaqueCount(result)).toBe(opaqueCount(sil));
  });

  it('膨胀不产生 NaN', () => {
    const sil = extractSilhouette(squareCanvas(30, 12));
    expect(hasNaN(dilate(sil, 4))).toBe(false);
  });

  it('宽高为 1 的画布不抛异常', () => {
    const tiny = createCanvas(1, 1);
    ctx2d(tiny).fillRect(0, 0, 1, 1);
    expect(() => dilate(extractSilhouette(tiny), 2)).not.toThrow();
  });
});

describe('erode', () => {
  it('腐蚀后不透明区域变小', () => {
    const sil = extractSilhouette(squareCanvas(40, 20));
    const before = opaqueCount(sil);
    const after = opaqueCount(erode(sil, 3));
    expect(after).toBeLessThan(before);
  });

  it('腐蚀半径大于形状时几乎清空', () => {
    const sil = extractSilhouette(squareCanvas(40, 6));
    // 6px 的方块被 10px 腐蚀应该基本没了
    expect(opaqueCount(erode(sil, 10))).toBeLessThan(opaqueCount(sil) / 2);
  });

  it('腐蚀不产生 NaN', () => {
    const sil = extractSilhouette(squareCanvas(30, 16));
    expect(hasNaN(erode(sil, 3))).toBe(false);
  });
});

describe('renderDropShadow', () => {
  it('投影按角度与距离偏移', () => {
    const source = squareCanvas(60, 20);
    // 角度 0 距离 10：影子往 +x 方向偏，size 设 0 排除模糊干扰
    const shadow = renderDropShadow(source, {
      ...DEFAULT_DROP_SHADOW,
      angle: 0,
      distance: 10,
      size: 0,
      spread: 0,
    });

    // 方块占 20-40。影子偏移后覆盖 30-50，所以 x=45 处该有影子
    expect(px(shadow, 45, 30)[3]).toBeGreaterThan(0);
    // 原方块左边界左侧 x=22 处影子已经移走了
    expect(px(shadow, 22, 30)[3]).toBe(0);
  });

  it('投影被染成指定颜色', () => {
    const source = squareCanvas(40, 20);
    const shadow = renderDropShadow(source, {
      ...DEFAULT_DROP_SHADOW,
      color: '#0000ff',
      distance: 0,
      size: 0,
    });
    const [r, g, b, a] = px(shadow, 20, 20);
    expect(a).toBeGreaterThan(0);
    // 蓝色：B 通道高，R 通道低
    expect(b).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(g).toBeLessThan(60);
  });

  it('模糊后边缘出现半透明过渡', () => {
    const source = squareCanvas(60, 20);
    const shadow = renderDropShadow(source, {
      ...DEFAULT_DROP_SHADOW,
      distance: 0,
      size: 6,
      spread: 0,
    });
    // 方块边界在 x=20。模糊会让 x=17 附近出现介于 0 和 255 之间的 alpha。
    // 不断言具体数值：原生 filter 与手写卷积结果不可能逐像素相同（TESTING 4.5）
    const edge = px(shadow, 17, 30)[3];
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });

  it('不产生 NaN', () => {
    const source = squareCanvas(40, 20);
    expect(hasNaN(renderDropShadow(source, DEFAULT_DROP_SHADOW))).toBe(false);
  });

  it('距离为 0 且大小为 0 时形状与源对齐', () => {
    const source = squareCanvas(40, 20);
    const shadow = renderDropShadow(source, {
      ...DEFAULT_DROP_SHADOW,
      distance: 0,
      size: 0,
      spread: 0,
    });
    expect(opaqueCount(shadow)).toBe(opaqueCount(extractSilhouette(source)));
  });
});

describe('renderOuterGlow', () => {
  it('发光扩散到形状之外', () => {
    const source = squareCanvas(60, 20);
    const glow = renderOuterGlow(source, { ...DEFAULT_OUTER_GLOW, size: 8, spread: 0 });
    // 方块左边界 x=20，外侧 x=16 应该有发光
    expect(px(glow, 16, 30)[3]).toBeGreaterThan(0);
  });

  it('大小为 0 时不扩散', () => {
    const source = squareCanvas(40, 20);
    const glow = renderOuterGlow(source, { ...DEFAULT_OUTER_GLOW, size: 0, spread: 0 });
    expect(opaqueCount(glow)).toBe(opaqueCount(extractSilhouette(source)));
  });

  it('不产生 NaN', () => {
    expect(hasNaN(renderOuterGlow(squareCanvas(40, 20), DEFAULT_OUTER_GLOW))).toBe(false);
  });
});

describe('renderInnerGlow', () => {
  it('边缘模式的发光落在形状内部', () => {
    const source = squareCanvas(60, 30);
    const glow = renderInnerGlow(source, { ...DEFAULT_INNER_GLOW, source: 'edge', size: 6 });
    // 形状外部不该有内发光
    expect(px(glow, 2, 2)[3]).toBe(0);
    // 形状内靠边处该有
    expect(px(glow, 16, 30)[3]).toBeGreaterThan(0);
  });

  it('边缘模式下靠边比中心亮', () => {
    const source = squareCanvas(60, 30);
    const glow = renderInnerGlow(source, { ...DEFAULT_INNER_GLOW, source: 'edge', size: 8 });
    const nearEdge = px(glow, 17, 30)[3];
    const center = px(glow, 30, 30)[3];
    // 边缘发光的定义就是靠边强、往里衰减
    expect(nearEdge).toBeGreaterThan(center);
  });

  it('居中模式下中心比靠边亮', () => {
    const source = squareCanvas(60, 30);
    const glow = renderInnerGlow(source, { ...DEFAULT_INNER_GLOW, source: 'center', size: 8 });
    const nearEdge = px(glow, 17, 30)[3];
    const center = px(glow, 30, 30)[3];
    expect(center).toBeGreaterThan(nearEdge);
  });

  it('两种模式都不产生 NaN', () => {
    const source = squareCanvas(40, 20);
    expect(hasNaN(renderInnerGlow(source, { ...DEFAULT_INNER_GLOW, source: 'edge' }))).toBe(false);
    expect(hasNaN(renderInnerGlow(source, { ...DEFAULT_INNER_GLOW, source: 'center' }))).toBe(
      false,
    );
  });
});

describe('renderStroke', () => {
  it('外部描边落在形状之外、形状内部为空', () => {
    const source = squareCanvas(60, 20);
    const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'outside', size: 4 });
    // 方块 20-40。外描边应该出现在 x=18（边界外）
    expect(px(stroke, 18, 30)[3]).toBeGreaterThan(0);
    // 形状正中央必须是空的——外描边不覆盖内部
    expect(px(stroke, 30, 30)[3]).toBe(0);
  });

  it('内部描边落在形状之内、形状之外为空', () => {
    const source = squareCanvas(60, 20);
    const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'inside', size: 4 });
    // 边界内侧 x=22 该有描边
    expect(px(stroke, 22, 30)[3]).toBeGreaterThan(0);
    // 形状外 x=15 必须为空
    expect(px(stroke, 15, 30)[3]).toBe(0);
    // 中心被挖空
    expect(px(stroke, 30, 30)[3]).toBe(0);
  });

  it('居中描边同时跨过边界内外', () => {
    const source = squareCanvas(60, 20);
    const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'center', size: 8 });
    // 边界在 x=20，size 8 居中 => 内外各 4px
    expect(px(stroke, 18, 30)[3]).toBeGreaterThan(0);
    expect(px(stroke, 22, 30)[3]).toBeGreaterThan(0);
    expect(px(stroke, 30, 30)[3]).toBe(0);
  });

  it('描边被染成指定颜色', () => {
    const source = squareCanvas(60, 20);
    const stroke = renderStroke(source, {
      ...DEFAULT_STROKE,
      position: 'outside',
      size: 4,
      color: '#00ff00',
    });
    const [r, g, b] = px(stroke, 18, 30);
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
    expect(b).toBeLessThan(60);
  });

  it('描边大小为 1 时仍产生可见的一圈', () => {
    const source = squareCanvas(40, 20);
    const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'outside', size: 1 });
    expect(opaqueCount(stroke)).toBeGreaterThan(0);
  });

  it('三种位置都不产生 NaN', () => {
    const source = squareCanvas(40, 20);
    for (const position of ['outside', 'inside', 'center'] as const) {
      expect(hasNaN(renderStroke(source, { ...DEFAULT_STROKE, position }))).toBe(false);
    }
  });

  it('全透明输入不抛异常且描边为空', () => {
    const blank = createCanvas(20, 20);
    const stroke = renderStroke(blank, DEFAULT_STROKE);
    // 没有形状就没有边可描
    expect(opaqueCount(stroke)).toBe(0);
  });
});

describe('layerEffects - 铺满画布的不透明层（历史 bug 修复：扩边后反相才有效）', () => {
  /**
   * 默认背景层的情形：铺满画布的全白不透明层，
   * 外侧效果（投影/外发光/外描边）无处可渲染，应该全零，这是对的；
   * 但内发光和内侧描边在 PS 里沿画布边缘可见，我们不能消失。
   *
   * 根因是 erode / renderInnerGlow 对铺满画布的形状调 invertAlpha 得到全零 alpha：
   * "形状之外"那块区域根本没地方表示。修法是先扩边再反相，让"外部"有地方待，
   * 算完再裁回来。
   */
  function fullCanvas(size = 32): HTMLCanvasElement {
    const canvas = createCanvas(size, size);
    ctx2d(canvas).fillRect(0, 0, size, size);
    return canvas;
  }

  describe('renderInnerGlow', () => {
    it('edge 内发光在画布边缘应该可见（之前因反相得全零而消失）', () => {
      const source = fullCanvas(32);
      const glow = renderInnerGlow(source, {
        ...DEFAULT_INNER_GLOW,
        source: 'edge',
        choke: 0,
        size: 10,
      });

      // 左上角 (1,1) 应该有发光（靠边）
      const [r, g, b, a] = px(glow, 1, 1);
      expect(a).toBeGreaterThan(0);
      // DEFAULT_INNER_GLOW 的颜色是 #ffffff，着色后 RGB 全白
      expect(r).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(200);
      expect(b).toBeGreaterThan(200);
    });

    it('center 内发光在画布中心应该可见', () => {
      const source = fullCanvas(32);
      const glow = renderInnerGlow(source, {
        ...DEFAULT_INNER_GLOW,
        source: 'center',
        choke: 0,
        size: 10,
      });

      // 中心 (16,16) 应该比边缘亮（center = 反转 edge）
      const centerAlpha = px(glow, 16, 16)[3];
      const edgeAlpha = px(glow, 1, 1)[3];
      expect(centerAlpha).toBeGreaterThan(edgeAlpha);
    });
  });

  describe('renderStroke', () => {
    it('inside 描边在画布边缘应该可见', () => {
      const source = fullCanvas(32);
      const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'inside', size: 3 });

      // 左上角 (0,0) 应该有描边（边界往内 3px）
      expect(px(stroke, 0, 0)[3]).toBeGreaterThan(0);
      // 中心被挖空（形状-腐蚀 = 圈）
      expect(px(stroke, 16, 16)[3]).toBe(0);
    });

    it('center 描边在画布边缘应该可见', () => {
      const source = fullCanvas(32);
      const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'center', size: 6 });

      // 左上角 (0,0) 应该有描边（半径 3 往内）
      expect(px(stroke, 0, 0)[3]).toBeGreaterThan(0);
    });
  });

  describe('renderDropShadow / renderOuterGlow - 外侧效果被图层自己完全遮住', () => {
    /*
     * 这两个效果画在图层「下方」，所以铺满画布的不透明层会把它们整个遮住 ——
     * 用户看不见是合成阶段遮挡的结果，不是这里输出为空。
     * 所以断言的是"没有任何一处露在图层覆盖范围之外"，不是"缓冲全零"。
     */
    it('投影只是整体偏移，让出来的那侧为空', () => {
      const source = fullCanvas(32);
      // size 0 排除模糊干扰，让边界是硬的
      const shadow = renderDropShadow(source, {
        ...DEFAULT_DROP_SHADOW,
        angle: 135,
        distance: 10,
        size: 0,
        spread: 0,
      });

      // angle 135 => dx=-7, dy=+7：往左下偏，右边和上边让出来
      expect(px(shadow, 31, 16)[3]).toBe(0);
      expect(px(shadow, 16, 0)[3]).toBe(0);
      // 偏移后仍留在缓冲里的部分不为空
      expect(px(shadow, 10, 20)[3]).toBeGreaterThan(0);
    });

    it('外发光把铺满画布的层整个盖住，所以合成后一点都露不出来', () => {
      const source = fullCanvas(32);
      const glow = renderOuterGlow(source, { ...DEFAULT_OUTER_GLOW, size: 8 });

      // 发光覆盖范围 ⊆ 图层覆盖范围（图层是整块画布），所以必然被完全遮住。
      // 反过来说，中心必须是满不透明的——有缺口才说明发光会从图层里透出来
      expect(px(glow, 16, 16)[3]).toBe(255);
    });

    it('outside 描边被剪影减掉后确实为空', () => {
      const source = fullCanvas(32);
      const stroke = renderStroke(source, { ...DEFAULT_STROKE, position: 'outside', size: 4 });

      const pixels = ctx2d(stroke).getImageData(0, 0, 32, 32).data;
      expect(pixels.every((byte) => byte === 0)).toBe(true);
    });
  });
});
