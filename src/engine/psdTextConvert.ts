/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { LayerTextData, TextStyle, ParagraphStyle } from 'ag-psd';
import type { TextData } from '../types';
import { DEFAULT_TEXT, fontString } from './textRender';
import { boxAnchor, pointAnchor, toAffine } from './psdTextAnchor';
import { colorToCss, justificationToAlign } from './psdTextStyleMap';
import { resolveFontFamily } from './fontFallback';
import { splitFontName } from './fontName';
import { BOLD_WEIGHT, NORMAL_WEIGHT } from './fontWeights';
import { logFontResolution } from './textDiagnostics';

/**
 * PSD 文字图层 → 我们的 TextData。
 *
 * PSD 的文字是完整的富文本：每个字符可以有独立的字体/字号/颜色，
 * 每个段落可以有独立的对齐方式。我们的模型是简化版，整段一套样式。
 * 转换策略是取第一段样式（styleRuns[0]）当基准，后面的样式变化丢掉。
 *
 * 丢样式不影响画面：图层像素用的是 PSD 里 PS 渲染好的那一份，
 * 这里解出来的 TextData 只在用户重新编辑时才拿去重排。
 */

/**
 * 文字图层变换矩阵的**纵向**缩放倍数。
 *
 * PSD 的 transform 是 6 个 float64 的仿射矩阵 [a, b, c, d, tx, ty]，
 * 映射关系是 (x, y) → (a·x + c·y + tx, b·x + d·y + ty)，
 * 所以纵向缩放是列向量 (c, d) 的模长。
 *
 * 字号是纵向度量，跟这个倍数走。
 * 非等比缩放（横竖倍数不同）我们的模型表达不了，只按纵向算，横向的形变会丢。
 */
function verticalScale(transform: number[] | undefined): number {
  if (!transform || transform.length < 4) return 1;
  const scale = Math.hypot(transform[2], transform[3]);
  // 矩阵退化（全 0）或解出脏数据时退回 1，宁可字号不缩放也不能算出 0 或 NaN
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/**
 * 从 PSD 的文字数据提取我们的 TextData。
 *
 * @param psdText ag-psd 解出来的图层文字数据
 * @param layerLeft 图层 bounds 的 x（文档坐标）
 * @param layerTop 图层 bounds 的 y（文档坐标）
 */
export function psdTextDataToTextData(
  psdText: LayerTextData,
  layerLeft: number,
  layerTop: number,
): TextData {
  /*
   * 必须**合并**整段 style 和 styleRuns[0]，不能二选一。
   *
   * ag-psd 读取时会跑 deduplicateValues：凡是所有 run 取值都相同的属性，
   * 一律上提到 psdText.style，并从每个 run 里 **删掉**。
   * 所以两边都是残缺的，各自只有对方没有的那部分：
   *   - 颜色整段统一、但字号分段不同 → fillColor 在 style，fontSize 在 run
   *   - 二选一取 run → 拿不到 fillColor → 整段文字变成默认白色
   *   - 二选一取 style → 拿不到 fontSize → 字号变成默认 48
   * 这正是「一进编辑颜色和字体就变掉」的来源。
   *
   * run 覆盖 style：run 里还留着的都是这一段独有的值，优先级更高。
   */
  const style: TextStyle = { ...psdText.style, ...psdText.styleRuns?.[0]?.style };
  const para: ParagraphStyle = {
    ...psdText.paragraphStyle,
    ...psdText.paragraphStyleRuns?.[0]?.style,
  };

  /*
   * 字号要挡住 0 和负数，不能只用 ?? ：?? 只挡 undefined，0 会原样穿过去，
   * 后面 leading / fontSize 直接得到 Infinity，再乘进排版就是 NaN。
   * NaN 写进 Uint8ClampedArray 会被吞成 0，画面只是空一块，不报错，最难查。
   */
  const styleFontSize = style.fontSize ?? DEFAULT_TEXT.fontSize;
  // 文字引擎空间里的字号，还没乘图层的缩放
  const baseFontSize = styleFontSize > 0 ? styleFontSize : DEFAULT_TEXT.fontSize;

  /*
   * PSD 的字号存在**文字引擎自己的坐标系**里，图层的缩放另存在 transform 矩阵中，
   * 实际显示的像素字号 = 引擎字号 × 矩阵纵向缩放。
   * 在 PS 里用自由变换缩放过的文字层就是这个形态：style.fontSize 一直是 12，
   * transform 是 [4,0,0,4,…]，屏幕上显示的是 48px。
   * 只读 style.fontSize 的话，一点进编辑字就缩回 12px —— 就是「字体大小变了」。
   */
  const fontSize = baseFontSize * verticalScale(psdText.transform);

  /*
   * 行高。PSD 的 leading 是**绝对像素值**，我们的 lineHeight 是**倍率**。
   * 例：fontSize=48, leading=58 → 我们的 lineHeight = 58 / 48 ≈ 1.208
   *
   * 自动行高（leading 缺失 / 为 0 / 为负）按 PS 的算法近似为 1.2 倍。
   *
   * 这里不直接存像素是因为改字号时行高要等比缩放：48pt 1.2x = 57.6px，
   * 改成 60pt 应变成 72px (= 60 * 1.2)，如果存死了 57.6 就跟不动了。
   *
   * 除的是 baseFontSize 而不是缩放后的 fontSize：leading 和 style.fontSize
   * 同处引擎空间，比值里缩放正好约掉。拿缩放后的字号去除会把缩放倍数
   * 倒过来乘进行高，行距变成原来的 1/scale。
   */
  const leading = style.leading;
  const lineHeight =
    leading !== undefined && leading > 0 ? leading / baseFontSize : DEFAULT_TEXT.lineHeight;

  /*
   * 字距。PSD 的 tracking 单位是千分之一 em，CSS 的 letter-spacing 是像素，
   * 所以要乘字号再除 1000。漏了换算的话 tracking=100 会变成 100px 的字距，
   * 一行字直接散到画布外面去。
   *
   * 这里乘的是缩放后的 fontSize：em 是相对字号的，字放大几倍字距就跟着放大几倍。
   */
  const letterSpacing = ((style.tracking ?? 0) / 1000) * fontSize;

  const psdFontName = style.font?.name ?? DEFAULT_TEXT.fontFamily;

  /*
   * 粗体/斜体有两个来源，必须取并集。
   * 用户在 PS 里选的是**真的粗体字面**时（Arial-BoldMT、AlibabaPuHuiTi-Bold），
   * fauxBold 是 false —— 粗细来自字体本身，不需要合成。
   * 只看 fauxBold 的话这类图层一进编辑就变成常规粗细，看着像「字体变细了」。
   */
  const nameStyle = splitFontName(psdFontName);

  /*
   * 字重：优先用名字里写明的数值（AlibabaPuHuiTi-Light → 300），
   * 没有就按布尔量推（bold → 700, regular → 400）。
   * fauxBold 和 nameStyle.bold 的并集决定最终的 bold 布尔量，
   * 但 fontWeight 只从 nameStyle 取：fauxBold 只说明 PS 做了合成，
   * 不能推出「原字体是哪个数值字重」。
   */
  const bold = (style.fauxBold ?? false) || nameStyle.bold;
  const italic = (style.fauxItalic ?? false) || nameStyle.italic;
  const fontWeight = nameStyle.fontWeight ?? (bold ? BOLD_WEIGHT : NORMAL_WEIGHT);

  /*
   * 字体解析。从 PSD 的 PostScript 名或全名解析成浏览器可用的 CSS font-family。
   * 映射表里有对应或系统字体存在就用，否则尝试加载开源 Web Font。
   * isSubstitute 为 true 时记录原始名称，用于 UI 提示「缺少字体 XXX，已用 YYY 替代」。
   *
   * 字重要先算出来再解析：可下载的中文字体一档字重就是一个 5MB 的文件，
   * 不告诉它要哪一档的话只能一律去下常规体——Light 的图层拿到常规体，
   * 粗细还是不对，白下 5MB。
   */
  const { family: fontFamily, isSubstitute } = resolveFontFamily(psdFontName, fontWeight);
  // 解析完立刻报一次。过了这一步，PSD 原本要的是哪个字体就只剩 originalFontFamily 记得了
  logFontResolution(psdFontName, fontFamily, isSubstitute, fontWeight);

  /*
   * 位置与文本框。
   *
   * PSD 里点文本和段落文本的坐标来源不同：
   * - 段落文本（shapeType === 'box'）：boxBounds = [left, top, right, bottom]，
   *   有固定宽高，超出宽度自动折行。
   * - 点文本：pointBase = [x, y]，横向无限延伸，只在显式换行处断行。
   *
   * 两者都在**文字引擎自己的坐标系**里，靠 transform 矩阵搬到文档上，
   * 换算全部交给 psdTextAnchor —— 那边的头注释记着为什么不能拿图层 ink 边界当原点
   * （居中文字会左移半个行宽）。矩阵缺失时它自己退回 ink 原点。
   *
   * boxBounds 的分量顺序按 x 优先（left,top,right,bottom）解，依据是它和 pointBase
   * 出自同一个 Photoshop 引擎节点，而 pointBase 明确是 [x, y]。
   * 注意别套用 PSD **二进制**图层记录里矩形的 top/left/bottom/right 顺序——
   * 那是另一套序列化，不适用于这里的引擎描述符。
   * 万一解反了，表现是段落文本框宽高对调（宽框变高框），只在重新编辑时才看得出来。
   */
  const matrix = toAffine(psdText.transform);
  const isBox = psdText.shapeType === 'box';
  const box = psdText.boxBounds;

  let x: number;
  let y: number;
  let width: number | undefined;
  let height: number | undefined;

  if (isBox && box && box.length >= 4) {
    const rect = boxAnchor({ m: matrix, boxBounds: box, layerLeft, layerTop });
    ({ x, y, width, height } = rect);
  } else {
    /*
     * 落笔点要按最终字体量基线偏移，所以 cssFont 得用**这一层真正的样式**拼，
     * 不能图省事传个默认值：字号和行高都进 firstBaselineOffset，差一点纵向就偏一点。
     */
    const cssFont = fontString({
      ...DEFAULT_TEXT,
      fontFamily,
      fontSize,
      fontWeight,
      bold,
      italic,
      x: 0,
      y: 0,
      content: '',
    });
    const anchor = pointAnchor({
      m: matrix,
      pointBase: psdText.pointBase,
      layerLeft,
      layerTop,
      cssFont,
      fontSize,
      lineHeight,
    });
    x = anchor.x;
    y = anchor.y;
  }

  return {
    content: psdText.text ?? '',
    fontFamily,
    originalFontFamily: isSubstitute ? psdFontName : undefined,
    fontSize,
    fontWeight,
    bold,
    italic,
    underline: style.underline ?? false,
    align: justificationToAlign(para.justification),
    color: colorToCss(style.fillColor),
    lineHeight,
    letterSpacing,
    x: Math.round(x),
    y: Math.round(y),
    width,
    height,
  };
}
