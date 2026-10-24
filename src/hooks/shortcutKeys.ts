/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 快捷键的按键解析。纯函数，不碰 DOM，也不认识 store。
 *
 * 为什么不能直接用 event.key：
 * 中文输入法激活时，浏览器给出的 key 不是字母。Chrome/Firefox 实测下
 * 会变成 'Process'，有时直接给出正在合成的汉字（用户报的 "Ctrl+童" 就是这个）。
 * 这会让所有字母快捷键在开着输入法时全部失效——而中文用户默认就开着输入法。
 *
 * 为什么也不能只用 event.code：
 * code 是物理键位，AZERTY / Dvorak 上 KeyZ 并不在字母 z 的位置，
 * 只认 code 会让这些键盘的用户按错键。
 *
 * 所以两者结合：key 是干净的 ASCII 单字符时优先用它（尊重用户的键盘布局），
 * 否则退回 code 的键位（绕过输入法）。
 */

/** code 到逻辑键的映射，只覆盖快捷键实际用到的那些 */
const CODE_MAP: Record<string, string> = {
  Equal: '=',
  NumpadAdd: '+',
  Minus: '-',
  NumpadSubtract: '-',
};

/** 从 code 反推逻辑键，认不出来返回空串 */
function fromCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code.slice(6);
  return CODE_MAP[code] ?? '';
}

/** 判断是不是可直接使用的单个 ASCII 可见字符 */
function isPlainAscii(key: string): boolean {
  return key.length === 1 && key.charCodeAt(0) > 32 && key.charCodeAt(0) < 127;
}

/**
 * 解析出快捷键匹配用的逻辑键，一律小写。
 *
 * 具名键（Escape / Enter / Delete 等）不受输入法影响，直接用 key 小写。
 */
export function resolveShortcutKey(event: Pick<KeyboardEvent, 'key' | 'code'>): string {
  const { key, code } = event;
  if (key && key.length > 1 && key !== 'Process' && key !== 'Unidentified') {
    return key.toLowerCase();
  }
  if (isPlainAscii(key)) return key.toLowerCase();
  return fromCode(code ?? '');
}
