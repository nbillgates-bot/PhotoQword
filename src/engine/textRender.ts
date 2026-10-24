/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { TextData } from '../types';
import { clearCanvas, ctx2d } from './canvasUtils';
import { fontFamilyWithFallback } from './fontFallback';
import { BOLD_WEIGHT, NORMAL_WEIGHT, clampWeight } from './fontWeights';
import { drawTextLine } from './textLineDraw';
import { firstBaselineOffset, wrapTextRanges } from './textWrap';

export const FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Times New Roman',
  'Georgia',
  'Courier New',
  'Verdana',
  'Impact',
  'Comic Sans MS',
  'Microsoft YaHei',
  'SimSun',
  'KaiTi',
];

/**
 * 算出真正要用的数值字重。
 *
 * 有两个来源，加粗按钮（bold 布尔量）和字体样式下拉（fontWeight 数值），
 * 必须收敛成一个数：
 * - fontWeight 是后加的字段，旧文档和测试数据里可能没有，退回布尔量推出的值。
 * - 两者都有时取较大的那个。bold 不能直接把 900 的 Heavy 压回 700
 *   （在 Heavy 上按加粗不该让字变细），但在 300 的 Light 上按加粗要真的变粗。
 */
export function resolveWeight(data: TextData): number {
  const base = clampWeight(data.fontWeight ?? (data.bold ? BOLD_WEIGHT : NORMAL_WEIGHT));
  return data.bold ? Math.max(base, BOLD_WEIGHT) : base;
}

/**
 * 组装 CSS font 简写。canvas 的 ctx.font 和 textarea 的 style.font 共用这一个，
 * 两边必须是同一个字符串，否则排版对不上。
 *
 * 家族名一定要带通用族兜底，理由见 fontFamilyWithFallback。
 */
export function fontString(data: TextData): string {
  const style = data.italic ? 'italic ' : '';
  return `${style}${resolveWeight(data)} ${data.fontSize}px ${fontFamilyWithFallback(data.fontFamily)}`;
}

/**
 * 对齐方式带来的横向位移：落笔点减去它就是文字框的左边。
 *
 * canvas 的 textAlign 和 CSS 的 text-align 都只需要给「落笔点 / 盒子」，
 * 但我们的命中检测、变换框、textarea 定位要的是**框的左上角**，两者差着这个量：
 * 左对齐差 0，居中差半个宽，右对齐差一整个宽。
 *
 * 抽出来是因为这套换算原本散在四个地方（drawLine 的下划线、getTextBounds、
 * textBoxLocal、TextEditor），只要有一处忘了退，那种对齐的文字就会整体偏出去。
 */
export function alignShift(align: TextData['align'], width: number): number {
  return align === 'center' ? width / 2 : align === 'right' ? width : 0;
}

/** 把文字数据渲染到图层 canvas 上（先清空，保证可反复编辑） */
export function renderText(canvas: HTMLCanvasElement, data: TextData): void {
  const isParagraph = data.width !== undefined && data.height !== undefined;

  // 段落文本：canvas 尺寸 = 边界框尺寸
  // 点文本：canvas 尺寸由实际文字测量决定（后面 measureText）
  if (isParagraph) {
    canvas.width = data.width!;
    canvas.height = data.height!;
  } else {
    // 点文本的 canvas 尺寸在下面 clearCanvas 后测量并设置
    clearCanvas(canvas);
  }

  const context = ctx2d(canvas);
  context.save();
  context.font = fontString(data);
  context.fillStyle = data.color;
  context.textAlign = data.align;
  // 用 alphabetic 而不是 top：CSS 行盒的基线要算上半行距，见 firstBaselineOffset
  context.textBaseline = 'alphabetic';
  context.letterSpacing = `${data.letterSpacing}px`;

  const step = data.fontSize * data.lineHeight;
  const baseline = firstBaselineOffset(context, data.fontSize, data.lineHeight);

  if (isParagraph) {
    // 段落文本：自动换行 + 裁剪到边界框
    // 绘制原点是 (0, 0)，因为 canvas 本身就是边界框大小，定位在 (data.x, data.y)
    context.save();
    context.beginPath();
    context.rect(0, 0, data.width!, data.height!);
    context.clip();

    const measure = (line: string) => context.measureText(line).width;
    // 边界框底部露出半行时照样画出来，由 clip 裁掉下半截 —— textarea 和 PS 都是这个表现，
    // 整行丢弃会让提交瞬间少一行
    wrapTextRanges(measure, data.content, data.width!).forEach((line, index) => {
      const x = data.align === 'center' ? data.width! / 2 : data.align === 'right' ? data.width! : 0;
      drawTextLine({
        context,
        data,
        line: line.text,
        lineStart: line.start,
        x,
        y: index * step + baseline,
      });
    });

    context.restore();
  } else {
    /*
     * 点文本：按 \n 分行，不自动换行。data.y 是首行行盒顶端。
     * maxWidth 传 0 让 wrapTextRanges 只处理硬换行，这样行的字符区间
     * 与段落文本共用同一套推导，不必在这儿另写一遍偏移累加。
     */
    wrapTextRanges(() => 0, data.content, 0).forEach((line, index) => {
      drawTextLine({
        context,
        data,
        line: line.text,
        lineStart: line.start,
        x: data.x,
        y: data.y + index * step + baseline,
      });
    });
  }

  context.restore();
}

/**
 * 命中框的最小边长。空文字层测出来是 0 宽，没有保底就永远点不中，
 * 只能删掉重建 —— PS 里空文字层照样点得进去。
 */
const MIN_HIT_SIZE = 50;

/**
 * 计算文字内容的边界框（用于点击检测），文档坐标。
 * 段落文本返回固定的边界框尺寸，点文本返回实际测量尺寸。
 */
export function getTextBounds(data: TextData, canvas: HTMLCanvasElement): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const context = ctx2d(canvas);
  context.save();
  context.font = fontString(data);
  // 字距会实打实改变行宽，量的时候必须和 renderText 用同一套设置
  context.letterSpacing = `${data.letterSpacing}px`;

  const lines = data.content.split('\n');
  const lineHeight = data.fontSize * data.lineHeight;

  let x = data.x;
  const y = data.y;
  let width: number;
  let height: number;

  // 段落文本：canvas 就是边界框，(data.x, data.y) 已经是框的左上角
  if (data.width !== undefined && data.height !== undefined) {
    width = data.width;
    height = data.height;
  } else {
    // 点文本：按实际内容量
    const measured = lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0);
    width = Math.max(measured, MIN_HIT_SIZE);
    height = Math.max(data.fontSize, lines.length * lineHeight);

    /*
     * renderText 里设了 textAlign = data.align，所以 data.x 是落笔点，
     * 居中时是中线、右对齐时是右边，**不是**框的左边。
     * 这里不跟着退的话，居中文字的命中框会整体右移半个行宽，
     * 点在字上反而落空，点右边的空白倒能进编辑。
     */
    x -= alignShift(data.align, width);
  }

  context.restore();

  return {
    x,
    y,
    width: Math.max(width, MIN_HIT_SIZE),
    height: Math.max(height, data.fontSize),
  };
}


/** 量出文字块的外接尺寸，供属性面板与选中框使用 */
export function measureText(data: TextData): { width: number; height: number } {
  const probe = document.createElement('canvas');
  const context = ctx2d(probe);
  context.font = fontString(data);
  context.letterSpacing = `${data.letterSpacing}px`;
  const lines = data.content.split('\n');
  const width = Math.max(...lines.map((line) => context.measureText(line).width), 0);
  return { width, height: lines.length * data.fontSize * data.lineHeight };
}

export const DEFAULT_TEXT: Omit<TextData, 'x' | 'y' | 'content'> = {
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#ffffff',
  lineHeight: 1.2,
  letterSpacing: 0,
};
