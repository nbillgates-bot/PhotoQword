/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * File System Access API 的最小封装。
 *
 * 「存储」要做到 PS 那样不弹窗直接写回原文件，浏览器里只有这套 API 能办到：
 * 它给的文件句柄可以反复写入，权限只在第一次取句柄时问一次。
 *
 * 兼容性是硬伤（见 CLAUDE.md 第三节）：Chrome / Edge 86+ 支持，
 * Firefox 明确不实现，Safari 只有 OPFS 那半边、没有 showSaveFilePicker。
 * 所以每个入口都做特性检测，不支持时返回 null 而不是抛错，
 * 由调用方降级成「问名字 + 下载」（见 hooks/useSaveFile.ts）。
 *
 * 本文件不认识 React 也不认识 store，只包装浏览器 API。
 */

/** 用户在系统文件框里点了取消。与真正的失败区分开：取消不弹错误条 */
export class PickCancelled extends Error {
  constructor() {
    super('PickCancelled'); // i18n-exempt: 只用来区分取消与失败，不显示给用户
    this.name = 'PickCancelled';
  }
}

/** 可写入的文件流。只列我们用到的方法 */
interface WritableFileStream {
  write(data: Blob | BufferSource): Promise<void>;
  close(): Promise<void>;
}

/**
 * 文件句柄。
 *
 * 刻意不叫 FileSystemFileHandle：lib.dom.d.ts 里已有同名类型（供
 * DataTransferItem.getAsFileSystemHandle 用），但缺 createWritable 的声明，
 * 重名会让两边的定义互相打架。这里只声明我们真正调用的那几个成员。
 */
export interface SaveFileHandle {
  readonly name: string;
  createWritable(): Promise<WritableFileStream>;
  getFile(): Promise<File>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/** 文件框的类型过滤项 */
interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

interface SavePickerOptions {
  suggestedName?: string;
  types?: FilePickerType[];
  excludeAcceptAllOption?: boolean;
}

interface OpenPickerOptions {
  types?: FilePickerType[];
  multiple?: boolean;
}

/** 挂在 window 上的两个入口。用可选属性表达「可能不存在」 */
interface PickerWindow {
  showSaveFilePicker?: (options?: SavePickerOptions) => Promise<SaveFileHandle>;
  showOpenFilePicker?: (options?: OpenPickerOptions) => Promise<SaveFileHandle[]>;
}

function pickerWindow(): PickerWindow {
  // 测试环境（jsdom）里没有 window，取值前先挡一道
  return typeof window === 'undefined' ? {} : (window as unknown as PickerWindow);
}

/** 能不能弹系统「存储为」文件框。用它决定走真存储还是降级下载 */
export function supportsSavePicker(): boolean {
  return typeof pickerWindow().showSaveFilePicker === 'function';
}

/** 能不能弹系统「打开」文件框（顺带拿到可写句柄） */
export function supportsOpenPicker(): boolean {
  return typeof pickerWindow().showOpenFilePicker === 'function';
}

/**
 * 存储文件框的类型过滤项。
 *
 * 第一项决定文件框默认选中的格式，所以调用方要把用户在我们的下拉里
 * 选的那个格式排在最前面 —— 这样系统框打开时显示的就是它。
 */
export type SaveTypes = FilePickerType[];

/**
 * 打开文件框时的类型过滤：PSD 之外还收普通图片。
 *
 * description 会显示在系统文件框里，所以要按界面语言给 ——
 * engine 不认识语言，由调用方传入（I18N.md §2.3）。
 */
function openTypes(description: string): FilePickerType[] {
  return [
    {
      description,
      accept: {
        'image/vnd.adobe.photoshop': ['.psd', '.psb'],
        'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'],
      },
    },
  ];
}

/**
 * 用户取消文件框时浏览器抛的是 AbortError。
 * 认 name 而不是 instanceof DOMException：后者在部分环境里不是全局构造器。
 */
function isAbort(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * 弹系统「存储为」框，返回可写句柄。
 * 不支持该 API 时返回 null（调用方据此降级）；用户取消时抛 PickCancelled。
 */
export async function pickSaveFile(
  suggestedName: string,
  types: SaveTypes,
): Promise<SaveFileHandle | null> {
  const show = pickerWindow().showSaveFilePicker;
  if (!show) return null;
  try {
    return await show({ suggestedName, types });
  } catch (err) {
    if (isAbort(err)) throw new PickCancelled();
    throw err;
  }
}

/**
 * 弹系统「打开」框，返回句柄（带着它才能在之后静默写回，即 PS 的存储）。
 * 不支持时返回 null，调用方退回隐藏 input 那条路；取消时抛 PickCancelled。
 */
export async function pickOpenFile(
  /** 文件类型的描述文字，显示在系统文件框里。不传时退回中文 */
  typeDescription = '图像文件', // i18n-exempt: 兜底值，正常路径由 useFileIO 按语言传入
): Promise<SaveFileHandle | null> {
  const show = pickerWindow().showOpenFilePicker;
  if (!show) return null;
  try {
    const [handle] = await show({ types: openTypes(typeDescription), multiple: false });
    return handle ?? null;
  } catch (err) {
    if (isAbort(err)) throw new PickCancelled();
    throw err;
  }
}

/**
 * 把数据写进句柄指向的文件。
 *
 * 写之前先确认还有写权限：句柄能跨会话保存，但权限会过期，
 * 过期时直接 createWritable 会抛 NotAllowedError。
 * 拿不到权限就返回 false，调用方改走「存储为」。
 */
export async function writeToHandle(handle: SaveFileHandle, data: Blob): Promise<boolean> {
  if (handle.queryPermission && handle.requestPermission) {
    const mode = { mode: 'readwrite' as const };
    let state = await handle.queryPermission(mode);
    if (state !== 'granted') state = await handle.requestPermission(mode);
    if (state !== 'granted') return false;
  }
  const stream = await handle.createWritable();
  await stream.write(data);
  await stream.close();
  return true;
}
