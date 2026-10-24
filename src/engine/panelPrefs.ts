/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 面板宽度的持久化。
 *
 * 调过一次宽度就该一直是那个宽度，下次打开还得再调一遍是最烦人的那种交互。
 * 存取的异常兜底在 engine/prefs.ts，那里有为什么必须兜的说明。
 */

import { clampPanelWidth, defaultPanelWidth } from './panelWidth';
import { readPref, writePref } from './prefs';

const WIDTH_KEY = 'qword.panelWidth';

/**
 * 读存过的面板宽度。
 *
 * 要按当前视口重新夹一遍：上次是在宽屏上存的 640，这次换到窄屏就得收窄，
 * 否则面板会把画布挤掉大半，而用户没做过任何操作。
 */
export function readPanelWidth(viewportWidth: number): number {
  const raw = readPref(WIDTH_KEY);
  if (raw === null) return defaultPanelWidth();
  const parsed = Number.parseFloat(raw);
  // 存坏了（手改过、旧版本格式）就当没存过
  return Number.isFinite(parsed) ? clampPanelWidth(parsed, viewportWidth) : defaultPanelWidth();
}

/** 记住面板宽度 */
export function storePanelWidth(width: number): void {
  writePref(WIDTH_KEY, String(width));
}
