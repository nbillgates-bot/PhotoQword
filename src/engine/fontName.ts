/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * PostScript 字体名的拆分。
 *
 * PSD 里存的不是家族名，是**具体那一款**的名字：同一个阿里巴巴普惠体会以
 * AlibabaPuHuiTi-Light / -Regular / -Medium / -Bold 四个不同的字符串出现，
 * 3.0 版还在中间插了字重数字（AlibabaPuHuiTi-3-55-Regular）。
 *
 * 替换表如果按全名精确匹配，每加一款字体就得把它所有字重抄一遍，抄漏一个
 * 那一层就整个退到通用族——普惠体三个字重全掉下去正是这么来的。
 * 所以查表前先把尾巴上的字重/字形词削掉，只拿家族名去匹配。
 *
 * 顺带把削下来的信息还给调用方：PSD 用**真粗体字面**时 fauxBold 是 false，
 * 只看 fauxBold 会把一个 Bold 图层排成常规粗细。
 */

/** 尾巴上可以削掉的字重 / 字形词 */
const STYLE_TOKENS = new Set([
  'thin',
  'hairline',
  'extralight',
  'ultralight',
  'light',
  'normal',
  'regular',
  'book',
  'medium',
  'demibold',
  'semibold',
  'bold',
  'extrabold',
  'ultrabold',
  'heavy',
  'black',
  'italic',
  'oblique',
]);

/** 这些词意味着「粗」 */
const BOLD_TOKENS = new Set([
  'demibold',
  'semibold',
  'bold',
  'extrabold',
  'ultrabold',
  'heavy',
  'black',
]);

/** 这些词意味着「斜」 */
const ITALIC_TOKENS = new Set(['italic', 'oblique']);

/** 字重词到 CSS 数值字重的映射，100-900 */
const WEIGHT_VALUES: Record<string, number> = {
  thin: 100,
  hairline: 100,
  extralight: 200,
  ultralight: 200,
  light: 300,
  normal: 400,
  regular: 400,
  book: 400,
  medium: 500,
  demibold: 600,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  ultrabold: 800,
  heavy: 900,
  black: 900,
};

/**
 * Monotype / Adobe 给 PostScript 名加的厂商后缀（Arial-BoldMT、TimesNewRomanPS-ItalicMT）。
 * 削掉之后剩下的才是字重词。
 */
function stripVendorSuffix(token: string): string {
  return token.replace(/(?:psmt|mt|ps)$/i, '');
}

/**
 * 认一个可能是复合词的字形段，认不出返回 null。
 *
 * 字重和斜体常常粘在一起写成一个段（BoldItalic、SemiBoldOblique），
 * 只做整词匹配的话这类名字一个都削不掉。
 */
function matchStyleToken(token: string): { bold: boolean; italic: boolean; weight?: number } | null {
  if (STYLE_TOKENS.has(token)) {
    return {
      bold: BOLD_TOKENS.has(token),
      italic: ITALIC_TOKENS.has(token),
      weight: WEIGHT_VALUES[token],
    };
  }
  for (const italicWord of ITALIC_TOKENS) {
    if (!token.endsWith(italicWord)) continue;
    const head = token.slice(0, -italicWord.length);
    if (STYLE_TOKENS.has(head)) {
      return { bold: BOLD_TOKENS.has(head), italic: true, weight: WEIGHT_VALUES[head] };
    }
  }
  return null;
}

export interface FontNameParts {
  /** 削掉字重/字形后缀之后的家族名。削不动就是原名 */
  base: string;
  /** 名字本身就说明是粗体 */
  bold: boolean;
  /** 名字本身就说明是斜体 */
  italic: boolean;
  /**
   * 名字里写明的数值字重，100-900。名字里没有字重词就是 undefined
   * （区别于「明确是 400」——Arial 与 Arial-Regular 得能分开，
   * 后者才是用户挑过 Regular 的结果）。
   */
  fontWeight?: number;
}

/**
 * 拆出家族名和字重/字形。
 *
 * 只按 `-` 和 `_` 分段，且**只从尾巴往前削**，遇到不认识的词立刻停：
 * 中间的段不能碰（SimSun-ExtB 的 ExtB、KaiTi_GB2312 的 GB2312 都是家族名的一部分），
 * 而且至少留一段，免得把整个名字削没了。
 */
export function splitFontName(fontName: string): FontNameParts {
  /*
   * 带捕获组地切，分隔符本身也留在数组里（偶数下标是段，奇数下标是分隔符）。
   * 不这么做就得在拼回去时猜用 `-` 还是 `_`，KaiTi_GB2312 会被拼成 KaiTi-GB2312，
   * 一个没被削过的名字凭空变了样。
   */
  const tokens = fontName.split(/([-_])/);
  let end = tokens.length;
  let bold = false;
  let italic = false;
  let fontWeight: number | undefined = undefined;

  while (end > 1) {
    const raw = tokens[end - 1];
    // 3.0 版的字重数字（-3-55-Regular 里的 3 和 55），跟着字重词一起削
    const isWeightNumber = /^\d{1,3}$/.test(raw);
    const style = matchStyleToken(stripVendorSuffix(raw).toLowerCase());

    if (style) {
      bold = bold || style.bold;
      italic = italic || style.italic;
      // 往前走时会碰到多个字重词（BoldItalic、或 3.0 版的多段后缀），取最大的
      if (style.weight !== undefined) {
        fontWeight = Math.max(fontWeight ?? 0, style.weight);
      }
    } else if (!isWeightNumber) {
      break;
    }
    // 段和它前面的分隔符一起去掉
    end -= 2;
  }

  return { base: tokens.slice(0, end).join(''), bold, italic, fontWeight };
}
