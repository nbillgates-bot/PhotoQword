/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useMemo, useState } from 'react';
import { buildFontCatalog, type FontEntry } from '../engine/fontCatalog';
import { fontAvailable } from '../engine/fontFallback';
import { queryLocalFontFamilies, supportsLocalFonts } from '../engine/localFonts';
import type { SelectOption } from '../components/ui/Select';
import { useT } from './useT';

/**
 * 字体下拉框的选项。
 *
 * 两个消费方（工具选项栏 TextOptions、属性面板 TextProperties）共用，
 * 免得两处各写一遍合并与分组逻辑（规约 §1.1）。
 *
 * 系统字体枚举是异步且要授权的，所以先用内置清单渲染，
 * 拿到结果后再补齐——不能让下拉框在授权框弹出期间是空的。
 */

/** 枚举只做一次：授权框不该每次挂载都弹 */
let cachedLocal: string[] | null = null;

export function useFontOptions(): SelectOption<string>[] {
  const t = useT();
  const [local, setLocal] = useState<string[]>(() => cachedLocal ?? []);

  useEffect(() => {
    // 已经问过（或不支持）就不再问
    if (cachedLocal !== null || !supportsLocalFonts()) return;
    let alive = true;
    void queryLocalFontFamilies().then((families) => {
      cachedLocal = families;
      // 卸载后不再 setState，避免 React 报警
      if (alive && families.length > 0) setLocal(families);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const catalog = buildFontCatalog(fontAvailable, local);
    return catalog.map((entry) => toOption(entry, t));
  }, [local, t]);
}

/** 一条字体 → 下拉选项。分组名与体积提示都在这里拼 */
function toOption(
  entry: FontEntry,
  t: (key: string, values?: Record<string, string | number>) => string,
): SelectOption<string> {
  if (entry.kind === 'web') {
    return {
      value: entry.family,
      // 带上体积，让用户对「点了要等下载」有心理准备
      label: entry.approxMB
        ? t('font.webWithSize', { name: entry.family, size: entry.approxMB })
        : entry.family,
      group: t('font.groupWeb'),
    };
  }
  if (entry.kind === 'missing') {
    return {
      value: entry.family,
      label: t('font.missing', { name: entry.family }),
      group: t('font.groupMissing'),
      // 选了不生效才是最难查的问题，直接禁掉
      disabled: true,
    };
  }
  return { value: entry.family, label: entry.family, group: t('font.groupSystem') };
}
