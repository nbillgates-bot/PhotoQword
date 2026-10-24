/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 带词条 key 的错误。
 *
 * engine 层不认识语言（规约 §2.1），但用户会撞见的失败必须能翻译。
 * 所以 engine 抛的是"哪里不对"的 key，由 UI 层查词条表变成人话。
 *
 * 只有**用户能靠换个输入避免**的失败才用它（文件读不出、格式不支持、
 * 尺寸超限）。写错代码才会抛的契约性错误照旧用 Error + 中文，
 * 那些是给开发者看的，翻译没有收益（判断标准见 I18N.md 第四节）。
 */
export class AppError extends Error {
  /** 词条 key，如 'error.image.decodeFailed' */
  readonly messageKey: string;
  /** 词条里 {name} 占位符的取值 */
  readonly params?: Record<string, string | number>;
  /**
   * 值本身还是词条 key 的占位符，渲染时先翻一遍再填。
   * 用于"外层句子 + 内层原因"，例如尺寸超限的具体原因由 canvasLimits 给出 key。
   */
  readonly paramKeys?: Record<string, string>;

  constructor(
    messageKey: string,
    params?: Record<string, string | number>,
    paramKeys?: Record<string, string>,
  ) {
    /*
     * super 传 key 而不是译文：Error.message 在控制台和 stack 里都会露出来，
     * 给 key 至少能一眼定位到词条；给译文则要反查是哪条。
     */
    super(messageKey);
    this.name = 'AppError';
    this.messageKey = messageKey;
    this.params = params;
    this.paramKeys = paramKeys;
  }
}

/** 是不是带 key 的错误。用函数而不是 instanceof，跨模块实例更稳 */
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError || (err instanceof Error && err.name === 'AppError');
}
