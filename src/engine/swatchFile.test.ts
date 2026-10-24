/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { parseAco, parseAse, parseSwatchFile } from './swatchFile';

/**
 * 色板文件解析。
 *
 * 测试数据全部是手工合成的二进制，不含任何真实色库内容 ——
 * 潘通那类色库有知识产权，测试里放不得，也没必要放：
 * 要验的是格式解析，跟具体色号无关。
 */

/** 按字节数组造 ArrayBuffer */
function buf(bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** 把字符串写成 4 字节 ASCII 标签 */
const tag = (text: string) => [...text].map((c) => c.charCodeAt(0));

/** u16 大端 */
const u16 = (n: number) => [(n >> 8) & 255, n & 255];

/** u32 大端 */
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** f32 大端 */
function f32(value: number): number[] {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return [0, 1, 2, 3].map((i) => view.getUint8(i));
}

/** UTF-16BE 字符串（含结尾 NUL），返回 [字符数, 字节...] */
function utf16(text: string): { len: number; bytes: number[] } {
  const bytes: number[] = [];
  for (const char of text) bytes.push(...u16(char.charCodeAt(0)));
  bytes.push(...u16(0));
  return { len: text.length + 1, bytes };
}

/** 造一个含单个 RGB 颜色的 .ase */
function aseRgb(name: string, r: number, g: number, b: number): ArrayBuffer {
  const label = utf16(name);
  const body = [...u16(label.len), ...label.bytes, ...tag('RGB '), ...f32(r), ...f32(g), ...f32(b)];
  return buf([
    ...tag('ASEF'),
    ...u16(1),
    ...u16(0),
    ...u32(1),
    ...u16(0x0001),
    ...u32(body.length),
    ...body,
  ]);
}

describe('parseAse', () => {
  it('认不出魔数就报 notAse', () => {
    expect(parseAse(buf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])).reasonKey).toBe('swatch.notAse');
  });

  it('太短的文件不崩，报 notAse', () => {
    expect(parseAse(buf([0x41, 0x53])).reasonKey).toBe('swatch.notAse');
  });

  it('读出 RGB 颜色与名字', () => {
    const result = parseAse(aseRgb('Test Red', 1, 0, 0));
    expect(result.reasonKey).toBeUndefined();
    expect(result.swatches).toEqual([{ hex: '#ff0000', name: 'Test Red' }]);
  });

  it('名字里的非 ASCII 字符能读出来', () => {
    expect(parseAse(aseRgb('深红', 1, 0, 0)).swatches[0].name).toBe('深红');
  });

  it('Lab 颜色能转出合法的 hex', () => {
    // L=100, a=0, b=0 是白色
    const label = utf16('White');
    const body = [
      ...u16(label.len),
      ...label.bytes,
      ...tag('LAB '),
      ...f32(1),
      ...f32(0),
      ...f32(0),
    ];
    const file = buf([
      ...tag('ASEF'),
      ...u16(1),
      ...u16(0),
      ...u32(1),
      ...u16(0x0001),
      ...u32(body.length),
      ...body,
    ]);
    const { swatches } = parseAse(file);
    expect(swatches[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    // L=100 应该落在很亮的一端
    expect(swatches[0].hex).toBe('#ffffff');
  });

  it('Lab 黑色转出 #000000', () => {
    const label = utf16('K');
    const body = [
      ...u16(label.len),
      ...label.bytes,
      ...tag('LAB '),
      ...f32(0),
      ...f32(0),
      ...f32(0),
    ];
    const file = buf([
      ...tag('ASEF'),
      ...u16(1),
      ...u16(0),
      ...u32(1),
      ...u16(0x0001),
      ...u32(body.length),
      ...body,
    ]);
    expect(parseAse(file).swatches[0].hex).toBe('#000000');
  });

  it('CMYK 四个 0 是白色，K=1 是黑色', () => {
    const make = (c: number, m: number, y: number, k: number) => {
      const label = utf16('x');
      const body = [
        ...u16(label.len),
        ...label.bytes,
        ...tag('CMYK'),
        ...f32(c),
        ...f32(m),
        ...f32(y),
        ...f32(k),
      ];
      return buf([
        ...tag('ASEF'),
        ...u16(1),
        ...u16(0),
        ...u32(1),
        ...u16(0x0001),
        ...u32(body.length),
        ...body,
      ]);
    };
    expect(parseAse(make(0, 0, 0, 0)).swatches[0].hex).toBe('#ffffff');
    expect(parseAse(make(0, 0, 0, 1)).swatches[0].hex).toBe('#000000');
  });

  it('跳过不认识的色彩空间而不是整个文件失败', () => {
    const label = utf16('weird');
    const bad = [...u16(label.len), ...label.bytes, ...tag('XYZ?'), ...f32(0), ...f32(0), ...f32(0)];
    const good = utf16('ok');
    const okBody = [
      ...u16(good.len),
      ...good.bytes,
      ...tag('RGB '),
      ...f32(0),
      ...f32(1),
      ...f32(0),
    ];
    const file = buf([
      ...tag('ASEF'),
      ...u16(1),
      ...u16(0),
      ...u32(2),
      ...u16(0x0001),
      ...u32(bad.length),
      ...bad,
      ...u16(0x0001),
      ...u32(okBody.length),
      ...okBody,
    ]);
    expect(parseAse(file).swatches).toEqual([{ hex: '#00ff00', name: 'ok' }]);
  });

  it('组标记块被跳过，不当成颜色', () => {
    const groupName = utf16('Group A');
    const groupBody = [...u16(groupName.len), ...groupName.bytes];
    const color = utf16('c');
    const colorBody = [
      ...u16(color.len),
      ...color.bytes,
      ...tag('RGB '),
      ...f32(0),
      ...f32(0),
      ...f32(1),
    ];
    const file = buf([
      ...tag('ASEF'),
      ...u16(1),
      ...u16(0),
      ...u32(3),
      ...u16(0xc001),
      ...u32(groupBody.length),
      ...groupBody,
      ...u16(0x0001),
      ...u32(colorBody.length),
      ...colorBody,
      ...u16(0xc002),
      ...u32(0),
    ]);
    expect(parseAse(file).swatches).toEqual([{ hex: '#0000ff', name: 'c' }]);
  });

  it('块数声明多于实际内容时不崩，交出已读到的', () => {
    const label = utf16('a');
    const body = [
      ...u16(label.len),
      ...label.bytes,
      ...tag('RGB '),
      ...f32(1),
      ...f32(1),
      ...f32(0),
    ];
    // 声明 99 个块，实际只给 1 个
    const file = buf([
      ...tag('ASEF'),
      ...u16(1),
      ...u16(0),
      ...u32(99),
      ...u16(0x0001),
      ...u32(body.length),
      ...body,
    ]);
    expect(parseAse(file).swatches).toHaveLength(1);
  });

  it('一个颜色都没有时报 empty', () => {
    const file = buf([...tag('ASEF'), ...u16(1), ...u16(0), ...u32(0)]);
    expect(parseAse(file).reasonKey).toBe('swatch.empty');
  });
});

/** .aco 的一个颜色项：色彩空间 + 4 个 u16 */
const acoEntry = (space: number, a = 0, b = 0, c = 0, d = 0) => [
  ...u16(space),
  ...u16(a),
  ...u16(b),
  ...u16(c),
  ...u16(d),
];

describe('parseAco', () => {
  it('版本号不是 1/2 就报 notAco', () => {
    expect(parseAco(buf([...u16(9), ...u16(1)])).reasonKey).toBe('swatch.notAco');
  });

  it('太短的文件不崩', () => {
    expect(parseAco(buf([0, 1])).reasonKey).toBe('swatch.notAco');
  });

  it('数量为 0 时报 empty', () => {
    expect(parseAco(buf([...u16(1), ...u16(0)])).reasonKey).toBe('swatch.empty');
  });

  it('v1 读出 RGB 色值（没有名字）', () => {
    // RGB 空间(0)，65535 对应 255
    const file = buf([...u16(1), ...u16(1), ...acoEntry(0, 65535, 0, 0)]);
    expect(parseAco(file).swatches).toEqual([{ hex: '#ff0000' }]);
  });

  it('v1 的灰度按 0..10000 换算', () => {
    const file = buf([...u16(1), ...u16(1), ...acoEntry(8, 10000)]);
    expect(parseAco(file).swatches).toEqual([{ hex: '#ffffff' }]);
  });

  it('CMYK 是反的：全 65535 表示无墨，是白色', () => {
    /*
     * 这一条专门钉住 .aco 的 CMYK 反向语义。
     * 写成正向的话，白色会变成黑色 —— 整个色库反相，很显眼但容易写错。
     */
    const white = buf([...u16(1), ...u16(1), ...acoEntry(2, 65535, 65535, 65535, 65535)]);
    expect(parseAco(white).swatches[0].hex).toBe('#ffffff');
    const black = buf([...u16(1), ...u16(1), ...acoEntry(2, 65535, 65535, 65535, 0)]);
    expect(parseAco(black).swatches[0].hex).toBe('#000000');
  });

  it('Lab 的 a/b 按有符号读，负值不会变成大正数', () => {
    // L=5000(50), a=-2000(-20), b=0 —— 偏绿的中灰
    const file = buf([...u16(1), ...u16(1), ...acoEntry(7, 5000, 0xf830, 0)]);
    const { swatches } = parseAco(file);
    expect(swatches[0].hex).toMatch(/^#[0-9a-f]{6}$/);
    // a 为负 -> 偏绿，绿分量应该高于红分量
    const hex = swatches[0].hex;
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    expect(g).toBeGreaterThan(r);
  });

  it('v2 段的名字优先于 v1', () => {
    /*
     * 潘通色号就在 v2 的名字里，所以必须优先取 v2。
     * 只读 v1 的话导进来全是无名色块，等于丢掉了色号 —— 那正是用户要的东西。
     */
    const name = utf16('PMS Example 123');
    const file = buf([
      // v1 段
      ...u16(1),
      ...u16(1),
      ...acoEntry(0, 0, 65535, 0),
      // v2 段
      ...u16(2),
      ...u16(1),
      ...acoEntry(0, 0, 65535, 0),
      ...u32(name.len),
      ...name.bytes,
    ]);
    expect(parseAco(file).swatches).toEqual([{ hex: '#00ff00', name: 'PMS Example 123' }]);
  });

  it('v2 段截断时退回已读到的内容，不崩', () => {
    const file = buf([
      ...u16(1),
      ...u16(1),
      ...acoEntry(0, 65535, 0, 0),
      ...u16(2),
      ...u16(5),
      ...acoEntry(0, 65535, 0, 0),
      // 名字长度声明了但字节不够
      ...u32(50),
    ]);
    const { swatches } = parseAco(file);
    expect(swatches.length).toBeGreaterThan(0);
    expect(swatches[0].hex).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('只有 v1 没有 v2 时正常返回 v1', () => {
    const file = buf([...u16(1), ...u16(2), ...acoEntry(0, 65535, 0, 0), ...acoEntry(0, 0, 0, 65535)]);
    expect(parseAco(file).swatches).toHaveLength(2);
  });
});

describe('parseSwatchFile 按后缀分派', () => {
  it('.ase 走 ase 解析', () => {
    expect(parseSwatchFile('my.ase', aseRgb('a', 1, 0, 0)).swatches).toHaveLength(1);
  });

  it('.aco 走 aco 解析', () => {
    const file = buf([...u16(1), ...u16(1), ...acoEntry(0, 65535, 0, 0)]);
    expect(parseSwatchFile('my.aco', file).swatches).toHaveLength(1);
  });

  it('后缀大写也认', () => {
    expect(parseSwatchFile('MY.ASE', aseRgb('a', 1, 0, 0)).swatches).toHaveLength(1);
  });

  it('后缀不认识时靠内容认出 ase', () => {
    expect(parseSwatchFile('blob.bin', aseRgb('a', 0, 1, 0)).swatches).toHaveLength(1);
  });

  it('两种都不是时报 unsupported', () => {
    const junk = buf([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);
    expect(parseSwatchFile('x.txt', junk).reasonKey).toBe('swatch.unsupported');
  });

  it('空文件不崩', () => {
    expect(parseSwatchFile('x.ase', new ArrayBuffer(0)).swatches).toEqual([]);
  });
});
