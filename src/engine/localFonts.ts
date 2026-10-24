/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * Local Font Access API 封装。
 *
 * PS 是桌面程序，能直接列出系统里装的所有字体。浏览器里对应的能力是
 * queryLocalFonts()，但它有两条硬限制，所以只能当**渐进增强**用：
 *
 * - 只有 Chromium 系（Chrome/Edge）实现，Firefox 与 Safari 都以指纹追踪为由
 *   明确拒绝。按规约 §3.1 不能依赖单引擎 API，因此探不到时必须退回内置清单。
 * - 需要 HTTPS + 用户显式授权（会弹权限框）。
 *
 * 特性检测用 typeof 判函数（规约 §3.1 禁止 UA 嗅探）。
 */

/** queryLocalFonts 返回的条目，只用得到 family */
interface LocalFontData {
  family: string;
  fullName?: string;
  postscriptName?: string;
  style?: string;
}

interface LocalFontWindow {
  queryLocalFonts?: () => Promise<LocalFontData[]>;
}

/** 当前环境支不支持枚举系统字体 */
export function supportsLocalFonts(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof (window as unknown as LocalFontWindow).queryLocalFonts === 'function';
}

/**
 * 枚举系统字体的家族名（去重）。
 *
 * 任何失败都返回空数组而不是抛错：用户拒绝授权是完全正常的选择，
 * 不该让字体下拉框变成一个错误提示。调用方拿到空数组就退回内置清单。
 *
 * 不缓存结果：用户可能在会话中间才点「允许」，缓存住第一次的空数组
 * 会让授权后依然看不到字体。调用方自己决定何时再问一次。
 */
export async function queryLocalFontFamilies(): Promise<string[]> {
  if (!supportsLocalFonts()) return [];
  const api = (window as unknown as LocalFontWindow).queryLocalFonts;
  if (!api) return [];

  try {
    const fonts = await api();
    // 一个家族有多个字形（Regular/Bold/Italic…），下拉框只要家族名
    return [...new Set(fonts.map((font) => font.family).filter(Boolean))];
  } catch {
    // 用户拒绝、非安全上下文、或浏览器内部报错，一律静默退回
    return [];
  }
}
