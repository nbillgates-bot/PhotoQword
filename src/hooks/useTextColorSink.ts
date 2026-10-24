/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 「改前景色时顺带把文字也染上」的共用逻辑。
 *
 * 工具栏的前景色块和文字选项栏的颜色块都要这个行为，抽出来免得两处各写一份
 * （规约 §1.1：重复出现两次就提取）。
 */

import { useCallback } from 'react';
import { useEditorStore } from '../store';

/**
 * 返回一个「设前景色」的回调：正在编辑文字时，同时把颜色套到文字上。
 *
 * PS 里文字颜色与前景色是联动的 —— 输入状态下改前景色，选中的字随即变色。
 * 这里照这个来。**这一条我不确定 PS 的细节**：PS 的前景色与文字色是不是
 * 双向同步（改文字色会不会反过来改前景色）我记不准，所以只做了单向 ——
 * 改前景色影响文字，改文字色不动前景色。交付说明里标出来待核对。
 *
 * 只在「真的进了文字编辑态」时才染色。仅仅选中了文字图层就染的话，
 * 用户为了接下来画笔要用而改前景色，会顺手把选中的文字层改掉，属于误伤。
 */
/**
 * 拾色器关闭后把焦点交还给文字编辑器。
 *
 * 确定和取消都要调：取消时（含按 Esc 关闭）如果不还焦点，编辑器还在编辑态
 * 但 textarea 没焦点，敲字没反应，用户只能再点一下文字才能继续。
 * 没在编辑文字时这是空操作 —— TextEditor 没挂载，没人听这个计数器。
 */
export function useTextFocusRestore(): () => void {
  return useEditorStore((state) => state.requestTextFocus);
}

export function useForegroundSink(): (color: string) => void {
  const setForeground = useEditorStore((state) => state.setForeground);
  const applyTextColor = useEditorStore((state) => state.applyTextColor);
  const editingTextLayer = useEditorStore((state) => state.editingTextLayer);

  return useCallback(
    (color: string) => {
      setForeground(color);
      if (editingTextLayer) applyTextColor(color);
    },
    [setForeground, applyTextColor, editingTextLayer],
  );
}
