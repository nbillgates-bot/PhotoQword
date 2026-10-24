/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useReducer } from 'react';
import { isWebFontLoaded, onWebFontStatus, requestWebFont } from '../engine/webFontLoader';
import { NORMAL_WEIGHT } from '../engine/fontWeights';
import { webFontKeyFor, webFontSource } from '../engine/webFontSources';
import { useEditorStore } from '../store';

/**
 * 盯着当前编辑的文字层用的字体：缺了就去下，到货时让组件重渲染一次。
 *
 * 不返回值：调用方要做的事就是"重新量一遍"，而重渲染本身就是那个信号。
 * 返回一个计数器再塞进 useMemo 依赖里也能work，但那个依赖在 memo 体里没人用，
 * 属于藏在依赖数组里的副作用，可读性和 lint 都不认。
 *
 * 为什么需要：字体没到之前 measureText 量的是后备字体的字宽，拿这个宽度定下
 * textarea 的盒子之后，字体一到位字形宽度就变了，盒子却还是旧的——
 * 居中/右对齐的文字会整体偏出去，点文本超出的部分还会被 overflow:hidden 裁掉。
 *
 * 只服务「当前正在编辑的那个文字层」。故意不去重画其它文字层：
 * PSD 进来的图层是 PS 自己排版好的像素，用户没动过就不该被我们悄悄重排
 * （那还会绕过历史记录）。PS 的做法也是打开时提示缺字体，但不动已有画面。
 */
export function useWebFontReady(family: string, fontWeight: number = NORMAL_WEIGHT): void {
  const [, forceRender] = useReducer((count: number) => count + 1, 0);

  useEffect(() => {
    // 已经在手上就没什么可等的。按字重问：一个家族每档字重是独立的一个文件
    if (isWebFontLoaded(family, fontWeight)) return;

    // 先订阅再发起请求，免得请求在订阅之前就完成、白等一场
    const unsubscribe = onWebFontStatus((arrived, status) => {
      if (arrived !== family) return;
      // 用 getState 而不是订阅式取值：这里只是发通知，没必要让 showToast 变成依赖
      const { showToast } = useEditorStore.getState();

      if (status === 'start') {
        /*
         * 中文字体动辄几 MB，静默下载会让人以为编辑器卡住了；
         * 而且字到货那一下文字会重新排版、位置微动，事先说一声才不会以为是 bug。
         */
        // 体积要按实际下的那一档查：清单是一档一条，键带字重后缀
        const mb = webFontSource(webFontKeyFor(family, fontWeight))?.approxMB;
        /*
         * 带体积和不带体积是两条独立词条，不是拼起来的 ——
         * 「（约 3MB）」在句子里的位置各语言不同，拆开拼会得到语序不对的句子。
         */
        if (mb) showToast('toast.font.downloadingSized', 'info', { family, size: mb });
        else showToast('toast.font.downloading', 'info', { family });
        return;
      }
      if (status === 'loaded') {
        forceRender();
        showToast('toast.font.ready', 'success', { family });
        return;
      }
      // 失败不能静默（规约 §7）。同一字体一次会话只会失败一次，不会反复弹
      showToast('toast.font.failed', 'error', { family });
    });
    // 不在下载清单里的字体 requestWebFont 自己会忽略，这里不用判断
    requestWebFont(family, fontWeight);

    return unsubscribe;
  }, [family, fontWeight]);
}
