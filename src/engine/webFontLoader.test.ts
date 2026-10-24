/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WEB_FONT_FAMILIES,
  isWebFontLoaded,
  loadWebFont,
  onWebFontLoaded,
  onWebFontStatus,
  requestWebFont,
  resetWebFontCacheForTests,
} from './webFontLoader';
import { WEB_FONT_SOURCES } from './webFontSources';

/**
 * 这个模块是全项目唯一联网的地方，测的重点全在「不要拖住别人」：
 * 环境不支持要立刻放弃，请求失败要记黑名单不重试，并发要合并成一次。
 *
 * 背景是一次真实事故：PSD 导入 await 过这段逻辑，CDN 不通时导入永远不返回，
 * 图层列表一直是空的，于是右键定位图层、面板滚动、点文字层编辑三个功能
 * 看起来同时坏掉了。所以下面的用例都算回归测试。
 */

const FAMILY = 'Noto Sans SC';

/** 一份最小可用的 Google Fonts 样式表回包 */
const CSS_BODY =
  "@font-face{font-family:'Noto Sans SC';src:url(https://fonts.gstatic.com/s/x.woff2) format('woff2');}";

/** 只实现 get / put 的假 IDBRequest，回调在微任务里触发 */
interface FakeRequest {
  result?: ArrayBuffer;
  onsuccess?: () => void;
  onerror?: () => void;
}

/**
 * 一个够用的假 IndexedDB，数据放在传进来的 Map 里。
 * 用它才测得了「缓存命中就不该再联网、也不该弹下载提示」这条。
 */
function fakeIndexedDB(cache: Map<string, ArrayBuffer>): IDBFactory {
  const settle = (request: FakeRequest, work: () => void) => {
    queueMicrotask(() => {
      work();
      request.onsuccess?.();
    });
    return request;
  };

  const objectStore = {
    get: (key: string) => {
      const request: FakeRequest = {};
      return settle(request, () => {
        request.result = cache.get(key);
      });
    },
    put: (value: ArrayBuffer, key: string) => {
      const request: FakeRequest = {};
      return settle(request, () => {
        cache.set(key, value);
      });
    },
  };

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    transaction: () => ({ objectStore: () => objectStore }),
  };

  return {
    open: () => {
      const request: { result: unknown; onsuccess?: () => void; onerror?: () => void } = {
        result: db,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  } as unknown as IDBFactory;
}

/**
 * 装上一整套「环境支持」的替身，返回其中的 fetch 和 fonts.add 供断言。
 * 不传 cache 时 IndexedDB 一开就失败：缓存读不到就会走下载，正是多数用例要测的那条路。
 */
function stubSupportedEnv(
  fetchImpl: (url: string) => Promise<Response>,
  cache?: Map<string, ArrayBuffer>,
) {
  const fetchSpy = vi.fn(fetchImpl);
  const addSpy = vi.fn();

  vi.stubGlobal(
    'indexedDB',
    cache
      ? fakeIndexedDB(cache)
      : {
          open: () => {
            throw new Error('测试环境没有 IndexedDB');
          },
        },
  );
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal(
    'FontFace',
    class {
      family: string;
      source: unknown;
      descriptors: unknown;
      constructor(family: string, source: unknown, descriptors?: unknown) {
        this.family = family;
        this.source = source;
        this.descriptors = descriptors;
      }
      load() {
        return Promise.resolve(this);
      }
    },
  );
  Object.defineProperty(document, 'fonts', {
    value: { add: addSpy },
    configurable: true,
  });

  return { fetchSpy, addSpy };
}

/** 一个成功的回包 */
function ok(body: string | ArrayBuffer): Response {
  return {
    ok: true,
    status: 200,
    text: () => Promise.resolve(body as string),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  } as unknown as Response;
}

beforeEach(() => {
  resetWebFontCacheForTests();
  // 失败路径会 console.warn，这里挡掉免得刷屏
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetWebFontCacheForTests();
});

describe('WEB_FONT_FAMILIES', () => {
  it('只收我们能合法分发的开源字体', () => {
    expect(WEB_FONT_FAMILIES.has('Noto Sans SC')).toBe(true);
    expect(WEB_FONT_FAMILIES.has('Noto Serif SC')).toBe(true);
    // 商业字体不能进这张表
    expect(WEB_FONT_FAMILIES.has('Microsoft YaHei')).toBe(false);
    expect(WEB_FONT_FAMILIES.has('SimSun')).toBe(false);
  });
});

describe('isWebFontLoaded', () => {
  it('没加载过的一律 false', () => {
    expect(isWebFontLoaded(FAMILY)).toBe(false);
    expect(isWebFontLoaded('压根不存在的字体')).toBe(false);
  });
});

describe('loadWebFont 的放弃条件', () => {
  it('不在白名单里的 family 直接失败，一个请求都不发', async () => {
    const { fetchSpy } = stubSupportedEnv(() => Promise.resolve(ok(CSS_BODY)));

    await expect(loadWebFont('Microsoft YaHei')).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('环境缺 FontFace 时直接失败，不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('indexedDB', {});
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('FontFace', undefined);

    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('环境缺 IndexedDB 时直接失败，不发请求', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('indexedDB', undefined);
    vi.stubGlobal('fetch', fetchSpy);

    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('loadWebFont 的成功路径', () => {
  it('下载 → 注册 → 标记为已加载', async () => {
    const { fetchSpy, addSpy } = stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    await expect(loadWebFont(FAMILY)).resolves.toBe(true);

    // 两次请求：先要样式表，再按里面的地址取 woff2
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain('fonts.googleapis.com');
    expect(fetchSpy.mock.calls[1][0]).toBe('https://fonts.gstatic.com/s/x.woff2');

    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(isWebFontLoaded(FAMILY)).toBe(true);
  });

  it('已经加载过就直接返回，不再发请求', async () => {
    const { fetchSpy } = stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    await loadWebFont(FAMILY);
    fetchSpy.mockClear();

    await expect(loadWebFont(FAMILY)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('loadWebFont 的失败与去重', () => {
  it('样式表请求失败时返回 false，不抛错', async () => {
    stubSupportedEnv(() => Promise.resolve({ ok: false, status: 404 } as Response));

    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
    expect(isWebFontLoaded(FAMILY)).toBe(false);
  });

  it('样式表里没有 woff2 地址时返回 false', async () => {
    stubSupportedEnv(() => Promise.resolve(ok('/* 空的样式表 */')));

    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
  });

  it('网络直接抛错也只是返回 false', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
  });

  it('失败过一次就进黑名单，本次会话不再重试', async () => {
    const { fetchSpy } = stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    await loadWebFont(FAMILY);
    const firstRound = fetchSpy.mock.calls.length;
    expect(firstRound).toBeGreaterThan(0);

    // 这条是关键：20 层的 PSD 不该打 20 次必然失败的请求
    await loadWebFont(FAMILY);
    await loadWebFont(FAMILY);
    expect(fetchSpy.mock.calls.length).toBe(firstRound);
  });

  it('并发请求同一个字体只发一次', async () => {
    const { fetchSpy } = stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    const results = await Promise.all([
      loadWebFont(FAMILY),
      loadWebFont(FAMILY),
      loadWebFont(FAMILY),
    ]);

    expect(results).toEqual([true, true, true]);
    // 三个调用共用一次下载，而不是各下一遍
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe('requestWebFont', () => {
  it('同步返回 undefined，不把调用方拖进等待', () => {
    stubSupportedEnv(() => new Promise(() => {})); // 永不结束的请求

    // 回归测试：这里一旦变成可 await 的，PSD 导入就会重新被网络卡住
    expect(requestWebFont(FAMILY)).toBeUndefined();
  });

  it('网络失败时不产生未捕获的 rejection', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    expect(() => requestWebFont(FAMILY)).not.toThrow();
    // 等内部那条链跑完，确认没有逃逸的 rejection
    await expect(loadWebFont(FAMILY)).resolves.toBe(false);
  });
});

describe('onWebFontLoaded', () => {
  it('字体到货时触发回调', async () => {
    stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    const spy = vi.fn();
    onWebFontLoaded(spy);
    await loadWebFont(FAMILY);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(FAMILY);
  });

  it('多个订阅方各收到一次', async () => {
    stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    const spy1 = vi.fn();
    const spy2 = vi.fn();
    onWebFontLoaded(spy1);
    onWebFontLoaded(spy2);
    await loadWebFont(FAMILY);

    expect(spy1).toHaveBeenCalledWith(FAMILY);
    expect(spy2).toHaveBeenCalledWith(FAMILY);
  });

  it('调用返回的退订函数后不再收到通知', async () => {
    stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );
    const spy = vi.fn();
    const unsubscribe = onWebFontLoaded(spy);
    unsubscribe();
    await loadWebFont(FAMILY);

    expect(spy).not.toHaveBeenCalled();
  });

  it('单个回调抛错不影响其它订阅方', async () => {
    stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    const throwingSpy = vi.fn(() => {
      throw new Error('回调炸了');
    });
    const goodSpy = vi.fn();
    onWebFontLoaded(throwingSpy);
    onWebFontLoaded(goodSpy);

    await loadWebFont(FAMILY);
    // 炸了的那个确实调到了，只是抛错被兜住了
    expect(throwingSpy).toHaveBeenCalledTimes(1);
    // 后面那个照样收到通知
    expect(goodSpy).toHaveBeenCalledWith(FAMILY);
  });

  it('失败不触发任何通知', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    const spy = vi.fn();
    onWebFontLoaded(spy);
    await loadWebFont(FAMILY);

    expect(spy).not.toHaveBeenCalled();
  });
});

/*
 * 直链源。阿里巴巴普惠体不在 Google Fonts 上，只能给一个 woff2 地址直接取，
 * 和 Google 那条「先要样式表再取字体」的两段式路径是两回事。
 */
const DIRECT_FAMILY = 'Alibaba PuHuiTi';

describe('直链源', () => {
  it('一次请求就把字体取回来，不去要样式表', async () => {
    const { fetchSpy, addSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await expect(loadWebFont(DIRECT_FAMILY)).resolves.toBe(true);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe(WEB_FONT_SOURCES[DIRECT_FAMILY].url);
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(isWebFontLoaded(DIRECT_FAMILY)).toBe(true);
  });

  it('注册用的 family 名是清单里的家族名，不是文件名', async () => {
    const { addSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await loadWebFont(DIRECT_FAMILY);

    // 注册名和 CSS 里写的 font-family 对不上的话，下载了也用不上
    expect((addSpy.mock.calls[0][0] as { family: string }).family).toBe(DIRECT_FAMILY);
  });

  it('404 时返回 false 并进黑名单', async () => {
    const { fetchSpy } = stubSupportedEnv(() =>
      Promise.resolve({ ok: false, status: 404 } as Response),
    );

    await expect(loadWebFont(DIRECT_FAMILY)).resolves.toBe(false);
    const firstRound = fetchSpy.mock.calls.length;
    await loadWebFont(DIRECT_FAMILY);
    expect(fetchSpy.mock.calls.length).toBe(firstRound);
  });
});

/*
 * 多字重。中文字体一档字重就是一个 5MB 的文件，七档是七次独立下载，
 * 所以三张表和 IndexedDB 必须按「家族名 + 字重」记账；
 * 而注册进 CSS 和弹给用户看的必须是**真家族名**——
 * 'Alibaba PuHuiTi 300' 不是任何字体的名字，拿它当 font-family 谁都匹配不上。
 */
describe('多字重', () => {
  /** 取出这次注册的那个 FontFace */
  const registered = (addSpy: ReturnType<typeof vi.fn>) =>
    addSpy.mock.calls[0][0] as { family: string; descriptors?: { weight?: string } };

  it('按字重下对应的那个文件', async () => {
    const { fetchSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await expect(loadWebFont(DIRECT_FAMILY, 300)).resolves.toBe(true);

    expect(fetchSpy.mock.calls[0][0]).toBe(WEB_FONT_SOURCES['Alibaba PuHuiTi 300'].url);
  });

  it('注册用真家族名 + weight 描述符，不是带后缀的键', async () => {
    const { addSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await loadWebFont(DIRECT_FAMILY, 300);

    // 注册成 'Alibaba PuHuiTi 300' 的话，`300 32px "Alibaba PuHuiTi"` 匹配不上，下了也白下
    expect(registered(addSpy).family).toBe(DIRECT_FAMILY);
    expect(registered(addSpy).descriptors?.weight).toBe('300');
  });

  it('不传字重就是常规档', async () => {
    const { fetchSpy, addSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await loadWebFont(DIRECT_FAMILY);

    expect(fetchSpy.mock.calls[0][0]).toBe(WEB_FONT_SOURCES[DIRECT_FAMILY].url);
    expect(registered(addSpy).descriptors?.weight).toBe('400');
  });

  it('一档到货不代表别的档也到了', async () => {
    stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await loadWebFont(DIRECT_FAMILY, 300);

    expect(isWebFontLoaded(DIRECT_FAMILY, 300)).toBe(true);
    // 混成一个键的话，Light 到货会让 Bold 的图层以为自己也好了，然后永远不下载
    expect(isWebFontLoaded(DIRECT_FAMILY, 700)).toBe(false);
    expect(isWebFontLoaded(DIRECT_FAMILY)).toBe(false);
  });

  it('两档字重各下一次，不去重成一次', async () => {
    const { fetchSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    await loadWebFont(DIRECT_FAMILY, 300);
    await loadWebFont(DIRECT_FAMILY, 700);

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const urls = fetchSpy.mock.calls.map((call) => call[0]);
    expect(new Set(urls).size).toBe(2);
  });

  it('一档失败不拖累别的档', async () => {
    // 只让 300 那个地址失败，其余照常
    const lightUrl = WEB_FONT_SOURCES['Alibaba PuHuiTi 300'].url;
    stubSupportedEnv((url) =>
      url === lightUrl
        ? Promise.resolve({ ok: false, status: 404 } as Response)
        : Promise.resolve(ok(new ArrayBuffer(8))),
    );

    await expect(loadWebFont(DIRECT_FAMILY, 300)).resolves.toBe(false);
    // 黑名单按键记，按家族记的话一个 404 会把整个家族的七档全废掉
    await expect(loadWebFont(DIRECT_FAMILY, 700)).resolves.toBe(true);
  });

  it('缓存按字重分开存，不会互相顶掉', async () => {
    const cache = new Map<string, ArrayBuffer>();
    stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))), cache);

    await loadWebFont(DIRECT_FAMILY, 300);
    await loadWebFont(DIRECT_FAMILY, 700);

    expect(cache.has('Alibaba PuHuiTi 300')).toBe(true);
    expect(cache.has('Alibaba PuHuiTi 700')).toBe(true);
  });

  it('通知报的是真家族名，不是带后缀的键', async () => {
    stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    const events: string[] = [];
    onWebFontStatus((family, status) => events.push(`${family}:${status}`));
    await loadWebFont(DIRECT_FAMILY, 300);

    // 报键的话用户会看到「缺少字体「Alibaba PuHuiTi 300」」——那不是字体的名字
    expect(events).toEqual([`${DIRECT_FAMILY}:start`, `${DIRECT_FAMILY}:loaded`]);
  });

  it('没登记的字重就近取一档，照样下得到', async () => {
    const { fetchSpy } = stubSupportedEnv(() => Promise.resolve(ok(new ArrayBuffer(8))));

    // 普惠体没有 900：npm 上的 Heavy / Black 包是削减过字符集的，缺大量汉字
    await expect(loadWebFont(DIRECT_FAMILY, 900)).resolves.toBe(true);

    expect(fetchSpy.mock.calls[0][0]).toBe(WEB_FONT_SOURCES['Alibaba PuHuiTi 800'].url);
    expect(isWebFontLoaded(DIRECT_FAMILY, 900)).toBe(true);
  });

  it('Google 源没登记字重，注册时不塞 weight 描述符', async () => {
    const { addSpy } = stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    await loadWebFont(FAMILY, 700);

    // 硬塞一个 weight 会让浏览器拿这个字面去合成粗体，而不是按它真实的粗细用
    expect(registered(addSpy).family).toBe(FAMILY);
    expect(registered(addSpy).descriptors).toBeUndefined();
  });
});

describe('onWebFontStatus', () => {
  it('走网络时先报 start，成功后报 loaded', async () => {
    stubSupportedEnv((url) =>
      Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
    );

    const events: string[] = [];
    onWebFontStatus((family, status) => events.push(`${family}:${status}`));
    await loadWebFont(FAMILY);

    expect(events).toEqual([`${FAMILY}:start`, `${FAMILY}:loaded`]);
  });

  it('失败时报 failed，不报 loaded', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    const events: string[] = [];
    onWebFontStatus((family, status) => events.push(`${family}:${status}`));
    await loadWebFont(FAMILY);

    expect(events).toEqual([`${FAMILY}:start`, `${FAMILY}:failed`]);
  });

  it('命中本地缓存时不报 start——那一下是瞬时的，弹「正在下载」纯属噪音', async () => {
    const cache = new Map<string, ArrayBuffer>([[FAMILY, new ArrayBuffer(8)]]);
    const { fetchSpy } = stubSupportedEnv(() => Promise.resolve(ok(CSS_BODY)), cache);

    const events: string[] = [];
    onWebFontStatus((family, status) => events.push(`${family}:${status}`));

    await expect(loadWebFont(FAMILY)).resolves.toBe(true);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(events).toEqual([`${FAMILY}:loaded`]);
  });

  it('下载成功后会写进缓存，下次开就不用联网', async () => {
    const cache = new Map<string, ArrayBuffer>();
    const { fetchSpy } = stubSupportedEnv(
      (url) => Promise.resolve(ok(url.includes('googleapis') ? CSS_BODY : new ArrayBuffer(8))),
      cache,
    );

    await loadWebFont(FAMILY);
    expect(cache.has(FAMILY)).toBe(true);

    // 换一次会话（清掉内存里的三张表），缓存还在就不该再发请求
    resetWebFontCacheForTests();
    fetchSpy.mockClear();
    await expect(loadWebFont(FAMILY)).resolves.toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('退订之后什么状态都收不到', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    const spy = vi.fn();
    onWebFontStatus(spy)();
    await loadWebFont(FAMILY);

    expect(spy).not.toHaveBeenCalled();
  });

  it('单个回调抛错不影响其它订阅方', async () => {
    stubSupportedEnv(() => Promise.reject(new Error('连不上')));

    const goodSpy = vi.fn();
    onWebFontStatus(() => {
      throw new Error('回调炸了');
    });
    onWebFontStatus(goodSpy);
    await loadWebFont(FAMILY);

    expect(goodSpy).toHaveBeenCalledWith(FAMILY, 'failed');
  });
});

