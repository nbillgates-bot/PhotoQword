/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { AppError } from './appError';
import { NORMAL_WEIGHT } from './fontWeights';
import { getCachedFont, putCachedFont, resetWebFontDbForTests } from './webFontCache';
import {
  type WebFontSource,
  googleFontCssUrl,
  webFontKeyFor,
  webFontSource,
} from './webFontSources';

/**
 * 字体的下载、缓存与注册。
 *
 * 这里是**唯一**会联网的模块，而且刻意做成「谁都不用等它」：
 * 调用方拿到的是一个即刻返回的 requestWebFont，字体什么时候到就什么时候生效。
 * 原因见下方 requestWebFont 的注释——PSD 导入曾经 await 过这段，
 * CDN 不通时整个导入被拖住，界面看起来像死了。
 *
 * 注意：这里下载的是**字体文件**，不上传任何用户数据，
 * 与「图片处理全部在本地完成」的产品承诺不冲突。
 *
 * 规约 §0.3 的偏离说明：PS 缺字体时是让用户去系统里装一个，
 * 网页没有安装系统字体的能力（也不该有），所以退化成
 * 「下载到 IndexedDB + 用 FontFace 注册进本页」。
 * 效果上等价于这一页有了这个字体，缓存在本地，下次打开不用再下。
 */

// 白名单定义在数据文件里，这里转出去让老调用方不用改 import
export { WEB_FONT_FAMILIES, isWebFontFamily } from './webFontSources';

/** 环境支不支持这套流程。缺任何一件都直接放弃，不抛错 */
function canLoadWebFont(): boolean {
  return (
    typeof indexedDB !== 'undefined' &&
    typeof FontFace === 'function' &&
    typeof fetch === 'function' &&
    typeof document !== 'undefined' &&
    typeof document.fonts?.add === 'function'
  );
}

/**
 * 带超时的 fetch。
 * 用 AbortController 手动计时而不是 AbortSignal.timeout：
 * 后者 Safari 16 才有，我们要支持的版本里有拿不到的。
 */
async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Google Fonts：CSS 里按 unicode-range 分了多个子集，取第一个 */
async function downloadFromGoogle(family: string, timeoutMs: number): Promise<ArrayBuffer> {
  const cssResp = await fetchWithTimeout(googleFontCssUrl(family), timeoutMs);
  if (!cssResp.ok) throw new AppError('error.font.cssRequestFailed', { status: cssResp.status });

  const match = (await cssResp.text()).match(
    /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.woff2)\)/,
  );
  if (!match) throw new AppError('error.font.noWoff2');

  const fontResp = await fetchWithTimeout(match[1], timeoutMs);
  if (!fontResp.ok) throw new AppError('error.font.fileRequestFailed', { status: fontResp.status });
  return fontResp.arrayBuffer();
}

/** 直链：一次请求拿到 woff2 本体 */
async function downloadFromUrl(url: string, timeoutMs: number): Promise<ArrayBuffer> {
  const resp = await fetchWithTimeout(url, timeoutMs);
  if (!resp.ok) throw new AppError('error.font.fileRequestFailed', { status: resp.status });
  return resp.arrayBuffer();
}

function downloadFont(key: string, source: WebFontSource): Promise<ArrayBuffer> {
  if (source.kind === 'direct') {
    // i18n-exempt: 字体清单配错才会触发，是开发期错误
    if (!source.url) throw new Error(`字体 ${key} 登记成直链却没写地址`);
    return downloadFromUrl(source.url, source.timeoutMs);
  }
  // Google 那条路要用真家族名去要样式表，带字重后缀的键它不认
  return downloadFromGoogle(source.family ?? key, source.timeoutMs);
}

/**
 * 三张表分别记「成了」「废了」「正在办」。
 *
 * failed 这张表是关键：没有它的话，CDN 不通时每个文字图层都会重来一遍，
 * 一个 20 层的 PSD 等于打 40 次必然失败的请求。一次会话只试一次。
 */
const loaded = new Set<string>();
const failed = new Set<string>();
const pending = new Map<string, Promise<boolean>>();

/**
 * 字体加载的三个状态。
 * start 只在**真的要走网络**时发——命中 IndexedDB 缓存是瞬时的，
 * 为它弹一句「正在下载」纯属噪音。
 */
export type WebFontStatus = 'start' | 'loaded' | 'failed';

/**
 * 状态订阅表。
 *
 * 不用 document.fonts 的 loadingdone 事件：我们是自己 fetch、自己 FontFace.load()、
 * 最后才 add() 进去的，这条路径会不会触发那个事件各家浏览器不一致（Safari 尤其），
 * 自己记一张表既确定又好测。
 */
const listeners = new Set<(family: string, status: WebFontStatus) => void>();

/**
 * 这个字体（的这一档字重）已经注册好、可以直接用了吗。
 *
 * 不传 fontWeight 就是问常规字重。一个家族的每档字重是独立文件、独立下载，
 * 300 到了不代表 700 也到了，所以这里必须按档问。
 */
export function isWebFontLoaded(family: string, fontWeight = NORMAL_WEIGHT): boolean {
  return loaded.has(webFontKeyFor(family, fontWeight));
}

/** 订阅字体加载的全部状态变化，返回退订函数 */
export function onWebFontStatus(
  listener: (family: string, status: WebFontStatus) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 只订阅「注册完成」。绝大多数调用方要的就是这一下：重新量一遍字宽。
 * 保留成独立函数是因为它的语义窄得多，调用处不用自己过滤 status。
 */
export function onWebFontLoaded(listener: (family: string) => void): () => void {
  return onWebFontStatus((family, status) => {
    if (status === 'loaded') listener(family);
  });
}

/** 通知订阅方。遍历副本，免得回调里退订把迭代搅乱；单个回调抛错不能拖垮其余的 */
function notify(family: string, status: WebFontStatus): void {
  for (const listener of [...listeners]) {
    try {
      listener(family, status);
    } catch (err) {
      console.warn('Web 字体状态回调出错：', err);
    }
  }
}

/**
 * 下载 + 注册某个家族的某一档字重。同一个键并发调用共用一次请求。
 *
 * 三张表和 IndexedDB 全按「键」记（见 webFontKey），不是按家族名：
 * 一个家族七档字重是七个 5MB 的文件，混成一个键的话第二档永远下不下来。
 * 而对外通知与注册用的是**真家族名 + weight 描述符**，
 * 这样 `300 32px "Alibaba PuHuiTi"` 这种正常写法才匹配得上。
 */
export function loadWebFont(family: string, fontWeight = NORMAL_WEIGHT): Promise<boolean> {
  const key = webFontKeyFor(family, fontWeight);
  if (loaded.has(key)) return Promise.resolve(true);
  if (failed.has(key)) return Promise.resolve(false);

  const source = webFontSource(key);
  if (!source || !canLoadWebFont()) return Promise.resolve(false);

  const existing = pending.get(key);
  if (existing) return existing;

  // 对外一律报真家族名：带字重后缀的键是内部账，弹给用户看会变成「字体 Alibaba PuHuiTi 300」
  const cssFamily = source.family ?? key;

  const task = (async () => {
    try {
      // 先查本地缓存，没有再下载。下载成功顺手存起来，下次开就不用联网了
      let buffer = await getCachedFont(key);
      if (!buffer) {
        notify(cssFamily, 'start');
        buffer = await downloadFont(key, source);
        await putCachedFont(key, buffer);
      }

      // 不写死 weight：Google 那两个源没登记字重，硬塞 400 会让浏览器
      // 拿它去合成粗体而不是用真字面
      const descriptors = source.weight ? { weight: String(source.weight) } : undefined;
      const fontFace = new FontFace(cssFamily, buffer, descriptors);
      await fontFace.load();
      document.fonts.add(fontFace);
      loaded.add(key);
      // 先记进 loaded 再通知：回调里查 isWebFontLoaded 必须已经是 true
      notify(cssFamily, 'loaded');
      return true;
    } catch (err) {
      // 记进黑名单，本次会话不再重试
      failed.add(key);
      console.warn(`加载字体「${key}」失败，改用系统字体：`, err);
      notify(cssFamily, 'failed');
      return false;
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
  return task;
}

/**
 * 请求一个字体，**立即返回**，不告诉调用方结果。
 *
 * 故意不返回 Promise：调用方（PSD 导入）一旦 await 就会被网络牵着走。
 * 字体没到之前浏览器用后备字体画，到了之后自动换上，
 * 与 CSS `font-display: swap` 是一个道理。
 */
export function requestWebFont(family: string, fontWeight = NORMAL_WEIGHT): void {
  void loadWebFont(family, fontWeight);
}

/** 只给测试用：清掉三张缓存表和订阅表，让每个用例从干净状态开始 */
export function resetWebFontCacheForTests(): void {
  loaded.clear();
  failed.clear();
  pending.clear();
  listeners.clear();
  resetWebFontDbForTests();
}
