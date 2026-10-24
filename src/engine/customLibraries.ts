/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 用户导入的色库的读写。
 *
 * 存在 localStorage：色库是本机偏好，不该上传（规约 §7 的产品承诺 ——
 * 图片处理全在本地，用户的色库文件同理）。
 * 取值规则参照 engine/panelWidth.ts 的做法：读不出来就退回空，绝不抛异常。
 */

import type { ColorLibrary, ColorSwatch } from './colorLibraries';

const STORAGE_KEY = 'qword.colorLibraries';

/** 单个色库的上限。太大的文件会把 localStorage 撑爆（各家配额约 5MB） */
const MAX_SWATCHES = 4000;

/** 色库总数上限，防止无限攒 */
const MAX_LIBRARIES = 20;

/** 导入的色库：结构同内置色库，多一个 custom 标记供 UI 显示删除按钮 */
export interface CustomLibrary extends ColorLibrary {
  custom: true;
}

/** 一次导入的结果 */
export interface ImportOutcome {
  library?: CustomLibrary;
  /** 失败原因的词条 key */
  reasonKey?: string;
}

/**
 * 读全部导入色库。
 *
 * 任何异常都退回空数组：localStorage 可能被隐私模式禁掉、配额满、
 * 或者存进去的 JSON 被别的东西改坏了。这些都不该让拾色器打不开。
 */
export function loadCustomLibraries(): CustomLibrary[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // 逐项校验：外部可改的数据，不能假定结构还对
    return parsed.filter(isValidLibrary);
  } catch {
    return [];
  }
}

/** 结构校验。少一项就整条丢掉，不试图修补 */
function isValidLibrary(value: unknown): value is CustomLibrary {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Partial<CustomLibrary>;
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return false;
  if (!Array.isArray(item.colors)) return false;
  return item.colors.every(
    (swatch) => typeof swatch?.hex === 'string' && /^#[0-9a-f]{6}$/i.test(swatch.hex),
  );
}

/** 写回 localStorage。写不进去（配额满、隐私模式）返回 false，由调用方提示 */
function persist(libraries: CustomLibrary[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(libraries));
    return true;
  } catch {
    return false;
  }
}

/** 从文件名推色库显示名：去掉路径和后缀 */
export function libraryNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return base.replace(/\.(ase|aco)$/i, '') || base;
}

/**
 * 把一批色块存成一个导入色库。
 *
 * id 用「custom:文件名」而不是随机数：同一个文件再导一次应该**覆盖**而不是
 * 攒出两份同名色库。用户重新导出更新过的色库文件时，这个行为才符合预期。
 */
export function addCustomLibrary(fileName: string, swatches: ColorSwatch[]): ImportOutcome {
  if (!swatches.length) return { reasonKey: 'swatch.empty' };

  const existing = loadCustomLibraries();
  const name = libraryNameFromFile(fileName);
  const id = `custom:${name}`;

  const library: CustomLibrary = {
    id,
    name,
    // 超量截断而不是整个拒绝：几千色的色库照样能用前面那些
    colors: swatches.slice(0, MAX_SWATCHES),
    custom: true,
  };

  const others = existing.filter((item) => item.id !== id);
  if (others.length >= MAX_LIBRARIES) return { reasonKey: 'swatch.tooMany' };

  if (!persist([...others, library])) return { reasonKey: 'swatch.storageFull' };
  return { library };
}

/** 删掉一个导入色库。返回删除后的列表 */
export function removeCustomLibrary(id: string): CustomLibrary[] {
  const remaining = loadCustomLibraries().filter((item) => item.id !== id);
  persist(remaining);
  return remaining;
}
