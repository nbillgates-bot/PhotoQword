/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { createCanvas, ctx2d } from './canvasUtils';
import { splitFontName } from './fontName';
import { NORMAL_WEIGHT } from './fontWeights';
import { isWebFontFamily, isWebFontLoaded, requestWebFont } from './webFontLoader';

/**
 * PSD 字体名 → 浏览器能用的 CSS font-family。
 *
 * PSD 里存的是 PostScript 名（MicrosoftYaHei）或全名（微软雅黑），
 * 这两种都不一定是本机装着的 family 名，而且换台机器就可能没有。
 * 这里做两件事：换成浏览器认的名字，以及在本机没有时挑一个能替代的。
 *
 * **这个模块是同步的，不联网。** 需要下载的开源字体交给 webFontLoader
 * 在后台办，不让 PSD 导入等网络——那条路踩过一次坑，见 requestWebFont 的注释。
 */

/** PSD 字体全名 / PostScript 名 → CSS font-family */
export const FONT_FALLBACK_MAP: Record<string, string> = {
  // === 微软字体系列（Windows 预装，macOS / Linux 没有） ===
  // 思源黑体的 Google Fonts 发行版叫 Noto Sans SC，字形与 Adobe 版一致
  MicrosoftYaHei: 'Noto Sans SC',
  'MicrosoftYaHei-Bold': 'Noto Sans SC',
  'Microsoft YaHei': 'Noto Sans SC',
  'Microsoft YaHei Bold': 'Noto Sans SC',
  微软雅黑: 'Noto Sans SC',

  // 宋体 → 思源宋体
  SimSun: 'Noto Serif SC',
  'SimSun-ExtB': 'Noto Serif SC',
  宋体: 'Noto Serif SC',
  NSimSun: 'Noto Serif SC',
  新宋体: 'Noto Serif SC',

  // 黑体 → 思源黑体
  SimHei: 'Noto Sans SC',
  黑体: 'Noto Sans SC',

  // 楷体 → 思源宋体。开源楷体几乎没有，用衬线体近似
  KaiTi: 'Noto Serif SC',
  KaiTi_GB2312: 'Noto Serif SC',
  楷体: 'Noto Serif SC',
  楷体_GB2312: 'Noto Serif SC',

  // === Arial / Helvetica（跨平台常见，但 PostScript 名不同） ===
  ArialMT: 'Arial',
  'Arial-BoldMT': 'Arial',
  'Arial-ItalicMT': 'Arial',
  'Arial-BoldItalicMT': 'Arial',
  Helvetica: 'Arial', // macOS 上是 Helvetica，Windows 上是 Arial，字形接近
  HelveticaNeue: 'Arial',
  'Helvetica Neue': 'Arial',

  // === Times New Roman ===
  TimesNewRomanPSMT: 'Times New Roman',
  'TimesNewRomanPS-BoldMT': 'Times New Roman',
  'TimesNewRomanPS-ItalicMT': 'Times New Roman',
  'TimesNewRomanPS-BoldItalicMT': 'Times New Roman',

  // === 其他 Windows 常见字体 ===
  Verdana: 'Verdana',
  Georgia: 'Georgia',
  Tahoma: 'Verdana', // Tahoma 在 macOS 上可能没有，用 Verdana 近似
  'Trebuchet MS': 'Verdana',
  CourierNewPSMT: 'Courier New',
  'CourierNewPS-BoldMT': 'Courier New',

  // === 阿里巴巴普惠体。著作权人声明免费商用，我们可以直接下发 ===
  // 各字重后缀（-Light / -Medium / -3-55-Regular…）由 splitFontName 削掉后落到这一条
  AlibabaPuHuiTi: 'Alibaba PuHuiTi',
  'Alibaba PuHuiTi': 'Alibaba PuHuiTi',
  阿里巴巴普惠体: 'Alibaba PuHuiTi',

  // === 思源系列本身。已经是标准 family 名，列在这里是为了省掉一次探测 ===
  'Noto Sans SC': 'Noto Sans SC',
  'Noto Serif SC': 'Noto Serif SC',
  'Source Han Sans SC': 'Noto Sans SC', // Adobe 版的名字
  'Source Han Serif SC': 'Noto Serif SC',
  SourceHanSansCN: 'Noto Sans SC',
  SourceHanSerifCN: 'Noto Serif SC',
};

/**
 * 探针文本：拉丁部分挑宽窄差异最大的字母，后面接中日韩汉字。
 * 两种文字都放进去，是因为一个字体往往只覆盖其中一边——
 * 只用汉字探针的话，Arial / Georgia 这类拉丁字体量出来和后备字体一样宽，
 * 装着也会被判成没装。
 */
const PROBE_TEXT = 'mmmwwwiiillMMMWWW测试字体';

/**
 * 用来比对的通用族。三个都试，任意一个上量出差异就说明候选字体真的参与了渲染。
 *
 * 只比一个不够：候选字体恰好和那个通用族是同一个物理字体时（Windows 上
 * sans-serif 就是 Arial），量出来一样宽，会把装着的字体判成没装。
 */
const PROBE_BASELINES = ['monospace', 'sans-serif', 'serif'] as const;

/**
 * CSS 通用族。这些不是具体字体，而是「让浏览器自己挑」的占位符。
 *
 * 单独列出来是因为宽度探测对它们无效：拿 `"sans-serif", sans-serif` 和 `sans-serif`
 * 比，量出来必然一样宽，会把一个永远可用的名字判成「本机没有」。
 */
const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'math',
  'emoji',
  'fangsong',
]);

/**
 * 这个名字是 CSS 通用族吗。
 *
 * 诊断日志用它区分两种「用了通用族」：字体缺失导致浏览器临时降级，
 * 和 textData 里存的本来就是通用族（说明导入时已经彻底放弃了原字体）。
 * 后者是数据层面的既成事实，重新下载字体也救不回来，得从 textData 改起。
 */
export function isGenericFamily(family: string): boolean {
  return GENERIC_FAMILIES.has(family.trim().toLowerCase());
}

/**
 * 本机有没有这个字体。
 *
 * 不能用 document.fonts.check：它只认已注册的 FontFace，系统装了的字体一律返回 false。
 * 只能靠量宽度——同一串探针文本分别按「候选字体 + 通用族」和「只有通用族」量，
 * 宽度不同就说明候选字体顶上了。
 *
 * 判错的代价不对称，所以宁可多试几组：判成「没装」会把 PSD 里原本正确的字体
 * 换成替代品，用户看到的字直接变样；判成「装了」最多是 CSS 里多写一个家族名，
 * 浏览器自己会往后备族退。
 *
 * 导出是给诊断日志用的（textDiagnostics）：排查「字体怎么变了」时，
 * 第一个要回答的问题就是这个字体到底能不能用。
 */
export function fontAvailable(family: string): boolean {
  // 通用族永远可用，而且探不出来（理由见 GENERIC_FAMILIES）
  if (isGenericFamily(family)) return true;

  // 缺 canvas 的环境（部分测试宿主）没法探测，一律当没有，走后备路径
  let context: CanvasRenderingContext2D;
  try {
    context = ctx2d(createCanvas(1, 1));
  } catch {
    return false;
  }

  return PROBE_BASELINES.some((baseline) => {
    context.font = `48px ${baseline}`;
    const withoutFont = context.measureText(PROBE_TEXT).width;
    context.font = `48px "${family}", ${baseline}`;
    const withFont = context.measureText(PROBE_TEXT).width;
    return Math.abs(withFont - withoutFont) > 0.5;
  });
}

/**
 * 解析 PSD 字体名，返回实际要用的 CSS font-family。
 *
 * 同步返回，绝不等网络。候选字体是需要下载的开源字体时，
 * 这里照样把它当成结果返回，同时让 webFontLoader 在后台去取：
 * 字体到之前浏览器用后备字体画，到了自动换上。
 *
 * @param psdFontName PSD 里 style.font.name
 * @param fontWeight 这一层要的数值字重。可下载字体一档字重一个 5MB 的文件，
 *        只下用得上的那一档；不传就按常规字重办
 * @returns family 为实际用的 font-family；isSubstitute 为真表示不是原来那个字体，
 *          调用方可据此在 UI 上提示「缺少字体 XXX，已用 YYY 替代」
 */
export function resolveFontFamily(
  psdFontName: string,
  fontWeight: number = NORMAL_WEIGHT,
): {
  family: string;
  isSubstitute: boolean;
} {
  /*
   * 本机就装着 PSD 里写的那个字体时，原样用它，什么都不换。
   *
   * 这一步必须排在查映射表之前。映射表是给「本机没有」准备的替代方案，
   * 可 Windows 上微软雅黑、宋体、黑体本来就是预装的——先映射再判断的话，
   * 明明有正主却换成下载来的思源黑体，重新编辑一下字就变样了。
   * 规约 §0：PS 用哪个字体我们就用哪个。
   */
  if (isWebFontLoaded(psdFontName, fontWeight) || fontAvailable(psdFontName)) {
    return { family: psdFontName, isSubstitute: false };
  }

  /*
   * 先按全名查，查不到再削掉字重后缀查一次。
   * PSD 存的是「某一款」的名字（AlibabaPuHuiTi-Medium），
   * 表里放的是家族名（AlibabaPuHuiTi），不削就永远对不上。
   * 全名优先是因为个别字体的某个字重要单独映射到别处（Arial-BoldMT 之类）。
   */
  const mapped = FONT_FALLBACK_MAP[psdFontName] ?? FONT_FALLBACK_MAP[splitFontName(psdFontName).base];
  const candidate = mapped ?? psdFontName;

  // 替代品本机有，或者这一档字重之前已经下载注册过了，用它
  if (
    candidate !== psdFontName &&
    (isWebFontLoaded(candidate, fontWeight) || fontAvailable(candidate))
  ) {
    return { family: candidate, isSubstitute: true };
  }

  /*
   * 是我们能下载的开源字体：先返回它，下载在后台进行。
   *
   * 判断用 isWebFontFamily 而不是 WEB_FONT_FAMILIES.has：清单的键带字重后缀
   * （'Alibaba PuHuiTi 300'），拿家族名直接去 has 只有常规字重那一条碰得上。
   * 具体下哪一档由 requestWebFont 按 fontWeight 就近挑。
   */
  if (isWebFontFamily(candidate)) {
    requestWebFont(candidate, fontWeight);
    return { family: candidate, isSubstitute: true };
  }

  // 既没装也下载不了，退到通用族
  return { family: genericFamilyFor(candidate), isSubstitute: true };
}

/**
 * 这个字体名看着像衬线体吗。只看名字，拿不到字体本身时只能这么猜。
 *
 * 先把 sans-serif 摘掉再匹配：它里面就含着 serif 三个字母，
 * 不摘的话「sans-serif」自己会被判成衬线体。
 */
function isSerifName(family: string): boolean {
  return /serif|宋|楷|Times|Georgia/i.test(family.replace(/sans-?serif/gi, ''));
}

/** 字体不可用时该退到哪个通用族 */
function genericFamilyFor(family: string): 'serif' | 'sans-serif' {
  return isSerifName(family) ? 'serif' : 'sans-serif';
}

/**
 * 给家族名补上通用族兜底，供 CSS `font` 简写使用。
 *
 * 不补的话，字体缺失时浏览器会拿自己的默认字体顶上（Chrome 上是 Times New Roman），
 * 一个本该是黑体的中文层会突然变成衬线体。
 * 更要命的是 Web 字体还在下载的那段时间：canvas 上已经画好的像素和 textarea
 * 里实时排版的字会落到两个不同的默认字体上，进编辑那一下字体就「变了」。
 *
 * 补上之后两边的降级路径一致：像衬线体的退 serif，其余退 sans-serif。
 */
export function fontFamilyWithFallback(family: string): string {
  const generic = genericFamilyFor(family);
  // 已经是通用族本身就别再套一层，"serif", serif 是合法但无意义的写法
  return family === generic ? generic : `"${family}", ${generic}`;
}
