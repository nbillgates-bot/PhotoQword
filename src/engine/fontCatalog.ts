/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { FONT_FAMILIES } from './textRender';
import { webFontFamilyList } from './webFontSources';

/**
 * 字体下拉框的数据来源。
 *
 * 分三档，与 PS 的字体面板对齐（PS 也是把「可用」和「需同步」分开列）：
 * - system：本机装了的字体，选了立刻生效。
 * - web：我们能合法自动下载的（思源、普惠体），选了触发下载。
 * - missing：清单里有、本机却没装，且我们也下载不了的。列出来但禁用，
 *   不能假装可选——选了不生效是最难查的一类问题。
 *
 * 为什么不直接把 FONT_FAMILIES 丢给下拉框：那张表是写死的 11 个，
 * 既没包含已经做好的 Web 字体（加载器造好了却没有入口触发），
 * 也不管本机到底装没装（选了 SimSun 在 mac 上静默失效）。
 */
export type FontKind = 'system' | 'web' | 'missing';

export interface FontEntry {
  /** CSS font-family 名，也是 textData.fontFamily 存的值 */
  family: string;
  kind: FontKind;
  /** web 字体的大致体积（MB），用于在选单里提示「约 5MB」 */
  approxMB?: number;
}

/**
 * 合并出完整字体清单。
 *
 * @param isAvailable 本机是否装了某字体。注入而非直接调 fontAvailable，
 *   是为了让这个函数保持纯粹、可测（探测要 canvas，测试里不好造）。
 * @param localFamilies Local Font Access API 枚举到的系统字体。
 *   拿不到（非 Chromium、未授权、非 HTTPS）时传空数组，退回清单模式。
 */
export function buildFontCatalog(
  isAvailable: (family: string) => boolean,
  localFamilies: readonly string[] = [],
): FontEntry[] {
  const web = webFontFamilyList();
  const webNames = new Set(web.map((item) => item.family));

  const entries: FontEntry[] = [];
  const added = new Set<string>();

  const push = (family: string, kind: FontKind, approxMB?: number) => {
    if (added.has(family)) return;
    added.add(family);
    entries.push({ family, kind, approxMB });
  };

  /*
   * 系统字体优先：枚举到的排在前面，因为它们一定能立刻用。
   * 枚举结果可能上千条，按名字排序，否则顺序由系统决定、每台机器不一样。
   */
  for (const family of [...localFamilies].sort((a, b) => a.localeCompare(b))) {
    // 能下载的那些归到 web 档，避免同一个名字两处出现
    if (webNames.has(family)) continue;
    push(family, 'system');
  }

  /*
   * 内置清单兜底。枚举失败时这是唯一来源，
   * 枚举成功时它多半已经被覆盖，只补上枚举漏掉的。
   */
  for (const family of FONT_FAMILIES) {
    if (webNames.has(family)) continue;
    push(family, isAvailable(family) ? 'system' : 'missing');
  }

  // Web 字体放最后：它们要下载，不该挤在最顺手的位置
  for (const { family, approxMB } of web) push(family, 'web', approxMB);

  return entries;
}
