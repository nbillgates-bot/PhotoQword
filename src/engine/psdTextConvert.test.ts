/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import type { LayerTextData, TextStyle, ParagraphStyle, Justification } from 'ag-psd';
import { psdTextDataToTextData } from './psdTextConvert';
import { baselineToTop } from './psdTextAnchor';
import { DEFAULT_TEXT, fontString } from './textRender';
import { BOLD_WEIGHT, NORMAL_WEIGHT } from './fontWeights';

/**
 * 报的 bug：PSD 里的文字层在编辑器里点不进去，会新建一个空文字层。
 * 根因是读入时全都标成了 raster、不带 textData，文字工具的命中检测认不出来。
 * 这个文件测的是补上的那一步转换：ag-psd 的 LayerTextData → 我们的 TextData。
 */

function mk(overrides: Partial<LayerTextData> = {}): LayerTextData {
  return { text: 'Hello', ...overrides };
}

/** 带一段样式的文字数据，走 styleRuns[0] 这条路 */
function withStyle(style: TextStyle, overrides: Partial<LayerTextData> = {}): LayerTextData {
  return mk({ styleRuns: [{ length: 5, style }], ...overrides });
}

function withPara(style: ParagraphStyle): LayerTextData {
  return mk({ paragraphStyleRuns: [{ length: 5, style }] });
}

describe('psdTextDataToTextData', () => {
  describe('文本内容与基本样式', () => {
    it('取出正文', () => {
      expect(psdTextDataToTextData(mk({ text: '你好世界' }), 0, 0).content).toBe('你好世界');
    });

    it('空文本也要能转，PSD 里允许存在空文字层', () => {
      expect(psdTextDataToTextData(mk({ text: '' }), 0, 0).content).toBe('');
    });

    it('没有任何样式时整份退回默认值', () => {
      const result = psdTextDataToTextData(mk(), 0, 0);

      /*
       * fontFamily 要过 resolveFontFamily，两条路都得成立：
       * 本机装了 Arial 就原样用，没装就退到通用无衬线族。
       * 不写死其中一条——测试跑在哪台机器上不该影响结论。
       */
      expect([DEFAULT_TEXT.fontFamily, 'sans-serif']).toContain(result.fontFamily);
      expect(result.fontSize).toBe(DEFAULT_TEXT.fontSize);
      expect(result.fontWeight).toBe(DEFAULT_TEXT.fontWeight);
      expect(result.color).toBe(DEFAULT_TEXT.color);
      expect(result.lineHeight).toBe(DEFAULT_TEXT.lineHeight);
      expect(result.letterSpacing).toBe(0);
      expect(result.align).toBe('left');
      expect(result.bold).toBe(false);
      expect(result.italic).toBe(false);
      expect(result.underline).toBe(false);
    });

    it('字体名取 font.name，本机没有才换成浏览器认的名字', () => {
      const result = psdTextDataToTextData(withStyle({ font: { name: 'SimSun' } }), 0, 0);

      /*
       * 三条路都算对：本机装着宋体就原样用（Windows 一般都装着），
       * 没装换思源宋体，连它都拿不到才退到通用衬线族。
       */
      expect(['SimSun', 'Noto Serif SC', 'serif']).toContain(result.fontFamily);
      // 只有真换掉了才记原名，UI 靠它提示「缺少字体 SimSun」
      if (result.fontFamily === 'SimSun') {
        expect(result.originalFontFamily).toBeUndefined();
      } else {
        expect(result.originalFontFamily).toBe('SimSun');
      }
    });

    it('没发生替代时不记 originalFontFamily', () => {
      // 映射表里没有的名字，本机又有的话应原样用，不该报「已替代」
      const result = psdTextDataToTextData(withStyle({ font: { name: 'Verdana' } }), 0, 0);

      if (result.fontFamily === 'Verdana') {
        expect(result.originalFontFamily).toBeUndefined();
      } else {
        expect(result.originalFontFamily).toBe('Verdana');
      }
    });

    it('粗体取 fauxBold', () => {
      expect(psdTextDataToTextData(withStyle({ fauxBold: true }), 0, 0).bold).toBe(true);
      expect(psdTextDataToTextData(withStyle({ fauxBold: false }), 0, 0).bold).toBe(false);
    });

    it('斜体取 fauxItalic', () => {
      expect(psdTextDataToTextData(withStyle({ fauxItalic: true }), 0, 0).italic).toBe(true);
    });

    /*
     * fauxBold 只表示「PS 合成的伪粗体」。用户选的是真正的粗体**字面**时
     * （Arial-BoldMT、AlibabaPuHuiTi-Bold），粗细来自字体本身，fauxBold 是 false。
     * 只看 fauxBold 的话，这类图层一进编辑就变成常规粗细，看着像「字变细了」。
     */
    it('字体名里带 Bold 的也算粗体', () => {
      for (const name of ['Arial-BoldMT', 'AlibabaPuHuiTi-Bold', 'SomeFont-SemiBold']) {
        expect(
          psdTextDataToTextData(withStyle({ font: { name }, fauxBold: false }), 0, 0).bold,
          name,
        ).toBe(true);
      }
    });

    it('字体名里带 Italic 的也算斜体', () => {
      expect(
        psdTextDataToTextData(withStyle({ font: { name: 'Arial-ItalicMT' } }), 0, 0).italic,
      ).toBe(true);
    });

    it('Light / Medium / Regular 不许被当成粗体', () => {
      for (const name of ['AlibabaPuHuiTi-Light', 'AlibabaPuHuiTi-Medium', 'AlibabaPuHuiTi-Regular']) {
        expect(psdTextDataToTextData(withStyle({ font: { name } }), 0, 0).bold, name).toBe(false);
      }
    });

    it('fauxBold 和字体名是并集，不是二选一', () => {
      // 常规字面 + PS 合成粗体，照样是粗体
      expect(
        psdTextDataToTextData(
          withStyle({ font: { name: 'AlibabaPuHuiTi-Regular' }, fauxBold: true }),
          0,
          0,
        ).bold,
      ).toBe(true);
    });

    it('字体名里的数值字重原样转出来', () => {
      const cases: Array<[string, number]> = [
        ['AlibabaPuHuiTi-Light', 300],
        ['AlibabaPuHuiTi-Medium', 500],
        ['AlibabaPuHuiTi-Bold', 700],
        ['SomeFont-SemiBold', 600],
      ];
      for (const [name, weight] of cases) {
        expect(psdTextDataToTextData(withStyle({ font: { name } }), 0, 0).fontWeight, name).toBe(
          weight,
        );
      }
    });

    /*
     * fauxBold 只说明 PS 做了合成，推不出「原字体是哪个数值字重」。
     * 所以 fontWeight 只从名字里取：Light 加了合成粗体，fontWeight 仍是 300，
     * 字体样式下拉框才能显示正确档位；bold 布尔量走并集，这一层确实是粗体。
     */
    it('fauxBold 不喂给 fontWeight，只影响 bold 布尔量', () => {
      const result = psdTextDataToTextData(
        withStyle({ font: { name: 'AlibabaPuHuiTi-Light' }, fauxBold: true }),
        0,
        0,
      );
      expect(result.fontWeight).toBe(300);
      expect(result.bold).toBe(true);
    });

    it('名字里没写字重时退回常规字重', () => {
      expect(
        psdTextDataToTextData(withStyle({ font: { name: 'Arial' } }), 0, 0).fontWeight,
      ).toBe(NORMAL_WEIGHT);
    });

    it('名字里没写字重但 fauxBold 时按粗体字重算', () => {
      expect(
        psdTextDataToTextData(withStyle({ font: { name: 'Arial' }, fauxBold: true }), 0, 0)
          .fontWeight,
      ).toBe(BOLD_WEIGHT);
    });

    it('3.0 版名字里的字重数字段不影响取值', () => {
      expect(
        psdTextDataToTextData(withStyle({ font: { name: 'AlibabaPuHuiTi-3-45-Light' } }), 0, 0)
          .fontWeight,
      ).toBe(300);
      expect(
        psdTextDataToTextData(withStyle({ font: { name: 'AlibabaPuHuiTi-3-85-Bold' } }), 0, 0)
          .fontWeight,
      ).toBe(700);
    });

    it('下划线取 underline', () => {
      expect(psdTextDataToTextData(withStyle({ underline: true }), 0, 0).underline).toBe(true);
    });
  });

  describe('颜色转换', () => {
    it('RGB 颜色转 # 串', () => {
      const result = psdTextDataToTextData(withStyle({ fillColor: { r: 255, g: 0, b: 0 } }), 0, 0);

      expect(result.color).toBe('#ff0000');
    });

    it('RGBA 的 alpha < 255 转 rgba()', () => {
      const style = withStyle({ fillColor: { r: 255, g: 128, b: 64, a: 128 } });
      const result = psdTextDataToTextData(style, 0, 0);

      expect(result.color).toMatch(/^rgba\(255,\s*128,\s*64,\s*0\.50/);
    });

    it('灰度颜色转 # 三分量相同', () => {
      const result = psdTextDataToTextData(withStyle({ fillColor: { k: 128 } }), 0, 0);

      expect(result.color).toBe('#808080');
    });

    it('不认识的色彩模型退回默认色', () => {
      const style = withStyle({ fillColor: { c: 0, m: 100, y: 100, k: 0 } as any });
      const result = psdTextDataToTextData(style, 0, 0);

      expect(result.color).toBe(DEFAULT_TEXT.color);
    });
  });

  describe('字号与缩放', () => {
    it('字号直接取 fontSize', () => {
      const result = psdTextDataToTextData(withStyle({ fontSize: 24 }), 0, 0);

      expect(result.fontSize).toBe(24);
    });

    it('字号乘以 transform 的纵向缩放倍数', () => {
      const psdText = mk({
        styleRuns: [{ length: 5, style: { fontSize: 12 } }],
        transform: [4, 0, 0, 4, 0, 0], // 横竖都放大 4 倍
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.fontSize).toBe(48); // 12 * 4
    });

    it('纵向缩放是列向量 (c, d) 的模长', () => {
      const psdText = mk({
        styleRuns: [{ length: 5, style: { fontSize: 10 } }],
        transform: [1, 0, 3, 4, 0, 0], // sqrt(3^2 + 4^2) = 5
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.fontSize).toBe(50); // 10 * 5
    });

    it('transform 为空或退化时缩放倍数退回 1', () => {
      const noTransform = psdTextDataToTextData(withStyle({ fontSize: 20 }), 0, 0);
      expect(noTransform.fontSize).toBe(20);

      const degenerateTransform = mk({
        styleRuns: [{ length: 5, style: { fontSize: 20 } }],
        transform: [0, 0, 0, 0, 0, 0],
      });
      const degenerate = psdTextDataToTextData(degenerateTransform, 0, 0);
      expect(degenerate.fontSize).toBe(20);
    });

    it('fontSize 为 0 或负数时退回默认字号', () => {
      const zero = psdTextDataToTextData(withStyle({ fontSize: 0 }), 0, 0);
      expect(zero.fontSize).toBe(DEFAULT_TEXT.fontSize);

      const negative = psdTextDataToTextData(withStyle({ fontSize: -10 }), 0, 0);
      expect(negative.fontSize).toBe(DEFAULT_TEXT.fontSize);
    });
  });

  describe('行高', () => {
    it('leading 存在且大于 0 时转成倍率', () => {
      const psdText = withStyle({ fontSize: 48, leading: 58 });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.lineHeight).toBeCloseTo(58 / 48, 3);
    });

    it('leading 为 0 或负数退回自动行高 1.2', () => {
      const zero = psdTextDataToTextData(withStyle({ fontSize: 48, leading: 0 }), 0, 0);
      expect(zero.lineHeight).toBe(DEFAULT_TEXT.lineHeight);

      const negative = psdTextDataToTextData(withStyle({ fontSize: 48, leading: -10 }), 0, 0);
      expect(negative.lineHeight).toBe(DEFAULT_TEXT.lineHeight);
    });

    it('leading 缺失退回自动行高', () => {
      const result = psdTextDataToTextData(withStyle({ fontSize: 48 }), 0, 0);

      expect(result.lineHeight).toBe(DEFAULT_TEXT.lineHeight);
    });

    it('行高除的是引擎字号（未缩放），不是缩放后字号', () => {
      const psdText = mk({
        styleRuns: [{ length: 5, style: { fontSize: 10, leading: 12 } }],
        transform: [3, 0, 0, 3, 0, 0], // 放大 3 倍
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      // 缩放后字号 = 10 * 3 = 30
      // 行高倍率 = 12 / 10 = 1.2（不是 12 / 30）
      expect(result.fontSize).toBe(30);
      expect(result.lineHeight).toBeCloseTo(1.2, 3);
    });
  });

  describe('字距', () => {
    it('tracking 千分之一 em 换算成像素', () => {
      const psdText = withStyle({ fontSize: 100, tracking: 50 });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.letterSpacing).toBe(5); // (50 / 1000) * 100
    });

    it('tracking 缺失时字距为 0', () => {
      const result = psdTextDataToTextData(withStyle({ fontSize: 100 }), 0, 0);

      expect(result.letterSpacing).toBe(0);
    });

    it('tracking 负数也允许', () => {
      const result = psdTextDataToTextData(withStyle({ fontSize: 100, tracking: -100 }), 0, 0);

      expect(result.letterSpacing).toBe(-10);
    });
  });

  describe('对齐方式', () => {
    function checkAlign(just: Justification | undefined, expected: 'left' | 'center' | 'right') {
      it(`justification ${just ?? 'undefined'} → ${expected}`, () => {
        const result = psdTextDataToTextData(withPara({ justification: just }), 0, 0);
        expect(result.align).toBe(expected);
      });
    }

    checkAlign(undefined, 'left');
    checkAlign('left', 'left');
    checkAlign('center', 'center');
    checkAlign('right', 'right');
    checkAlign('justify-left', 'left');
    checkAlign('justify-center', 'center');
    checkAlign('justify-right', 'right');
    checkAlign('justify-all', 'left');
  });

  describe('style 与 styleRuns[0] 的合并', () => {
    it('整段统一的属性上提到 style，run 里没有', () => {
      const psdText = mk({
        style: { fontSize: 20, fillColor: { r: 255, g: 0, b: 0 } },
        styleRuns: [{ length: 5, style: {} }],
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.fontSize).toBe(20);
      expect(result.color).toBe('#ff0000');
    });

    it('run 里留着的是独有值，优先级高于 style', () => {
      const psdText = mk({
        style: { fontSize: 20 },
        styleRuns: [{ length: 5, style: { fontSize: 30 } }],
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.fontSize).toBe(30);
    });

    it('两边各有一部分，必须合并才能拿全', () => {
      const psdText = mk({
        style: { fillColor: { r: 0, g: 255, b: 0 } }, // 颜色在 style
        styleRuns: [{ length: 5, style: { fontSize: 40 } }], // 字号在 run
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.fontSize).toBe(40);
      expect(result.color).toBe('#00ff00');
    });

    it('段落样式也走同样的合并路径', () => {
      const psdText = mk({
        paragraphStyle: { justification: 'center' },
        paragraphStyleRuns: [{ length: 5, style: {} }],
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.align).toBe('center');
    });
  });

  describe('坐标与文本框', () => {
    it('点文本：pointBase 加图层偏移', () => {
      const psdText = mk({ pointBase: [100, 200] });

      const result = psdTextDataToTextData(psdText, 50, 30);

      expect(result.x).toBe(150); // 100 + 50
      expect(result.y).toBe(230); // 200 + 30
      expect(result.width).toBeUndefined();
      expect(result.height).toBeUndefined();
    });

    it('段落文本：boxBounds 转成 x/y/width/height', () => {
      const psdText = mk({
        shapeType: 'box',
        boxBounds: [10, 20, 110, 70], // [left, top, right, bottom]
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.x).toBe(10);
      expect(result.y).toBe(20);
      expect(result.width).toBe(100); // 110 - 10
      expect(result.height).toBe(50); // 70 - 20
    });

    it('段落文本的 boxBounds 也要加图层偏移', () => {
      const psdText = mk({
        shapeType: 'box',
        boxBounds: [0, 0, 50, 30],
      });

      const result = psdTextDataToTextData(psdText, 100, 200);

      expect(result.x).toBe(100);
      expect(result.y).toBe(200);
      expect(result.width).toBe(50);
      expect(result.height).toBe(30);
    });

    it('boxBounds 分量顺序反了也能算对宽高（取绝对值）', () => {
      const psdText = mk({
        shapeType: 'box',
        boxBounds: [110, 70, 10, 20], // 故意反着写
      });

      const result = psdTextDataToTextData(psdText, 0, 0);

      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    it('pointBase 缺失时坐标退回 (layerLeft, layerTop)', () => {
      const psdText = mk({});

      const result = psdTextDataToTextData(psdText, 123, 456);

      expect(result.x).toBe(123);
      expect(result.y).toBe(456);
    });
  });

  /*
   * 报的 bug：PSD 的居中文字层一点进编辑就整体左移。
   *
   * 复现的关键是让 ink 边界和矩阵平移量差开：真实 PSD 里居中文字的锚点
   * （矩阵 tx）是**中线**，而图层 bounds.left 是那块像素的左边，两者差半个行宽。
   * 旧做法拿 layerLeft 当落笔点，renderText 又设了 textAlign='center'，
   * 于是文字绕自己的左边居中 —— 正好左移半个行宽。
   */
  describe('位置要用 transform 矩阵，不能拿图层 ink 边界顶替', () => {
    /** 居中的点文本：矩阵说锚点在文档 (400, 300)，ink 那块像素在 (280, 268) */
    const CENTERED = mk({
      text: '两用档设计',
      paragraphStyle: { justification: 'center' },
      styleRuns: [{ length: 5, style: { fontSize: 40 } }],
      pointBase: [0, 0],
      transform: [1, 0, 0, 1, 400, 300],
    });

    it('居中点文本的落笔点取矩阵中线，不是 ink 左边', () => {
      const result = psdTextDataToTextData(CENTERED, 280, 268);

      expect(result.align).toBe('center');
      // 旧做法会给出 280（ink 左边），文字因此左移半个行宽
      expect(result.x).toBe(400);
    });

    it('右对齐点文本同理，取矩阵给的右边', () => {
      const result = psdTextDataToTextData(
        mk({
          paragraphStyle: { justification: 'right' },
          pointBase: [0, 0],
          transform: [1, 0, 0, 1, 520, 300],
        }),
        200,
        280,
      );

      expect(result.align).toBe('right');
      expect(result.x).toBe(520);
    });

    it('纵向从基线退成行盒顶端，落在矩阵 ty 上方', () => {
      const result = psdTextDataToTextData(CENTERED, 280, 268);

      /*
       * 不写死具体像素：基线偏移取决于字体度量，拿不到时会退化成按字号估，
       * 两条路径的数值不同。改成断「差值正好是同一个 baselineToTop」——
       * 用 fontString(result) 拼，和生产代码量的是同一套字体。
       * 松成 toBeLessThan(300) 是不够的：ink 顶端 268 也满足，两条路径都能过。
       */
      const offset = baselineToTop(fontString(result), result.fontSize, result.lineHeight);

      expect(result.y).toBe(Math.round(300 - offset));
      expect(offset).toBeGreaterThan(0);
    });

    it('段落文本框跟着矩阵缩放，宽高不会缩一半', () => {
      const result = psdTextDataToTextData(
        mk({
          shapeType: 'box',
          boxBounds: [0, 0, 150, 50],
          transform: [2, 0, 0, 2, 60, 90],
        }),
        0,
        0,
      );

      expect(result.x).toBe(60);
      expect(result.y).toBe(90);
      expect(result.width).toBe(300);
      expect(result.height).toBe(100);
    });

    it('位置全程不产生 NaN —— 写进 canvas 尺寸会直接抛异常', () => {
      const result = psdTextDataToTextData(CENTERED, 280, 268);

      for (const value of [result.x, result.y]) {
        expect(Number.isNaN(value)).toBe(false);
        expect(Number.isFinite(value)).toBe(true);
      }
    });

    it('矩阵是脏数据时退回 ink 原点，不把 NaN 传下去', () => {
      const result = psdTextDataToTextData(
        mk({ pointBase: [0, 0], transform: [1, 0, 0, 1, NaN, 0] }),
        123,
        456,
      );

      expect(result.x).toBe(123);
      expect(result.y).toBe(456);
    });
  });
});
