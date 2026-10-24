/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 可自动下载的字体清单。
 *
 * 只放**能合法自由分发**的字体：开源许可，或著作权人明确授权免费商用。
 * 商业字体（微软雅黑、方正系列等）绝对不能进这张表——那是侵权，
 * 缺了就老老实实退到通用族，让用户自己装。
 *
 * 单独成文件而不是塞在 webFontLoader 里：加一个字体应该只改数据不改逻辑（规约 §1.3），
 * 而且 webFontLoader 那边已经快到 250 行的上限了。
 */
import { NORMAL_WEIGHT, nearestOf } from './fontWeights';

/** 一个字体从哪儿取、取多久算超时 */
export interface WebFontSource {
  /**
   * google = 先取 Google Fonts 的样式表，再从里面挑 woff2 地址；
   * direct = url 本身就是 woff2。
   */
  kind: 'google' | 'direct';
  /** kind 为 direct 时的 woff2 直链 */
  url?: string;
  /**
   * 这一个源的超时。
   *
   * 不能全局共用一个值：Google 的中文子集按 unicode-range 切过，一个几十 KB；
   * 而全量中文字体一个字重就是 5MB 上下，套 8 秒等于要求 5Mbps 持续带宽，
   * 绝大多数网络都会被误杀——而且失败一次就进黑名单，整个会话都不再重试。
   */
  timeoutMs: number;
  /** 大致体积（MB），用来给用户一句「约 5MB」的心理准备。小到不值一提的就不填 */
  approxMB?: number;
  /**
   * 注册进 CSS 时用的家族名。省略表示「键本身就是家族名」。
   *
   * 一个家族的多个字重是多个独立文件，只能各占一个键（'Alibaba PuHuiTi 300'），
   * 但那串不是字体的真名，拿它当 font-family 会让 `300 32px "Alibaba PuHuiTi"`
   * 这种正常写法匹配不上。所以键只用于下载和缓存，注册时用这里的家族名 + weight 描述符，
   * 由浏览器按 CSS font matching 自己挑档。
   */
  family?: string;
  /** 这个文件是哪一档字重（100-900）。省略表示按常规字重注册 */
  weight?: number;
}

/** Google 子集几十 KB，8 秒足够，卡住了也不心疼 */
const GOOGLE_TIMEOUT_MS = 8_000;

/** 全量中文字体按 500KB/s 的保守带宽估，5MB 需要 10 秒，留够三倍余量 */
const LARGE_CJK_TIMEOUT_MS = 120_000;

/**
 * 一个家族一个字重对应一个键。
 *
 * 常规字重（400）不加后缀：这个键在多字重支持之前就存在，
 * 而且它同时是 IndexedDB 的主键——改了名等于让所有老用户重下 5MB。
 */
export function webFontKey(family: string, weight: number): string {
  return weight === NORMAL_WEIGHT ? family : `${family} ${weight}`;
}

const PUHUITI = 'Alibaba PuHuiTi';

/**
 * 普惠体的字重 → 文件名。
 *
 * 左边是 CSS 数值字重，右边是阿里自己的编号命名（35/45/55… 是他们的字重序号，
 * 和 CSS 的 100/300/400 不是一回事，所以两边都得写明，不能算）。
 */
const PUHUITI_FILES: Readonly<Record<number, string>> = {
  100: 'AlibabaPuHuiTi-3-35-Thin',
  300: 'AlibabaPuHuiTi-3-45-Light',
  400: 'AlibabaPuHuiTi-3-55-Regular',
  500: 'AlibabaPuHuiTi-3-65-Medium',
  600: 'AlibabaPuHuiTi-3-75-SemiBold',
  700: 'AlibabaPuHuiTi-3-85-Bold',
  800: 'AlibabaPuHuiTi-3-95-ExtraBold',
};

/** 一条普惠体源。npm 包名就是文件名的全小写形式，所以能算出来，不用再写一遍 */
function puhuiti(weight: number): WebFontSource {
  const file = PUHUITI_FILES[weight];
  return {
    kind: 'direct',
    url: `https://cdn.jsdelivr.net/npm/${file.toLowerCase()}@1.0.0/${file}.woff2`,
    timeoutMs: LARGE_CJK_TIMEOUT_MS,
    approxMB: 5,
    family: PUHUITI,
    weight,
  };
}

/** 把一个家族的多个字重摊成多条源 */
function weightedSources(
  family: string,
  weights: readonly number[],
  make: (weight: number) => WebFontSource,
): Record<string, WebFontSource> {
  return Object.fromEntries(weights.map((weight) => [webFontKey(family, weight), make(weight)]));
}

export const WEB_FONT_SOURCES: Record<string, WebFontSource> = {
  // 思源黑体 / 思源宋体，SIL OFL 许可
  'Noto Sans SC': { kind: 'google', timeoutMs: GOOGLE_TIMEOUT_MS },
  'Noto Serif SC': { kind: 'google', timeoutMs: GOOGLE_TIMEOUT_MS },

  /*
   * 阿里巴巴普惠体 3.0。著作权人（阿里巴巴）声明全部字重免费商用，
   * 但没上 Google Fonts，只能走直链。
   *
   * 地址 pin 死到 @1.0.0：npm 不允许重发同一个版本号，所以这个 URL 的字节内容
   * 从此不会变。用 @latest 等于把一个我们不认识的发布者放进渲染路径，
   * 哪天他换了文件我们无从察觉。
   *
   * 登记七个字重（100/300/400/500/600/700/800），覆盖 Thin 到 ExtraBold。
   * 没有 900（Heavy）和更重的 Black：npm 上这两个包只有约 1.4–1.5 MB，
   * 是削减过字符集的，缺大量汉字，不能当完整 CJK 字体用。
   * 900 退到 800 或浏览器合成，比装个残缺字体好。
   */
  ...weightedSources(
    PUHUITI,
    Object.keys(PUHUITI_FILES).map(Number),
    puhuiti,
  ),
};

/**
 * 白名单。
 * 由清单派生而不是另写一份，避免「加了源却忘了加白名单」这类两处不同步的 bug。
 */
export const WEB_FONT_FAMILIES = new Set(Object.keys(WEB_FONT_SOURCES));

export function webFontSource(key: string): WebFontSource | undefined {
  return WEB_FONT_SOURCES[key];
}

/**
 * 家族名 → 这个家族登记了哪些字重。
 *
 * 由清单派生：加一个字重只改上面的数据，这里自动跟上（规约 §1.3）。
 */
const REGISTERED_WEIGHTS: ReadonlyMap<string, readonly number[]> = (() => {
  const byFamily = new Map<string, number[]>();
  for (const [key, source] of Object.entries(WEB_FONT_SOURCES)) {
    const family = source.family ?? key;
    const list = byFamily.get(family) ?? [];
    list.push(source.weight ?? NORMAL_WEIGHT);
    byFamily.set(family, list);
  }
  return byFamily;
})();

/** 这个家族名是我们能下载的吗。注意清单的键带字重后缀，不能直接拿 family 去 has() */
export function isWebFontFamily(family: string): boolean {
  return REGISTERED_WEIGHTS.has(family);
}

/**
 * 可下载的家族名清单（不含字重后缀），给字体下拉框用。
 *
 * 由 REGISTERED_WEIGHTS 派生，而不是让调用方自己去 Object.entries 里
 * 拿 source.family 归并——键的格式是本文件的内部约定，反解也该留在这里。
 * approxMB 取该家族任意一档：同家族各字重体积相近，提示「约 5MB」够用了。
 */
export function webFontFamilyList(): { family: string; approxMB?: number }[] {
  const sizeOf = new Map<string, number | undefined>();
  for (const source of Object.values(WEB_FONT_SOURCES)) {
    const family = source.family ?? '';
    if (family && !sizeOf.has(family)) sizeOf.set(family, source.approxMB);
  }
  return [...REGISTERED_WEIGHTS.keys()].map((family) => ({
    family,
    approxMB: sizeOf.get(family),
  }));
}

/**
 * 把 (家族名, 想要的字重) 映射到清单里那个键。
 *
 * 家族只登记了部分字重时就近取一档：普惠体没有 900（npm 上的 Heavy 和 Black 包
 * 只有 1.4MB 上下，是削减过字符集的，缺大量汉字），所以 900 会落到 800，
 * 剩下那点粗度差交给浏览器合成——比装一个缺字的字体好。
 *
 * 家族不在清单里时原样返回，让 webFontSource 去判 undefined，
 * 调用方不用先问一遍「这个字体在不在清单里」。
 */
export function webFontKeyFor(family: string, fontWeight: number): string {
  const weights = REGISTERED_WEIGHTS.get(family);
  if (!weights) return family;
  return webFontKey(family, nearestOf(weights, fontWeight));
}

/**
 * Google Fonts 的样式表地址。
 * 带 subset=chinese-simplified 是为了拿到中文子集那一段，
 * 否则默认只给拉丁字符，中文照样是豆腐块。
 */
export function googleFontCssUrl(family: string): string {
  return (
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family.replace(/ /g, '+'))}` +
    '&subset=chinese-simplified&display=swap'
  );
}
