/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback } from 'react';
import { useEditorStore } from '../store';
import type { SaveTarget } from '../store/types';
import { downloadBlob } from '../engine/download';
import { flatten } from '../engine/compositor';
import {
  PickCancelled,
  pickSaveFile,
  supportsSavePicker,
  writeToHandle,
  type SaveFileHandle,
} from '../engine/fileSystemAccess';
import { buildSaveName } from '../engine/formats/saveNaming';
import { errorToToast } from '../i18n/errorMessage';
import { formatById, formatByExt, type FormatDef, type FormatId } from '../engine/formats/registry';

/**
 * 存储 / 存储为，语义对齐 PS：
 *
 * - **存储（Ctrl+S）**：已有关联文件就直接写回、不弹任何窗；从没存过就转成存储为。
 * - **存储为（Ctrl+Shift+S）**：一定先问名字和位置，存完把文档关联到新文件。
 *
 * 格式支持 PSD / PSB / PNG / JPEG / WebP / GIF / TIFF / BMP / TGA / PCX / Netpbm / PDF / Raw，
 * 每种的编码器在 engine/formats 里。PS 有的我们都有，浏览器做不出来的（JPEG 2000 / OpenEXR）
 * 在格式注册表的注释里明确说了。降级路径（Firefox / Safari）改弹我们自己的对话框。
 */

/** 把当前文档编码成字节。动态 import 的理由：PSD 要拉 ag-psd（约 287 kB） */
async function buildBlob(formatId: FormatId, quality: number): Promise<Blob> {
  const { doc, layers } = useEditorStore.getState();
  if (!doc) throw new Error('没有可保存的文档'); // i18n-exempt: 外层已挡过 doc 为空，这里是兜底断言
  const format = formatById(formatId);
  const flat = flatten(layers, doc.width, doc.height);
  const bytes = await format.encode({ flat, doc, layers, quality });
  return new Blob([bytes], { type: `application/${format.ext}` });
}

/** 类型过滤项：把选中的格式排最前，其余在后 */
function typesFor(selected: FormatDef): NonNullable<Parameters<typeof pickSaveFile>[1]> {
  const all: NonNullable<Parameters<typeof pickSaveFile>[1]> = [
    {
      description: 'Photoshop (*.PSD;*.PSB;*.PDD)',
      accept: { 'image/vnd.adobe.photoshop': ['.psd', '.psb', '.pdd'] },
    },
    { description: 'PNG (*.PNG)', accept: { 'image/png': ['.png'] } },
    { description: 'JPEG (*.JPG;*.JPEG)', accept: { 'image/jpeg': ['.jpg', '.jpeg', '.jpe'] } },
    { description: 'WebP (*.WEBP)', accept: { 'image/webp': ['.webp'] } },
    { description: 'GIF (*.GIF)', accept: { 'image/gif': ['.gif'] } },
  ];
  // 选中的在前，系统文件框会默认选中第一个
  const idx = all.findIndex((item) =>
    Object.values(item.accept)[0].some((ext: string) => ext === `.${selected.ext}`),
  );
  if (idx >= 0) return [all[idx], ...all.slice(0, idx), ...all.slice(idx + 1)];
  return all;
}

export interface SaveFileApi {
  /** 存储（Ctrl+S）。没有关联文件时自动转存储为 */
  save: () => Promise<void>;
  /** 存储为（Ctrl+Shift+S）。总是先问名字 */
  saveAs: () => Promise<void>;
  /** 降级对话框回调：拿着用户选的格式和名字真正落盘 */
  saveWithFormat: (formatId: FormatId, fileName: string, quality: number) => Promise<void>;
  /** 打开文件后记住句柄，之后 Ctrl+S 才能静默写回 */
  rememberOpened: (handle: SaveFileHandle | null, fileName: string) => void;
}

export function useSaveFile(): SaveFileApi {
  const showToast = useEditorStore((state) => state.showToast);

  /** 写盘并收尾。target 里 handle 为 null 表示走下载 */
  const writeTo = useCallback(
    async (target: SaveTarget) => {
      const { markSaved, beginProgress, endProgress } = useEditorStore.getState();
      beginProgress({
        titleKey: 'progress.save',
        labelKey: 'progress.writing',
        labelParams: { name: target.fileName },
        ratio: null,
      });
      try {
        const blob = await buildBlob(target.formatId, target.quality);
        if (target.handle) {
          const ok = await writeToHandle(target.handle, blob);
          if (!ok) {
            showToast('error.save.noPermission', 'error');
            useEditorStore.getState().clearSaveTarget();
            return;
          }
          markSaved(target);
          showToast('toast.saved', 'success', { name: target.fileName });
          return;
        }
        downloadBlob(blob, target.fileName);
        markSaved(target);
        showToast('toast.downloadedInstead', 'success', { name: target.fileName });
      } finally {
        endProgress();
      }
    },
    [showToast],
  );

  /** 统一的失败处理：用户取消不算错误，其余弹红条 */
  const guard = useCallback(
    async (run: () => Promise<void>) => {
      try {
        await run();
      } catch (err) {
        if (err instanceof PickCancelled) {
          showToast('toast.saveCancelled');
          return;
        }
        const m = errorToToast(err, 'error.save.failed');
        showToast(m.key, 'error', m.params, m.paramKeys);
      }
    },
    [showToast],
  );

  const saveAs = useCallback(
    () =>
      guard(async () => {
        const { doc, saveTarget, openDialog } = useEditorStore.getState();
        if (!doc) {
          showToast('error.save.noDoc', 'error');
          return;
        }
        // 沿用上次存的格式与质量；从没存过则默认 PSD（PS 的存储为也默认 PSD）
        const format = formatById(saveTarget?.formatId ?? 'psd');
        const quality = saveTarget?.quality ?? 92;
        const suggested = buildSaveName(doc.name, format, doc);

        // 没有系统文件框时改用我们自己的对话框问名字和格式
        if (!supportsSavePicker()) {
          openDialog('save-as', suggested);
          return;
        }
        const handle = await pickSaveFile(suggested, typesFor(format));
        if (!handle) return;
        /*
         * 用户可能在系统框里手敲了别的扩展名，按它重定格式 ——
         * PS 也是这个行为：改了扩展名就按那个格式存。
         */
        const chosen = formatByExt(handle.name) ?? format;
        await writeTo({
          handle,
          fileName: handle.name,
          formatId: chosen.id,
          quality,
        });
      }),
    [guard, showToast, writeTo],
  );

  const save = useCallback(
    () =>
      guard(async () => {
        const { doc, saveTarget } = useEditorStore.getState();
        if (!doc) {
          showToast('error.save.noDoc', 'error');
          return;
        }
        // 从没存过 → PS 里 Ctrl+S 此时就是弹「存储为」
        if (!saveTarget) {
          await saveAs();
          return;
        }
        await writeTo(saveTarget);
      }),
    [guard, saveAs, showToast, writeTo],
  );

  const saveWithFormat = useCallback(
    (formatId: FormatId, fileName: string, quality: number) =>
      guard(() => writeTo({ handle: null, fileName, formatId, quality })),
    [guard, writeTo],
  );

  const rememberOpened = useCallback((handle: SaveFileHandle | null, fileName: string) => {
    // 按扩展名认格式：打开 PSD 就关联 PSD，打开 PNG 则关联 PNG
    const format = formatByExt(fileName) ?? formatById('psd');
    useEditorStore.getState().setSaveTarget({
      handle,
      fileName,
      formatId: format.id,
      quality: 92,
    });
  }, []);

  return { save, saveAs, saveWithFormat, rememberOpened };
}
