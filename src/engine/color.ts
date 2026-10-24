/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { clamp } from './canvasUtils';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

/** #rgb / #rrggbb -> RGB */
export function hexToRgb(hex: string): RGB {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = Number.parseInt(value, 16);
  if (Number.isNaN(int)) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** RGB -> #rrggbb */
export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (n: number) =>
    Math.round(clamp(n, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** RGB -> HSV，h ∈ [0,360)，s/v ∈ [0,1] */
export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

/** HSV -> RGB */
export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = v - c;
  return {
    r: Math.round((rgb[0] + m) * 255),
    g: Math.round((rgb[1] + m) * 255),
    b: Math.round((rgb[2] + m) * 255),
  };
}

/** 生成 rgba() 字符串 */
export function rgba(color: string, alpha: number): string {
  const { r, g, b } = hexToRgb(color);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

/** 亮度（用于对比色判断） */
export function luminance({ r, g, b }: RGB): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * CMYK -> RGB，各分量 0..1。
 *
 * 这是**朴素换算**，不走 ICC 特性文件。真正的 CMYK 转换要靠印刷特性文件
 * （同一组 CMYK 值在不同纸张和油墨下颜色差得很远），浏览器里拿不到，
 * 也不该为此引入联网的色彩管理依赖（规约 §7）。
 * 用途是把导入色库里的 CMYK 色块显示成一个**近似**颜色，不是打样。
 */
export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  return {
    r: Math.round(255 * (1 - clamp(c, 0, 1)) * (1 - clamp(k, 0, 1))),
    g: Math.round(255 * (1 - clamp(m, 0, 1)) * (1 - clamp(k, 0, 1))),
    b: Math.round(255 * (1 - clamp(y, 0, 1)) * (1 - clamp(k, 0, 1))),
  };
}

/** D50 白点。Adobe 的 Lab 用 D50，不是图形学常见的 D65 */
const D50 = { x: 0.96422, y: 1, z: 0.82521 };

/** sRGB 的传递函数（线性 -> 编码值） */
function gammaEncode(value: number): number {
  const v = clamp(value, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * Lab -> RGB。L ∈ [0,100]，a/b ∈ [-128,127]。
 *
 * 潘通等专业色库在 .ase 里普遍存 Lab —— Lab 与设备无关，是描述「这个颜色
 * 本身」的正确方式。要显示到屏幕上就得落到 sRGB，这一步必然有色域裁剪：
 * 不少潘通色（尤其荧光色和金属色）在 sRGB 里根本表示不出来，
 * 结果是最接近的可显示颜色，不等于真实油墨色。
 *
 * 矩阵是 XYZ(D50) -> sRGB 的标准值（含 Bradford 白点适应），
 * 直接用合成后的矩阵，省掉一次中间转换。
 */
export function labToRgb(l: number, a: number, b: number): RGB {
  // Lab -> XYZ
  const fy = (clamp(l, 0, 100) + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  // f 的反函数，带线性段（避免接近 0 时斜率爆掉）
  const inv = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));

  const x = D50.x * inv(fx);
  const y = D50.y * inv(fy);
  const z = D50.z * inv(fz);

  // XYZ(D50) -> 线性 sRGB
  const rLinear = 3.1338561 * x - 1.6168667 * y - 0.4906146 * z;
  const gLinear = -0.9787684 * x + 1.9161415 * y + 0.033454 * z;
  const bLinear = 0.0719453 * x - 0.2289914 * y + 1.4052427 * z;

  return {
    r: Math.round(gammaEncode(rLinear) * 255),
    g: Math.round(gammaEncode(gLinear) * 255),
    b: Math.round(gammaEncode(bLinear) * 255),
  };
}
