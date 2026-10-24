/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../store';
import { flatten } from '../engine/compositor';
import { downloadBlob } from '../engine/download';
import { PickCancelled, pickOpenFile } from '../engine/fileSystemAccess';
import { planDrop } from '../engine/dropOpen';
import { useSaveFile, type SaveFileApi } from './useSaveFile';
import { useT } from './useT';

/**
 * 文件读写。
 * 隐藏的 file input 挂在 body 上，避免受布局影响；导出走 canvas.toBlob + 临时链接。
 */
export function useFileIO() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openImageFile = useEditorStore((state) => state.openImageFile);
  const placeImageFile = useEditorStore((state) => state.placeImageFile);
  const showToast = useEditorStore((state) => state.showToast);
  const t = useT();
  const saveApi = useSaveFile();
  const { rememberOpened } = saveApi;

  // 组件挂载时创建 input，卸载时移除，保证不会残留在 DOM 里
  useEffect(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.psd,.psb';
    input.style.display = 'none';
    document.body.appendChild(input);
    inputRef.current = input;
    return () => {
      input.remove();
      inputRef.current = null;
    };
  }, []);

  /** 隐藏 input 那条老路。没有系统文件框（Firefox / Safari）时走它 */
  const pickWithInput = useCallback(
    (mode: 'open' | 'place') => {
      const input = inputRef.current;
      if (!input) return;
      input.onchange = async () => {
        const file = input.files?.[0];
        input.value = '';
        if (!file) return;
        try {
          if (mode === 'open') {
            await openImageFile(file);
            // 拿不到句柄，只记名字：之后 Ctrl+S 会按这个名字重新下载
            rememberOpened(null, file.name);
          } else await placeImageFile(file);
        } catch {
          showToast(mode === 'open' ? 'toast.openFailed' : 'toast.placeFailed', 'error');
        }
      };
      input.click();
    },
    [openImageFile, placeImageFile, rememberOpened, showToast],
  );

  /**
   * mode = 'open' 新建文档打开，'place' 作为图层置入当前文档。
   *
   * 打开优先走 showOpenFilePicker：只有它能连带给出可写句柄，
   * 之后按 Ctrl+S 才能像 PS 那样静默写回同一个文件。
   * 置入不需要句柄（置入的是别的图，存的是当前文档），照走隐藏 input。
   */
  const pickFile = useCallback(
    (mode: 'open' | 'place') => {
      if (mode === 'place') {
        pickWithInput('place');
        return;
      }
      void (async () => {
        try {
          const handle = await pickOpenFile(t('filePicker.images'));
          if (!handle) {
            pickWithInput('open');
            return;
          }
          const file = await handle.getFile();
          await openImageFile(file);
          rememberOpened(handle, file.name);
        } catch (err) {
          if (err instanceof PickCancelled) return;
          showToast('toast.openFailed', 'error');
        }
      })();
    },
    [openImageFile, pickWithInput, rememberOpened, showToast, t],
  );

  /**
   * 处理拖进画布的文件。
   *
   * 打开还是置入由 planDrop 判定（规则见 engine/dropOpen.ts）：
   * 没有文档时打开，有文档时普通图片置入、PSD 仍然打开。
   * 格式不做白名单，能不能解码交给解码器，失败了弹提示。
   */
  const openDroppedFiles = useCallback(
    (files: FileList) => {
      const plan = planDrop(
        Array.from(files).map((file) => file.name),
        !!useEditorStore.getState().doc,
      );
      if (!plan) return;

      // 一次拖进来多个只处理第一个，剩下的要说出来（规约 §7：不许静默丢）
      if (plan.ignored > 0) showToast('toast.dropOneOnly', 'info', { count: plan.ignored });

      const file = files[plan.index];
      void (async () => {
        try {
          if (plan.action === 'open') {
            // openImageFile 内部按扩展名分派 PSD 与普通图片
            await openImageFile(file);
            // 拖进来的 File 给不出可写句柄，只记名字：Ctrl+S 会退化成按这个名字下载
            rememberOpened(null, file.name);
          } else {
            await placeImageFile(file);
          }
        } catch {
          showToast(plan.action === 'open' ? 'toast.openFailed' : 'toast.placeFailed', 'error');
        }
      })();
    },
    [openImageFile, placeImageFile, rememberOpened, showToast],
  );

  /** 把当前文档合并导出为图片文件 */
  const exportImage = useCallback(
    (format: 'png' | 'jpeg' | 'webp', quality: number) => {
      const { doc, layers } = useEditorStore.getState();
      if (!doc) {
        showToast('toast.noDocToExport', 'error');
        return;
      }
      const flat = flatten(layers, doc.width, doc.height);
      const mime = `image/${format}`;
      flat.toBlob(
        (blob) => {
          if (!blob) {
            showToast('toast.exportFailed', 'error');
            return;
          }
          downloadBlob(blob, `${doc.name}.${format === 'jpeg' ? 'jpg' : format}`);
          showToast('toast.exportDone', 'success');
        },
        mime,
        quality / 100,
      );
    },
    [showToast],
  );

  // 存储 / 存储为在 useSaveFile 里，这里只把它们透出去，保持单一入口
  return { pickFile, openDroppedFiles, exportImage, ...saveApi };
}

export type FileIoApi = ReturnType<typeof useFileIO> & SaveFileApi;
