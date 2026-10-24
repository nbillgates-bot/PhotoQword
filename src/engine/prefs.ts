/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * localStorage 的读写兜底。
 *
 * 隐私模式（Safari 无痕、Firefox 严格模式）下 localStorage 的存取会**直接抛异常**，
 * 不是返回 null。不兜住的话后果不是「记不住设置」而是整个界面白屏 ——
 * 这段代码跑在 store 创建期，抛出来没人接。
 *
 * 只管字符串进出，解析与校验交给各自的调用方：
 * 面板宽度要按视口重夹（panelPrefs），停靠边要校验枚举值（touchPrefs），
 * 这些规则各不相同，塞进一个泛型函数只会得到一堆参数。
 */

/** 读一条。没存过、或存取抛异常，都返回 null */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 写一条。存不下不影响本次会话，只是下次打开回到默认值 */
export function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 忽略：存不住设置不是错误路径，没有可提示用户的内容
  }
}
