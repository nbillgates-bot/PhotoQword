/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  WEB_FONT_FAMILIES,
  WEB_FONT_SOURCES,
  googleFontCssUrl,
  isWebFontFamily,
  webFontKey,
  webFontKeyFor,
  webFontSource,
} from './webFontSources';

/**
 * 这张表决定我们会往哪些地址发请求，出错的后果比一般数据表严重得多，
 * 所以这里测的是它的**约束**而不是它的内容：地址必须是 https、必须锁版本、
 * 大文件必须配大超时。加新字体时这些用例就是那份检查清单。
 */

describe('WEB_FONT_FAMILIES', () => {
  it('由清单派生，不会和清单不同步', () => {
    expect([...WEB_FONT_FAMILIES].sort()).toEqual(Object.keys(WEB_FONT_SOURCES).sort());
  });

  it('收着我们要用的那几个', () => {
    expect(WEB_FONT_FAMILIES.has('Noto Sans SC')).toBe(true);
    expect(WEB_FONT_FAMILIES.has('Noto Serif SC')).toBe(true);
    expect(WEB_FONT_FAMILIES.has('Alibaba PuHuiTi')).toBe(true);
  });

  it('商业字体不能进这张表——分发它们是侵权', () => {
    for (const family of ['Microsoft YaHei', '微软雅黑', 'SimSun', '方正兰亭黑']) {
      expect(WEB_FONT_FAMILIES.has(family)).toBe(false);
    }
  });
});

describe('每个源的硬约束', () => {
  const entries = Object.entries(WEB_FONT_SOURCES);

  it('至少有一个源，否则这套下载逻辑等于没接上', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it('超时都是正的有限数', () => {
    for (const [family, source] of entries) {
      expect(Number.isFinite(source.timeoutMs), `${family} 的超时不是有限数`).toBe(true);
      expect(source.timeoutMs).toBeGreaterThan(0);
    }
  });

  it('direct 源必须有地址，google 源不该写地址', () => {
    for (const [family, source] of entries) {
      if (source.kind === 'direct') {
        expect(source.url, `${family} 登记成直链却没写地址`).toBeTruthy();
      } else {
        expect(source.url, `${family} 走样式表却写了直链`).toBeUndefined();
      }
    }
  });

  it('直链一律 https 且指向 woff2', () => {
    for (const [family, source] of entries) {
      if (source.kind !== 'direct') continue;
      // http 会被页面的混合内容策略拦掉，woff2 之外的格式 FontFace 不一定认
      expect(source.url!.startsWith('https://'), `${family} 不是 https`).toBe(true);
      expect(source.url!.endsWith('.woff2'), `${family} 不是 woff2`).toBe(true);
    }
  });

  /*
   * 这一条是供应链约束，不是格式约束。
   * npm 不允许重发同一个版本号，所以 pin 到 @1.2.3 的地址内容永远不会变；
   * 换成 @latest 就等于把一个我们不认识的发布者放进渲染路径，
   * 他哪天换了文件我们无从察觉。
   */
  it('npm CDN 的地址必须锁死版本号', () => {
    for (const [family, source] of entries) {
      const url = source.url;
      if (!url || !url.includes('cdn.jsdelivr.net/npm/')) continue;
      expect(url, `${family} 没锁版本号`).toMatch(/@\d+\.\d+\.\d+\//);
      expect(url).not.toContain('@latest');
    }
  });

  it('几 MB 的直链要配够大的超时，不然必然被自己掐断', () => {
    for (const [family, source] of entries) {
      if (!source.approxMB) continue;
      // 按 500KB/s 的保守带宽估，至少要留出 2 倍传输时间；
      // 超时太短的后果不只是这次失败，还会进黑名单，整个会话都不再重试
      const minMs = (source.approxMB * 1024) / 500 * 1000 * 2;
      expect(source.timeoutMs, `${family} 的超时不够下完 ${source.approxMB}MB`).toBeGreaterThan(
        minMs,
      );
    }
  });
});

/*
 * 多字重的约束。一个家族的每档字重是一个独立的 5MB 文件，各占清单里一个键，
 * 而注册进 CSS 时用的是真家族名 + weight 描述符——两套名字不能混。
 */
describe('多字重登记', () => {
  const entries = Object.entries(WEB_FONT_SOURCES);

  it('键要么是家族名本身，要么是「家族名 字重」', () => {
    for (const [key, source] of entries) {
      const family = source.family ?? key;
      const expected = webFontKey(family, source.weight ?? 400);
      expect(key, `${key} 的键和它的 family/weight 对不上`).toBe(expected);
    }
  });

  it('登记了字重的必须是合法的 CSS 字重', () => {
    for (const [key, source] of entries) {
      if (source.weight === undefined) continue;
      expect(Number.isInteger(source.weight), `${key} 的字重不是整数`).toBe(true);
      expect(source.weight).toBeGreaterThanOrEqual(1);
      expect(source.weight).toBeLessThanOrEqual(900);
    }
  });

  it('同一家族的每档字重指向不同的文件', () => {
    const urls = entries.filter(([, s]) => s.url).map(([, s]) => s.url!);
    // 复制粘贴改漏一处的后果是：选 Light 下到的其实是 Regular，看不出错但粗细永远不对
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('普惠体覆盖 Thin 到 ExtraBold', () => {
    for (const weight of [100, 300, 400, 500, 600, 700, 800]) {
      expect(
        webFontSource(webFontKey('Alibaba PuHuiTi', weight)),
        `普惠体缺了 ${weight} 这一档`,
      ).toBeDefined();
    }
  });

  it('文件名和字重档位对得上', () => {
    // 算 URL 的那个函数把包名从文件名推出来，推错了会 404，而 404 只在运行时才看得见
    const expectFile = (weight: number, fragment: string) => {
      const url = webFontSource(webFontKey('Alibaba PuHuiTi', weight))?.url ?? '';
      expect(url, `${weight} 这一档的地址里没有 ${fragment}`).toContain(fragment);
    };
    expectFile(100, '-35-Thin.woff2');
    expectFile(300, '-45-Light.woff2');
    expectFile(400, '-55-Regular.woff2');
    expectFile(800, '-95-ExtraBold.woff2');
  });
});

describe('webFontKey', () => {
  it('常规字重不加后缀', () => {
    // 这个键同时是 IndexedDB 的主键，改了名等于让所有老用户重下 5MB
    expect(webFontKey('Alibaba PuHuiTi', 400)).toBe('Alibaba PuHuiTi');
  });

  it('其余字重带上数字', () => {
    expect(webFontKey('Alibaba PuHuiTi', 300)).toBe('Alibaba PuHuiTi 300');
    expect(webFontKey('Alibaba PuHuiTi', 800)).toBe('Alibaba PuHuiTi 800');
  });
});

describe('isWebFontFamily', () => {
  it('认家族名，不是认清单的键', () => {
    // 清单的键带字重后缀，拿家族名直接去 WEB_FONT_FAMILIES.has 只有 400 那档碰得上
    expect(isWebFontFamily('Alibaba PuHuiTi')).toBe(true);
    expect(isWebFontFamily('Noto Sans SC')).toBe(true);
  });

  it('带字重后缀的键不是家族名', () => {
    expect(isWebFontFamily('Alibaba PuHuiTi 300')).toBe(false);
  });

  it('商业字体和不存在的名字都是 false', () => {
    expect(isWebFontFamily('Microsoft YaHei')).toBe(false);
    expect(isWebFontFamily('')).toBe(false);
  });
});

describe('webFontKeyFor', () => {
  const puhuiti = (weight: number) => webFontKeyFor('Alibaba PuHuiTi', weight);

  it('登记过的字重原样命中', () => {
    expect(puhuiti(100)).toBe('Alibaba PuHuiTi 100');
    expect(puhuiti(300)).toBe('Alibaba PuHuiTi 300');
    expect(puhuiti(500)).toBe('Alibaba PuHuiTi 500');
    expect(puhuiti(700)).toBe('Alibaba PuHuiTi 700');
    expect(puhuiti(800)).toBe('Alibaba PuHuiTi 800');
  });

  it('常规字重落到不带后缀的那个键', () => {
    // 最常见的一档，错了等于所有常规文字层都去下 Light
    expect(puhuiti(400)).toBe('Alibaba PuHuiTi');
  });

  it('没登记的档就近取', () => {
    // 200 (ExtraLight) 两边都差 100，取轻的那档，和 CSS 在 400 以下先往轻找一致
    expect(puhuiti(200)).toBe('Alibaba PuHuiTi 100');
    // 普惠体没有 900：npm 上的 Heavy / Black 包是削减过字符集的，缺大量汉字
    expect(puhuiti(900)).toBe('Alibaba PuHuiTi 800');
    expect(puhuiti(860)).toBe('Alibaba PuHuiTi 800');
  });

  it('档位之间的小数也落到某一档', () => {
    // 可变字体会给出 450 这种值，落不到任何键上就等于这个图层永远不下载
    for (const weight of [150, 250, 350, 450, 550, 650, 750, 850]) {
      expect(webFontSource(puhuiti(weight)), `${weight} 落到了空处`).toBeDefined();
    }
  });

  it('脏值一律落到一个真实存在的键，不返回 undefined 的键', () => {
    // NaN 会让每个比较都是 false，不夹一遍的话会静默落到数组第一项甚至越界
    for (const weight of [NaN, Infinity, -Infinity, 0, -100, 5000]) {
      expect(webFontSource(puhuiti(weight)), `${weight} 落到了空处`).toBeDefined();
    }
  });

  it('只有一档的家族不管要什么字重都是它', () => {
    // 思源黑体走 Google 的子集切分，没按字重分包
    expect(webFontKeyFor('Noto Sans SC', 700)).toBe('Noto Sans SC');
    expect(webFontKeyFor('Noto Sans SC', 100)).toBe('Noto Sans SC');
  });

  it('不在清单里的家族原样返回', () => {
    // 返回它自己，让调用方拿去 webFontSource 得到 undefined，不用先判一次白名单
    expect(webFontKeyFor('Microsoft YaHei', 700)).toBe('Microsoft YaHei');
  });
});

describe('webFontSource', () => {
  it('查得到清单里的字体', () => {
    expect(webFontSource('Alibaba PuHuiTi')?.kind).toBe('direct');
    expect(webFontSource('Noto Sans SC')?.kind).toBe('google');
  });

  it('不在清单里的返回 undefined', () => {
    expect(webFontSource('Microsoft YaHei')).toBeUndefined();
    expect(webFontSource('')).toBeUndefined();
  });
});

describe('googleFontCssUrl', () => {
  it('空格换成加号，家族名进 query', () => {
    expect(googleFontCssUrl('Noto Sans SC')).toContain('family=Noto%2BSans%2BSC');
  });

  it('带上简体中文子集，否则中文全是豆腐块', () => {
    expect(googleFontCssUrl('Noto Sans SC')).toContain('subset=chinese-simplified');
  });

  it('是个 https 的 googleapis 地址', () => {
    expect(googleFontCssUrl('Noto Serif SC').startsWith('https://fonts.googleapis.com/')).toBe(true);
  });
});
