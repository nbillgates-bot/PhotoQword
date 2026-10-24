/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 文字编辑器的焦点管理。
 *
 * 从 TextEditor 抽出来的一组副作用：进编辑时聚焦、blur 时决定退不退出、
 * 上色后把焦点和选区要回来。三件事共用同一份「最后一次选区」，所以放一起。
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useEditorStore } from '../store';

/**
 * 刚挂载后忽略 blur 的时间窗（毫秒）。
 *
 * 进入编辑那一下的 pointerup / click 会落在下层 viewport 上把焦点抢回去，
 * textarea 随即 blur —— 不挡住就等于刚进编辑立刻退出。
 * textTool 已经把 enterTextEdit 推迟到 pointerup，这里是第二道保险。
 */
const BLUR_GRACE_MS = 150;

interface UseTextEditorFocusResult {
  /** 绑到 textarea 的 onBlur */
  handleBlur: () => void;
  /** 绑到 textarea 的 onSelect / onKeyUp / onPointerUp，把选区同步进 store */
  reportSelection: () => void;
}

export function useTextEditorFocus(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  /** 有内容时进编辑要全选（PS 点击已有文字层的行为），空文本只置光标 */
  hasInitialContent: boolean,
): UseTextEditorFocusResult {
  const setTextSelection = useEditorStore((state) => state.setTextSelection);
  const exitTextEdit = useEditorStore((state) => state.exitTextEdit);
  const textFocusRequest = useEditorStore((state) => state.textFocusRequest);

  const mountedAtRef = useRef(0);
  /*
   * 记住最后一次选区，焦点回来时用它复原。
   *
   * 不能在焦点回来时直接读 textarea：blur 期间浏览器可能已经把选区折叠成
   * 光标（各家表现不一），读到的是折叠后的结果，于是「选中三个字 → 点颜色 →
   * 再点一次颜色」第二次就只剩光标了。
   */
  const lastSelectionRef = useRef<{ start: number; end: number } | null>(null);
  /*
   * 指针是否按在「不该打断文字编辑」的区域里（拾色器色块与它的对话框）。
   *
   * 用捕获阶段的 pointerdown 而不是 blur 的 relatedTarget：Safari 点按钮时
   * 不给按钮焦点，relatedTarget 是 null，靠它判断会漏（规约 §3.1 禁止嗅探
   * userAgent，只能用行为上稳的路径）。pointerdown 一定先于 blur 发生。
   */
  const keepEditRef = useRef(false);

  const reportSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    setTextSelection({ start: textarea.selectionStart, end: textarea.selectionEnd });
  };

  // 只在挂载时聚焦一次。依赖内容会让每次按键都重跑，select() 把已输入内容全选，
  // 下一个字符直接替换掉整段 —— 表现为「只能输入一个字」
  useEffect(() => {
    mountedAtRef.current = Date.now();
    const textarea = textareaRef.current;
    if (!textarea) return;
    // 延后一帧：挂载当帧 focus 会被同一串指针事件的默认行为顶掉
    const timer = window.setTimeout(() => {
      textarea.focus();
      if (hasInitialContent) textarea.select();
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在挂载时跑，理由见上
  }, []);

  useEffect(() => {
    const onPointerDown = (event: Event) => {
      const target = event.target as HTMLElement | null;
      keepEditRef.current = Boolean(target?.closest?.('[data-keep-text-edit]'));
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => window.removeEventListener('pointerdown', onPointerDown, true);
  }, []);

  /*
   * store 请求交还焦点（刚上过色）时，把焦点和选区一起复原。
   * 跳过首次渲染：挂载时计数器本来就有个初始值，那时的聚焦由上面那个 effect 负责。
   */
  const handledFocusRef = useRef(textFocusRequest);
  useEffect(() => {
    if (handledFocusRef.current === textFocusRequest) return;
    handledFocusRef.current = textFocusRequest;

    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    const selection = lastSelectionRef.current;
    if (selection) textarea.setSelectionRange(selection.start, selection.end);
  }, [textFocusRequest, textareaRef]);

  const handleBlur = () => {
    if (Date.now() - mountedAtRef.current < BLUR_GRACE_MS) {
      // 抢焦点导致的误触发，把焦点要回来
      textareaRef.current?.focus();
      return;
    }
    // 点的是拾色器：留在编辑态，选区先存下来，等颜色选完再把焦点要回来
    if (keepEditRef.current) {
      lastSelectionRef.current = {
        start: textareaRef.current?.selectionStart ?? 0,
        end: textareaRef.current?.selectionEnd ?? 0,
      };
      return;
    }
    exitTextEdit();
  };

  return { handleBlur, reportSelection };
}
