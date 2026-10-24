/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { splitFontName } from './fontName';

/**
 * 这个函数是「PSD 里的字体名对不上替换表」那一类问题的总闸门。
 *
 * 真实案例：一个 PSD 用了阿里巴巴普惠体的三个字重，PSD 里存成
 * AlibabaPuHuiTi-Medium / -Light / -Regular，替换表里只有家族名，
 * 于是三层全部退到 sans-serif，重新编辑时字形和位置全变。
 *
 * 反向的风险同样要防住：削过头会把家族名的一部分当字重削掉
 * （SimSun-ExtB 的 ExtB），那是另一种走样，所以下面正反两类用例都要有。
 */

describe('splitFontName 削字重后缀', () => {
  it('阿里巴巴普惠体的各字重都归到同一个家族名', () => {
    for (const suffix of ['Light', 'Regular', 'Medium', 'Bold', 'Heavy']) {
      expect(splitFontName(`AlibabaPuHuiTi-${suffix}`).base).toBe('AlibabaPuHuiTi');
    }
  });

  it('3.0 版名字里的字重数字一起削掉', () => {
    // AlibabaPuHuiTi-3-55-Regular 这种，中间那两段数字不削就永远匹配不上
    expect(splitFontName('AlibabaPuHuiTi-3-55-Regular').base).toBe('AlibabaPuHuiTi');
    expect(splitFontName('AlibabaPuHuiTi-3-85-Bold').base).toBe('AlibabaPuHuiTi');
    expect(splitFontName('AlibabaPuHuiTi-3-45-Light').base).toBe('AlibabaPuHuiTi');
  });

  it('认得 Monotype / Adobe 的厂商后缀', () => {
    expect(splitFontName('Arial-BoldMT').base).toBe('Arial');
    expect(splitFontName('Arial-ItalicMT').base).toBe('Arial');
    expect(splitFontName('Arial-BoldItalicMT').base).toBe('Arial');
  });

  it('复合字形段（BoldItalic）也能整段削掉', () => {
    expect(splitFontName('SomeFont-BoldItalic').base).toBe('SomeFont');
    expect(splitFontName('SomeFont-SemiBoldOblique').base).toBe('SomeFont');
  });

  it('大小写不影响', () => {
    expect(splitFontName('SomeFont-BOLD').base).toBe('SomeFont');
    expect(splitFontName('SomeFont-medium').base).toBe('SomeFont');
  });
});

describe('splitFontName 不该削的一律不动', () => {
  it('没有分隔符的名字原样返回', () => {
    for (const name of ['ArialMT', 'SimSun', '微软雅黑', 'AlibabaPuHuiTi', '']) {
      expect(splitFontName(name).base).toBe(name);
    }
  });

  it('尾巴不是字重词就停手，家族名的一部分不能当后缀削掉', () => {
    expect(splitFontName('SimSun-ExtB').base).toBe('SimSun-ExtB');
    expect(splitFontName('KaiTi_GB2312').base).toBe('KaiTi_GB2312');
    expect(splitFontName('Noto-Sans-SC').base).toBe('Noto-Sans-SC');
  });

  it('分隔符是下划线时不能被换成连字符', () => {
    // 拼回去时猜错分隔符，等于把一个没削过的名字改了样，后面查表全落空
    expect(splitFontName('楷体_GB2312').base).toBe('楷体_GB2312');
  });

  it('至少留一段，不会把整个名字削没', () => {
    expect(splitFontName('Bold').base).toBe('Bold');
    expect(splitFontName('Regular').base).toBe('Regular');
  });

  it('替换表里现有的键削完还是自己，加了这一步不该改变老行为', () => {
    for (const key of ['MicrosoftYaHei', 'SimSun-ExtB', 'Microsoft YaHei', '宋体', 'Verdana']) {
      expect(splitFontName(key).base).toBe(key);
    }
  });
});

describe('splitFontName 认字重和字形', () => {
  it('名字带 Bold 的算粗体', () => {
    for (const name of ['Arial-BoldMT', 'AlibabaPuHuiTi-Bold', 'X-SemiBold', 'X-Heavy', 'X-Black']) {
      expect(splitFontName(name).bold).toBe(true);
    }
  });

  it('名字带 Italic / Oblique 的算斜体', () => {
    expect(splitFontName('Arial-ItalicMT').italic).toBe(true);
    expect(splitFontName('X-Oblique').italic).toBe(true);
  });

  it('BoldItalic 两个都算上', () => {
    const parts = splitFontName('Arial-BoldItalicMT');
    expect(parts.bold).toBe(true);
    expect(parts.italic).toBe(true);
  });

  it('常规字重不算粗也不算斜', () => {
    for (const name of ['AlibabaPuHuiTi-Regular', 'AlibabaPuHuiTi-Light', 'X-Medium', 'SimSun']) {
      const parts = splitFontName(name);
      expect(parts.bold).toBe(false);
      expect(parts.italic).toBe(false);
    }
  });

  it('Light / Medium 也削，但不该被当成粗体', () => {
    // Light 落到数值字重 300，bold 布尔量仍是 false——两者是各自独立的结论
    expect(splitFontName('AlibabaPuHuiTi-Light')).toEqual({
      base: 'AlibabaPuHuiTi',
      bold: false,
      italic: false,
      fontWeight: 300,
    });
  });
});

/*
 * 数值字重是「Light/Medium 层导进来别全变 Regular」的唯一依据。
 * bold 布尔量表达不了 300 和 500 的差别，所以这里单独测名字里的数值。
 */
describe('splitFontName 取名字里的数值字重', () => {
  it('常见字重词各自对上 CSS 数值', () => {
    const cases: Array<[string, number]> = [
      ['X-Thin', 100],
      ['X-ExtraLight', 200],
      ['X-Light', 300],
      ['X-Regular', 400],
      ['X-Medium', 500],
      ['X-SemiBold', 600],
      ['X-DemiBold', 600],
      ['X-Bold', 700],
      ['X-ExtraBold', 800],
      ['X-Heavy', 900],
      ['X-Black', 900],
    ];
    for (const [name, weight] of cases) {
      expect(splitFontName(name).fontWeight).toBe(weight);
    }
  });

  it('3.0 版的字重数字段不影响取值', () => {
    expect(splitFontName('AlibabaPuHuiTi-3-45-Light').fontWeight).toBe(300);
    expect(splitFontName('AlibabaPuHuiTi-3-55-Regular').fontWeight).toBe(400);
    expect(splitFontName('AlibabaPuHuiTi-3-85-Bold').fontWeight).toBe(700);
  });

  it('带厂商后缀和复合字形段的也取得到', () => {
    expect(splitFontName('Arial-BoldMT').fontWeight).toBe(700);
    expect(splitFontName('Arial-BoldItalicMT').fontWeight).toBe(700);
    expect(splitFontName('SomeFont-SemiBoldOblique').fontWeight).toBe(600);
  });

  it('名字里没写字重就是 undefined，不能当成 400', () => {
    // Arial 和 Arial-Regular 得能分开：后者是用户明确挑过 Regular 的结果
    expect(splitFontName('Arial').fontWeight).toBeUndefined();
    expect(splitFontName('SimSun-ExtB').fontWeight).toBeUndefined();
    expect(splitFontName('Arial-ItalicMT').fontWeight).toBeUndefined();
    expect(splitFontName('Arial-Regular').fontWeight).toBe(400);
  });

  it('大小写不影响', () => {
    expect(splitFontName('SomeFont-BOLD').fontWeight).toBe(700);
    expect(splitFontName('SomeFont-medium').fontWeight).toBe(500);
  });
});
