/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { CURSORS } from './cursors';

const all = Object.entries(CURSORS);

describe('自定义光标的 CSS 值合法', () => {
  it.each(all)('%s 是 url(data:image/svg+xml,...) 形式', (_name, value) => {
    expect(value.startsWith('url("data:image/svg+xml,')).toBe(true);
  });

  it.each(all)('%s 带热点坐标和兜底关键字', (_name, value) => {
    // 形如 url("...") 2 22, crosshair
    expect(value).toMatch(/\)\s+\d+\s+\d+,\s*[a-z-]+$/);
  });

  it.each(all)('%s 的 SVG 显式声明了宽高（Safari 缺尺寸会忽略光标）', (_name, value) => {
    expect(value).toContain("width='24'");
    expect(value).toContain("height='24'");
  });

  it.each(all)('%s 不含未转义的字符，否则 data URI 会被截断', (_name, value) => {
    const body = value.slice('url("data:image/svg+xml,'.length, value.lastIndexOf('")'));
    expect(body).not.toContain('<');
    expect(body).not.toContain('>');
    expect(body).not.toContain('#');
    expect(body).not.toContain('"');
  });

  it.each(all)('%s 体积够小，超大图像浏览器会静默不显示', (_name, value) => {
    expect(value.length).toBeLessThan(2000);
  });

  it('每个光标各不相同，没有复制粘贴漏改', () => {
    const values = all.map(([, v]) => v);
    expect(new Set(values).size).toBe(values.length);
  });

  it('解码后是结构完整的 SVG', () => {
    const body = CURSORS.eyedropper;
    const raw = decodeURIComponent(
      body.slice('url("data:image/svg+xml,'.length, body.lastIndexOf('")')),
    );
    expect(raw).toContain('<svg');
    expect(raw).toContain('</svg>');
    expect(raw).toContain('xmlns=');
  });
});

/** 把光标值还原成 SVG 源码，方便断言里面的几何 */
function decodeSvg(cursor: string): string {
  return decodeURIComponent(
    cursor.slice('url("data:image/svg+xml,'.length, cursor.lastIndexOf('")')),
  );
}

const ROTATE_KEYS = [
  'rotate-n', 'rotate-ne', 'rotate-e', 'rotate-se',
  'rotate-s', 'rotate-sw', 'rotate-w', 'rotate-nw',
] as const;

/*
 * 旋转光标是自由变换里唯一按方向分成 8 个的光标。
 * 之前只有一个朝向，用户在左上角和正上方看到的是同一个图标，
 * 分不出该往哪边转。这组用例钉住"八个方向都在、且各不相同"。
 */
describe('八方向旋转光标', () => {
  it('八个方向一个不缺', () => {
    for (const key of ROTATE_KEYS) {
      expect(CURSORS[key]).toBeTruthy();
    }
  });

  it('每个方向的 SVG 都不一样，不是同一张图换个名字', () => {
    const svgs = ROTATE_KEYS.map((key) => decodeSvg(CURSORS[key]));
    expect(new Set(svgs).size).toBe(8);
  });

  it('基准方向（北）不带 rotate 变换，其余七个都带', () => {
    // 北是基准，多包一层 <g transform> 是白费
    expect(decodeSvg(CURSORS['rotate-n'])).not.toContain('rotate(');
    for (const key of ROTATE_KEYS.filter((k) => k !== 'rotate-n')) {
      expect(decodeSvg(CURSORS[key])).toContain('rotate(');
    }
  });

  it('旋转角度按罗盘顺时针递增 45°', () => {
    const angleOf = (key: (typeof ROTATE_KEYS)[number]): number => {
      const match = /rotate\((\d+(?:\.\d+)?) 12 12\)/.exec(decodeSvg(CURSORS[key]));
      return match ? Number(match[1]) : 0;
    };
    expect(angleOf('rotate-n')).toBe(0);
    expect(angleOf('rotate-ne')).toBe(45);
    expect(angleOf('rotate-e')).toBe(90);
    expect(angleOf('rotate-se')).toBe(135);
    expect(angleOf('rotate-s')).toBe(180);
    expect(angleOf('rotate-sw')).toBe(225);
    expect(angleOf('rotate-w')).toBe(270);
    expect(angleOf('rotate-nw')).toBe(315);
  });

  it('绕热点旋转，否则切换方向时光标会跳位', () => {
    // 热点是 12,12，transform 的中心必须也是 12,12
    for (const key of ROTATE_KEYS.filter((k) => k !== 'rotate-n')) {
      expect(decodeSvg(CURSORS[key])).toMatch(/rotate\([\d.]+ 12 12\)/);
    }
    for (const key of ROTATE_KEYS) {
      expect(CURSORS[key]).toMatch(/\)\s+12\s+12,/);
    }
  });

  it('路径坐标全部有限，没有 NaN 混进 d 属性', () => {
    /*
     * 坐标是手算出来的，一个减号写错就会变成 NaN 或 undefined，
     * 而 SVG 遇到坏坐标是整条路径静默不画——光标直接消失，不报错。
     */
    const svg = decodeSvg(CURSORS['rotate-n']);
    const d = /d='([^']+)'/.exec(svg)?.[1] ?? '';
    expect(d).toBeTruthy();
    expect(d).not.toContain('NaN');
    expect(d).not.toContain('undefined');
    const numbers = d.match(/-?\d+(?:\.\d+)?/g) ?? [];
    expect(numbers.length).toBeGreaterThan(0);
    for (const raw of numbers) {
      expect(Number.isFinite(Number(raw))).toBe(true);
    }
  });

  it('图形落在 24×24 画布内，超出会被浏览器裁掉', () => {
    const svg = decodeSvg(CURSORS['rotate-n']);
    const d = /d='([^']+)'/.exec(svg)?.[1] ?? '';
    // 取出所有坐标数，弧半径也在里面，一起判上下界足够挡住越界
    for (const raw of d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
      const value = Number(raw);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(24);
    }
  });

  it('闭合成一条路径，接缝处不会多画一道描边', () => {
    // 两条独立路径在相接处各描一次边，中间会出现一道黑线
    const svg = decodeSvg(CURSORS['rotate-n']);
    expect(svg.match(/<path/g)?.length).toBe(1);
    expect(svg).toContain('Z');
  });

  it('是合法 XML，浏览器不会当成坏文档整个丢掉', () => {
    for (const key of ROTATE_KEYS) {
      const doc = new DOMParser().parseFromString(decodeSvg(CURSORS[key]), 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.tagName).toBe('svg');
    }
  });

  /*
   * 坐标是手算的，所以这里把算式反过来验一遍：
   * 弧的两端必须正好落在它声明的半径上（内 5.2 / 外 8.4），
   * 否则弧和直线段接不上，图形会出现豁口。
   */
  it('弧端点落在声明的半径上，图形不会有豁口', () => {
    const svg = decodeSvg(CURSORS['rotate-n']);
    const d = /d='([^']+)'/.exec(svg)?.[1] ?? '';
    const radiusOf = (x: number, y: number) => Math.hypot(x - 12, y - 12);

    /*
     * 不写死 5.2 / 8.4：半径以后可能为了好看再调，
     * 用例该保证的是「端点落在它自己声明的那个半径上」这个不变量。
     */
    const arcs = [
      ...d.matchAll(/L ([\d.]+) ([\d.]+)\s+A ([\d.]+) \3 0 0 [01] ([\d.]+) ([\d.]+)/g),
    ];
    expect(arcs).toHaveLength(2);
    for (const arc of arcs) {
      const radius = Number(arc[3]);
      expect(radiusOf(Number(arc[1]), Number(arc[2]))).toBeCloseTo(radius, 1);
      expect(radiusOf(Number(arc[4]), Number(arc[5]))).toBeCloseTo(radius, 1);
    }
  });

  it('箭头明显比圆环带宽，缩到 24px 才看得出是箭头', () => {
    /*
     * 这条是"不好看"的量化版：箭头底边如果只比带宽一点，
     * 24px 下就退化成一道月牙，用户看不出方向。
     */
    const d = /d='([^']+)'/.exec(decodeSvg(CURSORS['rotate-n']))?.[1] ?? '';
    const radii = [...d.matchAll(/A ([\d.]+) \1/g)].map((m) => Number(m[1]));
    const band = Math.abs(radii[0] - radii[1]);
    const dist = (x: number, y: number) => Math.hypot(x - 12, y - 12);
    // 路径起点是左箭头的底边内端，第三个点是它的底边外端
    const points = [...d.matchAll(/([\d.]+) ([\d.]+)/g)].map((m) => [
      Number(m[1]),
      Number(m[2]),
    ]);
    const baseInner = dist(points[0][0], points[0][1]);
    const baseOuter = dist(points[2][0], points[2][1]);
    const headWidth = Math.abs(baseOuter - baseInner);
    expect(headWidth).toBeGreaterThan(band * 1.8);
  });

  it('内弧半径小于外弧，圆环带不会翻面', () => {
    const d = /d='([^']+)'/.exec(decodeSvg(CURSORS['rotate-n']))?.[1] ?? '';
    const radii = [...d.matchAll(/A ([\d.]+) \1/g)].map((m) => Number(m[1]));
    expect(radii).toHaveLength(2);
    // 先画外弧再画内弧，所以第一个必须更大
    expect(radii[0]).toBeGreaterThan(radii[1]);
  });
});

/*
 * 套索光标。之前两个套索工具都用浏览器自带的 crosshair，
 * 跟工具栏上的套索图标对不上，也和矩形选框分不出来。
 */
const LASSO_KEYS = ['lasso', 'polygon-lasso'] as const;

describe('套索光标', () => {
  it('两个套索工具各有自己的光标', () => {
    for (const key of LASSO_KEYS) {
      expect(CURSORS[key]).toBeTruthy();
    }
    expect(CURSORS.lasso).not.toBe(CURSORS['polygon-lasso']);
  });

  it('热点在绳尾末端，不是图标中心', () => {
    // 落笔点必须是绳子的尖，否则画出来的选区整体偏移半个图标
    for (const key of LASSO_KEYS) {
      expect(CURSORS[key]).toMatch(/\)\s+6\s+22,/);
    }
  });

  it('线稿用描两遍实现，不是填白——填白会把绳圈内部糊成一块', () => {
    for (const key of LASSO_KEYS) {
      const svg = decodeSvg(CURSORS[key]);
      expect(svg).toContain("fill='none'");
      // 先粗白线当外发光，再压一遍细黑线
      expect(svg).toContain("stroke='#ffffff'");
      expect(svg).toContain("stroke='#000000'");
      expect(svg.match(/<g /g)?.length).toBe(2);
    }
  });

  it('同一套字形描两遍，两遍的路径必须完全一致', () => {
    // 两遍不一致的话黑线会从白色外发光里漏出去，边缘发毛
    for (const key of LASSO_KEYS) {
      const groups = [...decodeSvg(CURSORS[key]).matchAll(/<g [^>]*>(.*?)<\/g>/gs)];
      expect(groups).toHaveLength(2);
      expect(groups[0][1]).toBe(groups[1][1]);
    }
  });

  it('两个光标只在绳尾不同，绳圈和绳结是同一套几何', () => {
    /*
     * PS 里这两个工具就是靠尾巴区分的：自由套索是弧线，
     * 多边形套索是带拐角的折线。绳圈部分必须一模一样，
     * 否则用户会以为拿的是两个不相干的工具。
     */
    const loopOf = (key: (typeof LASSO_KEYS)[number]) =>
      [...decodeSvg(CURSORS[key]).matchAll(/d='([^']+)'/g)].map((m) => m[1]).slice(0, 2);
    expect(loopOf('lasso')).toEqual(loopOf('polygon-lasso'));

    const knotOf = (key: (typeof LASSO_KEYS)[number]) =>
      /<circle cx='([\d.]+)' cy='([\d.]+)' r='([\d.]+)'/.exec(decodeSvg(CURSORS[key]))?.slice(1);
    expect(knotOf('lasso')).toEqual(knotOf('polygon-lasso'));

    // 尾巴不同：自由套索用圆弧命令 A，多边形套索是纯直线段
    const tailOf = (key: (typeof LASSO_KEYS)[number]) =>
      [...decodeSvg(CURSORS[key]).matchAll(/d='([^']+)'/g)].map((m) => m[1])[2];
    expect(tailOf('lasso')).toContain('a');
    expect(tailOf('polygon-lasso')).not.toMatch(/[aA]/);
    expect(tailOf('polygon-lasso')).toMatch(/L/);
  });

  it('图形落在 24×24 画布内，超出会被浏览器裁掉', () => {
    for (const key of LASSO_KEYS) {
      const svg = decodeSvg(CURSORS[key]);
      // 绳结的圆心加半径也不能出界
      const knot = /<circle cx='([\d.]+)' cy='([\d.]+)' r='([\d.]+)'/.exec(svg);
      expect(knot).not.toBeNull();
      const [cx, cy, r] = knot!.slice(1).map(Number);
      expect(cx - r).toBeGreaterThanOrEqual(0);
      expect(cy + r).toBeLessThanOrEqual(24);

      // 路径里的绝对坐标（相对位移可能为负，只查大写命令后的第一组数）
      for (const d of [...svg.matchAll(/d='([^']+)'/g)].map((m) => m[1])) {
        expect(d).not.toContain('NaN');
        expect(d).not.toContain('undefined');
        for (const raw of d.match(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g) ?? []) {
          for (const n of raw.match(/-?[\d.]+/g) ?? []) {
            expect(Number.isFinite(Number(n))).toBe(true);
            expect(Number(n)).toBeGreaterThanOrEqual(0);
            expect(Number(n)).toBeLessThanOrEqual(24);
          }
        }
      }
    }
  });

  it('是合法 XML，浏览器不会当成坏文档整个丢掉', () => {
    for (const key of LASSO_KEYS) {
      const doc = new DOMParser().parseFromString(decodeSvg(CURSORS[key]), 'image/svg+xml');
      expect(doc.querySelector('parsererror')).toBeNull();
      expect(doc.documentElement.tagName).toBe('svg');
    }
  });
});
