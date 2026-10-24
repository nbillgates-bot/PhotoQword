/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer, TextData } from '../types';
import { fontAvailable, isGenericFamily } from './fontFallback';
import { NORMAL_WEIGHT, nearestWeight } from './fontWeights';
import { alignShift, fontString, measureText } from './textRender';
import { isParagraphText, pointEditorBox } from './textBox';
import { isWebFontFamily, isWebFontLoaded } from './webFontLoader';

/**
 * 文字编辑期的诊断信息。
 *
 * 排查「进编辑那一下字体和位置都变了」这类问题时，光看画面猜不出是哪一环：
 * 字体到底装没装、CSS 里最后写的是什么、落笔点和框左边差了多少、
 * PSD 图层的 canvas 是不是还停在它自己那一小块。这里一次性把这些都摊开。
 *
 * collect 是纯函数，不碰 console；打印交给 logTextDiagnostics。
 * 分开是为了让它可测——断言一个对象比断言 console 输出容易得多。
 */
export interface TextDiagnostics {
  layerId: string;
  layerName: string;
  /** 点文本还是段落文本，两者的坐标约定完全不同（见 textBox.ts） */
  kind: 'point' | 'paragraph';

  // === 字体 ===
  /** textData 里记的字体，已经过 resolveFontFamily */
  family: string;
  /** PSD 里原本写的字体名。只有发生过替代才有值 */
  psdFamily: string | null;
  /** 真正写进 ctx.font / style.font 的字符串 */
  cssFont: string;
  /** 浏览器现在能不能用到这个字体（系统装了，或已注册的 WebFont 都算） */
  familyUsable: boolean;
  /** 属于我们能从 CDN 下载的开源字体吗 */
  isWebFontCandidate: boolean;
  /** 这个 WebFont 已经下载并注册好了吗 */
  webFontLoaded: boolean;
  /**
   * textData 里存的就是个通用族（serif / sans-serif ...）。
   * 这说明导入那一刻已经彻底放弃了 PSD 的原字体——和「字体还在下载」是两回事。
   */
  familyIsGeneric: boolean;
  /** 此刻画面上实际用的是后备通用族，不是 family 指的那个字体 */
  usingFallback: boolean;

  // === 样式 ===
  fontSize: number;
  /**
   * 数值字重（100-900）。
   * 和 bold 是两回事：bold 只说明要不要再加粗，fontWeight 才是基准粗细，
   * 「Light 的层被当成常规体」这类问题只有看这个值才看得出来。
   */
  fontWeight: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  align: TextData['align'];
  lineHeight: number;
  letterSpacing: number;
  color: string;

  // === 排版与位置（文档坐标） ===
  /** data.x / data.y。点文本时这是落笔点，不是框的左上角 */
  penX: number;
  penY: number;
  /** 按当前字体量出来的文字外接尺寸 */
  measuredWidth: number;
  measuredHeight: number;
  /** 对齐带来的横向位移，落笔点减它就是框左边 */
  alignShift: number;
  /** 编辑框（textarea）的位置与尺寸 */
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  lineCount: number;

  // === 图层画布 ===
  canvasWidth: number;
  canvasHeight: number;
  boundsX: number;
  boundsY: number;
  boundsWidth: number;
  boundsHeight: number;
}

/** 收集一次诊断快照。纯函数，只读不改 */
export function collectTextDiagnostics(layer: Layer, data: TextData): TextDiagnostics {
  const paragraph = isParagraphText(data);
  const measured = measureText(data);

  // 编辑框：段落文本用用户拉出来的框，点文本用实测尺寸（和 TextEditor 走同一个函数）
  const box = paragraph
    ? { width: data.width!, height: data.height! }
    : pointEditorBox(data);
  // 段落文本的 data.x 本来就是框左上角，不需要退位移
  const shift = paragraph ? 0 : alignShift(data.align, box.width);

  const usable = fontAvailable(data.fontFamily);
  // 按这一层实际要的字重问：一个家族每档字重是独立文件，300 到了不代表 700 也到了
  const loaded = isWebFontLoaded(data.fontFamily, data.fontWeight);

  return {
    layerId: layer.id,
    layerName: layer.name,
    kind: paragraph ? 'paragraph' : 'point',

    family: data.fontFamily,
    psdFamily: data.originalFontFamily ?? null,
    cssFont: fontString(data),
    familyUsable: usable || loaded,
    isWebFontCandidate: isWebFontFamily(data.fontFamily),
    webFontLoaded: loaded,
    familyIsGeneric: isGenericFamily(data.fontFamily),
    usingFallback: !usable && !loaded,

    fontSize: data.fontSize,
    fontWeight: data.fontWeight,
    bold: data.bold,
    italic: data.italic,
    underline: data.underline,
    align: data.align,
    lineHeight: data.lineHeight,
    letterSpacing: data.letterSpacing,
    color: data.color,

    penX: data.x,
    penY: data.y,
    measuredWidth: measured.width,
    measuredHeight: measured.height,
    alignShift: shift,
    boxX: data.x - shift,
    boxY: data.y,
    boxWidth: box.width,
    boxHeight: box.height,
    lineCount: data.content.split('\n').length,

    canvasWidth: layer.canvas.width,
    canvasHeight: layer.canvas.height,
    boundsX: layer.bounds.x,
    boundsY: layer.bounds.y,
    boundsWidth: layer.bounds.width,
    boundsHeight: layer.bounds.height,
  };
}

/** 小数留两位，整数不带小数点。日志里满屏 57.600000000000001 没法看 */
function num(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

const YES_NO = (value: boolean) => (value ? '是' : '否');

/** 数值字重旁边补一个字面名，光看 500 想不起是 Medium 还是 SemiBold */
function weightLabel(weight: number): string {
  return nearestWeight(weight).label;
}

/**
 * 一句话结论。三种情形要分清，各自的修法完全不同：
 * - 存的就是通用族：导入时已经放弃原字体，改 textData 才救得回来。
 * - 存的是具体字体但用不上：本机没装、也还没下载到，等下载或换字体。
 * - 用得上：字体这一环没问题，位置不对就往别处查。
 */
function fontVerdictOf(d: TextDiagnostics): string {
  if (d.familyIsGeneric) {
    return (
      `⚠ 字体已退到通用族「${d.family}」` +
      `${d.psdFamily ? `——PSD 里要的是「${d.psdFamily}」，` : '——'}` +
      '本机没这个字体，替换表里也没有它，所以没触发下载'
    );
  }
  if (d.usingFallback) return `⚠ 本机用不上「${d.family}」，画面上是浏览器的后备字体`;
  return `✓ 实际用的就是「${d.family}」`;
}

/** 折叠标题：不展开也要能看出「谁变成了谁」 */
export function textDiagnosticsTitle(d: TextDiagnostics): string {
  const fonts = d.psdFamily ? `${d.psdFamily} → ${d.family}` : d.family;
  const warn = d.familyIsGeneric ? ' ⚠ 已退到通用族' : d.usingFallback ? ' ⚠ 后备字体' : '';
  return `[QWORD 文字] ${d.layerName} · ${fonts}${warn}`;
}

/** 把快照排成给人看的中文行 */
export function formatTextDiagnostics(d: TextDiagnostics): string[] {
  const kindLabel = d.kind === 'paragraph' ? '段落文本' : '点文本';
  const fontVerdict = fontVerdictOf(d);

  return [
    `图层：${d.layerName}（${d.layerId}） · ${kindLabel}`,
    `字体：${d.family}${d.psdFamily ? `（PSD 原名 ${d.psdFamily}，已替代）` : '（未替代）'}`,
    `  CSS：${d.cssFont}`,
    `  浏览器能用到：${YES_NO(d.familyUsable)} · ` +
      `可下载 WebFont：${YES_NO(d.isWebFontCandidate)} · ` +
      `已注册：${YES_NO(d.webFontLoaded)}`,
    `  ${fontVerdict}`,
    `样式：${num(d.fontSize)}px · 字重 ${d.fontWeight}（${weightLabel(d.fontWeight)}）· ` +
      `粗体 ${YES_NO(d.bold)} · 斜体 ${YES_NO(d.italic)} · ` +
      `下划线 ${YES_NO(d.underline)} · 对齐 ${d.align} · ` +
      `行高 ${num(d.lineHeight)} · 字距 ${num(d.letterSpacing)} · 颜色 ${d.color}`,
    `位置：落笔点 (${num(d.penX)}, ${num(d.penY)}) · 对齐位移 ${num(d.alignShift)}`,
    `  编辑框 (${num(d.boxX)}, ${num(d.boxY)}) ${num(d.boxWidth)}×${num(d.boxHeight)}`,
    `  实测文字 ${num(d.measuredWidth)}×${num(d.measuredHeight)} · ${d.lineCount} 行`,
    `图层画布：${d.canvasWidth}×${d.canvasHeight} · ` +
      `bounds (${num(d.boundsX)}, ${num(d.boundsY)}) ${num(d.boundsWidth)}×${num(d.boundsHeight)}`,
  ];
}

/**
 * 打到控制台。
 *
 * 用 groupCollapsed 折起来，免得连续编辑几次就把控制台刷满；
 * 展开后既有中文摘要也有原始对象，方便复制粘贴。
 * 部分环境（旧 Safari、测试宿主）没有 group 系列，退回逐行 log。
 */
export function logTextDiagnostics(d: TextDiagnostics): void {
  const lines = formatTextDiagnostics(d);
  const title = textDiagnosticsTitle(d);

  if (typeof console.groupCollapsed === 'function' && typeof console.groupEnd === 'function') {
    console.groupCollapsed(title);
    lines.forEach((line) => console.log(line));
    console.log(d);
    console.groupEnd();
    return;
  }

  console.log(title);
  lines.forEach((line) => console.log(line));
  console.log(d);
}

/**
 * 已经报过的「原名 → 结果」。
 * 一个 PSD 里几十个图层共用一个字体是常态，不去重就是几十条一模一样的日志。
 */
const reportedResolutions = new Set<string>();

/** 测试用：清掉去重表，否则用例之间会互相吃掉对方的日志 */
export function resetFontResolutionLogForTests(): void {
  reportedResolutions.clear();
}

/**
 * 导入 PSD 时报告一次字体解析结果。
 *
 * 编辑期的 logTextDiagnostics 只看得到解析**之后**的名字，
 * 「PSD 里原本要的是哪个字体」只有在这一刻还知道。缺字体是文字层最常见的
 * 走样来源，这条日志就是唯一能指名道姓的地方。
 *
 * 退到通用族的那种用 warn：它意味着连下载都没触发，字形一定和 PSD 不一样，
 * 属于要人动手（补映射表）才能解决的问题，不该和普通信息混在一起。
 */
export function logFontResolution(
  psdFontName: string,
  family: string,
  isSubstitute: boolean,
  fontWeight: number = NORMAL_WEIGHT,
): void {
  // 去重键带上字重：同一家族的 Light 和 Bold 是两次独立下载，各自都值得报一句
  const key = `${psdFontName}→${family}@${fontWeight}`;
  if (reportedResolutions.has(key)) return;
  reportedResolutions.add(key);

  if (!isSubstitute) {
    console.log(`[QWORD 字体] ✓ ${psdFontName}（本机有，原样使用）`);
    return;
  }

  if (isGenericFamily(family)) {
    console.warn(
      `[QWORD 字体] ⚠ ${psdFontName} → ${family}：本机没装，替换表 FONT_FALLBACK_MAP 里也没有它，` +
        '所以没触发下载，只能退到通用族。这个图层重新编辑时字形一定和 PSD 不一样',
    );
    return;
  }

  const downloading = isWebFontFamily(family) && !isWebFontLoaded(family, fontWeight);
  console.log(
    `[QWORD 字体] ${psdFontName} → ${family}（已替代${downloading ? '，正在后台下载' : ''}）`,
  );
}
