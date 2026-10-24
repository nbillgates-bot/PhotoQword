/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 数值字重（CSS font-weight，100-900）与字体样式名的对应表。
 *
 * PS 的字体面板里「字体样式」下拉列的是**该字体实际提供的字面**（Light / Regular /
 * Medium / Bold ...），名字直接来自字体文件，PS 中文版也不翻译，所以这里同样用英文。
 *
 * PS 的做法是按家族枚举真实字面，浏览器里做不到——没有任何 Web API 能列出
 * 一个系统字体家族有哪些字重。所以退化成：一律列全部 9 档，由浏览器就近匹配
 * （CSS font matching 会把找不到的字重回退到最接近的那个字面）。
 */
export interface FontWeightOption {
  value: number;
  label: string;
}

export const FONT_WEIGHTS: readonly FontWeightOption[] = [
  { value: 100, label: 'Thin' },
  { value: 200, label: 'ExtraLight' },
  { value: 300, label: 'Light' },
  { value: 400, label: 'Regular' },
  { value: 500, label: 'Medium' },
  { value: 600, label: 'SemiBold' },
  { value: 700, label: 'Bold' },
  { value: 800, label: 'ExtraBold' },
  { value: 900, label: 'Heavy' },
];

/** 常规字重。字体没写明字重时的默认值 */
export const NORMAL_WEIGHT = 400;

/** 粗体字重。仿粗体（bold 布尔量）也按这个值合成 */
export const BOLD_WEIGHT = 700;

/**
 * 把任意输入夹到合法的 CSS font-weight 范围。
 * PSD 里偶尔会出现越界值，直接塞给 canvas 会让整条 font 字符串被判非法而静默失效
 * ——画面上是文字整层消失，不报错，所以这里必须兜住。
 */
export function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return NORMAL_WEIGHT;
  return Math.min(900, Math.max(1, Math.round(weight)));
}

const FONT_WEIGHT_VALUES: readonly number[] = FONT_WEIGHTS.map((option) => option.value);

/**
 * 从一组候选字重里就近取一个。候选集不一定是完整的 9 档
 * ——可下载字体只有部分字重有完整字符集的文件，那边的候选集是残缺的。
 *
 * 平手时取较轻的那档，和 CSS font matching 在 400 以下的规则一致
 * （先朝轻的方向找，找不到再朝重的方向）。
 */
export function nearestOf(weights: readonly number[], weight: number): number {
  const target = clampWeight(weight);
  let best = weights[0];
  for (const value of weights) {
    if (Math.abs(value - target) < Math.abs(best - target)) best = value;
  }
  return best;
}

/**
 * 就近取一档。可变字体可能给出 450 这种档位之间的值，
 * 下拉框只有 9 个选项，不就近归一的话控件会显示空白。
 */
export function nearestWeight(weight: number): FontWeightOption {
  const value = nearestOf(FONT_WEIGHT_VALUES, weight);
  return FONT_WEIGHTS[FONT_WEIGHT_VALUES.indexOf(value)];
}
