/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 段落文本的折行与行盒度量。
 *
 * 编辑时用 textarea，提交后用 canvas 绘制，两者必须算出同一套行 —— 否则
 * 一提交排版就跳。所以这里照 CSS 的规则来实现：
 * word-break: normal（汉字之间可断，拉丁词只在空白处断）
 * + overflow-wrap: break-word（单词自己就超宽时才按字符硬断）。
 */

/** 量一段文字的宽度，由调用方绑定好字体 */
export type MeasureFn = (text: string) => number;

/**
 * 是否宽字符（CJK 及全角）。这类字符彼此之间就是断行机会，
 * 不需要空格 —— 这是中文能逐字折行的原因。
 */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) || // 韩文字母
    (code >= 0x2e80 && code <= 0x303e) || // CJK 部首、中日韩符号
    (code >= 0x3041 && code <= 0x33ff) || // 假名、注音、兼容字符
    (code >= 0x3400 && code <= 0x4dbf) || // 汉字扩展 A
    (code >= 0x4e00 && code <= 0x9fff) || // 基本汉字
    (code >= 0xa000 && code <= 0xa4cf) || // 彝文
    (code >= 0xac00 && code <= 0xd7a3) || // 韩文音节
    (code >= 0xf900 && code <= 0xfaff) || // 兼容汉字
    (code >= 0xfe30 && code <= 0xfe6f) || // 竖排与小写变体
    (code >= 0xff00 && code <= 0xff60) || // 全角
    (code >= 0xffe0 && code <= 0xffe6)
  );
}

/** 行尾空白在 CSS 里悬挂、不参与溢出判断，量宽度时要去掉 */
function widthOf(measure: MeasureFn, line: string): number {
  return measure(line.replace(/\s+$/, ''));
}

/**
 * 把一段文字切成「原子块」：块之间可以断行，块内部不行。
 * 拉丁单词连同它后面的空白算一块（空白悬挂在行尾），宽字符各自一块。
 */
function toChunks(paragraph: string): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const char of paragraph) {
    const code = char.codePointAt(0) ?? 0;

    if (isWide(code)) {
      // 宽字符自成一块，前面攒的先收尾
      if (current) chunks.push(current);
      chunks.push(char);
      current = '';
      continue;
    }

    // 空白跟在前一块尾部；空白之后再来非空白就要开新块了
    if (/\s/.test(char)) {
      current += char;
      continue;
    }
    if (current && /\s$/.test(current)) {
      chunks.push(current);
      current = char;
      continue;
    }
    current += char;
  }

  if (current) chunks.push(current);
  return chunks;
}

/** 单个块自己就超宽：按字符硬断（overflow-wrap: break-word） */
function breakChunk(measure: MeasureFn, chunk: string, maxWidth: number, lines: string[]): string {
  let line = '';
  for (const char of chunk) {
    if (line && widthOf(measure, line + char) > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line += char;
    }
  }
  return line;
}

/** 按 CSS 规则折一个自然段（不含换行符），返回行数组 */
function wrapParagraph(measure: MeasureFn, paragraph: string, maxWidth: number): string[] {
  if (!paragraph) return [''];

  const lines: string[] = [];
  let line = '';

  for (const chunk of toChunks(paragraph)) {
    if (!line || widthOf(measure, line + chunk) <= maxWidth) {
      // 空行必须先接住这一块，否则一个超宽块会让循环空转
      line += chunk;
      if (line && widthOf(measure, line) > maxWidth) {
        line = breakChunk(measure, line, maxWidth, lines);
      }
      continue;
    }
    lines.push(line);
    line = widthOf(measure, chunk) > maxWidth ? breakChunk(measure, chunk, maxWidth, lines) : chunk;
  }

  lines.push(line);
  return lines;
}

/**
 * 把文字按宽度折行。先按用户敲的换行符分段（硬换行），段内再按宽度软折。
 * maxWidth 非正数时不折行，只保留硬换行 —— 否则会陷入死循环。
 */
export function wrapText(measure: MeasureFn, content: string, maxWidth: number): string[] {
  const paragraphs = content.split('\n');
  if (!(maxWidth > 0)) return paragraphs;
  return paragraphs.flatMap((paragraph) => wrapParagraph(measure, paragraph, maxWidth));
}

/** 一行文字，连同它在原始内容里的字符区间 [start, end) */
export interface WrappedLine {
  text: string;
  start: number;
  end: number;
}

/**
 * 同 wrapText，但额外给出每行在原文里的字符区间。
 *
 * 字符级颜色要靠这个区间才能落到正确的字上：折行是按显示行走的，
 * 而颜色区间是按原文下标存的，中间必须有一层映射。
 *
 * 复用 wrapText 而不是重写一套折行：折行规则只能有一份实现，
 * 两份迟早会算出不同的断点（编辑态和提交后就会错行）。行文本按顺序
 * 拼回原文即可推出区间 —— 软折不吃字符，硬换行每个吃掉一个 '\n'。
 */
export function wrapTextRanges(
  measure: MeasureFn,
  content: string,
  maxWidth: number,
): WrappedLine[] {
  const lines = wrapText(measure, content, maxWidth);
  const result: WrappedLine[] = [];
  let cursor = 0;

  for (const text of lines) {
    const start = cursor;
    const end = start + text.length;
    result.push({ text, start, end });
    /*
     * 下一行的起点：软折直接接着走，硬换行还要跳过那个 '\n'。
     * 用「原文这个位置是不是换行符」来判断，而不是数行数 ——
     * 一个自然段被软折成多行时，只有最后一行后面才有 '\n'。
     */
    cursor = content[end] === '\n' ? end + 1 : end;
  }

  return result;
}

/**
 * 首行基线相对行盒顶端的偏移，对齐 CSS 行盒模型。
 *
 * CSS 里行盒高 = fontSize × lineHeight，字形内容区高 = ascent + descent，
 * 差值平分成上下半行距（half-leading）垫在字形上下。所以基线在
 * 半行距 + ascent 处，而不是 canvas textBaseline='top' 的 ascent 处 ——
 * 二者相差一个半行距，这就是编辑态与提交后文字「跳一下」的原因。
 *
 * ascent/descent 优先取字体真实度量；Safari 16.4 以前没有
 * fontBoundingBox*，退化成按字号估算（两条路径都只保证是有限数，
 * 不保证同一个具体值）。
 */
export function firstBaselineOffset(
  context: CanvasRenderingContext2D,
  fontSize: number,
  lineHeight: number,
): number {
  const metrics = context.measureText('M');
  const hasMetrics =
    typeof metrics.fontBoundingBoxAscent === 'number' &&
    typeof metrics.fontBoundingBoxDescent === 'number' &&
    Number.isFinite(metrics.fontBoundingBoxAscent) &&
    Number.isFinite(metrics.fontBoundingBoxDescent);

  const ascent = hasMetrics ? metrics.fontBoundingBoxAscent : fontSize * 0.8;
  const descent = hasMetrics ? metrics.fontBoundingBoxDescent : fontSize * 0.2;
  const halfLeading = (fontSize * lineHeight - (ascent + descent)) / 2;

  return halfLeading + ascent;
}
