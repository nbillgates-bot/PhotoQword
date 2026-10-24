/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect } from 'react';
import { useEditorStore } from '../store';
import { SHORTCUT_MAP } from '../components/toolbar/toolDefs';
import { resolveShortcutKey } from './shortcutKeys';
import { ungroupTarget } from '../engine/layerTree';

/** 输入框里按键不该触发编辑器快捷键 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

interface ShortcutOptions {
  onPickFile: (mode: 'open' | 'place') => void;
  onSave: () => void;
  onSaveAs: () => void;
  getViewport: () => { width: number; height: number };
}

/**
 * 全局快捷键。
 * 单字母切工具，Ctrl 组合走命令；同一字母有多个工具时循环切换（和 Photoshop 一致）。
 */
export function useShortcuts({
  onPickFile,
  onSave,
  onSaveAs,
  getViewport,
}: ShortcutOptions): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const store = useEditorStore.getState();
      /*
       * 这里刻意不检查 event.isComposing。焦点已经排除了输入框，
       * 此时的"合成中"是输入法在画布上空转，用户的本意就是按快捷键。
       * 若在这里 return，开着中文输入法的用户所有字母快捷键都会失效。
       */
      const key = resolveShortcutKey(event);
      if (!key) return;
      const mod = event.ctrlKey || event.metaKey;

      if (mod) {
        switch (key) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) store.redo();
            else store.undo();
            return;
          case 'y':
            event.preventDefault();
            store.redo();
            return;
          case 'a':
            event.preventDefault();
            store.selectAllPixels();
            return;
          case 'g': {
            // Ctrl+G 编组，Ctrl+Shift+G 取消编组，Ctrl+Alt+G 剪贴蒙版，与 PS 一致
            event.preventDefault();
            if (!store.activeLayerId) return;
            if (event.altKey) {
              store.toggleClipped();
              return;
            }
            if (!event.shiftKey) {
              // 多选时把整个选中集合打成一组
              store.groupSelectedLayers();
              return;
            }
            const target = ungroupTarget(store.layers, store.activeLayerId);
            if (target) store.ungroup(target);
            return;
          }
          case 'd':
            event.preventDefault();
            store.deselect();
            return;
          case 'i':
            // PS：Ctrl+I 反相图像，Ctrl+Shift+I 反选。之前两者绑反了
            event.preventDefault();
            if (event.shiftKey) store.invertSelectionState();
            else store.invertActiveLayer();
            return;
          case 'c':
            event.preventDefault();
            store.copySelection();
            return;
          case 'x':
            event.preventDefault();
            store.cutSelection();
            return;
          case 'v':
            event.preventDefault();
            store.pasteClipboard();
            return;
          case 'j':
            // PS：Ctrl+J 通过拷贝的图层，Ctrl+Shift+J 通过剪切的图层
            event.preventDefault();
            if (!store.doc) return;
            if (event.shiftKey) store.layerViaCut();
            else store.layerViaCopy();
            return;
          case 'n':
            event.preventDefault();
            store.openDialog('new');
            return;
          case 'o':
            event.preventDefault();
            onPickFile('open');
            return;
          case 'e':
            event.preventDefault();
            if (store.doc) store.openDialog('export');
            return;
          case 's':
            /*
             * PS：Ctrl+S 存储，Ctrl+Shift+S 存储为。
             * 两个都要 preventDefault —— 不挡的话浏览器会弹「保存网页」。
             */
            event.preventDefault();
            if (!store.doc) return;
            if (event.shiftKey) onSaveAs();
            else onSave();
            return;
          case 'm':
            event.preventDefault();
            if (store.doc) store.openDialog('curves');
            return;
          case ';':
            // PS：Ctrl+; 显示/隐藏参考线
            event.preventDefault();
            if (store.doc) store.toggleGuides();
            return;
          case 'l':
            event.preventDefault();
            if (store.doc) store.openDialog('levels');
            return;
          case 't':
            // 自由变换：开会话并切到变换工具，与 PS 的 Ctrl+T 一致
            event.preventDefault();
            if (!store.doc) return;
            store.setTool('transform');
            store.beginTransform();
            return;
          case '0':
            event.preventDefault();
            store.fitToScreen(getViewport());
            return;
          case '1':
            event.preventDefault();
            store.actualPixels();
            return;
          case '=':
          case '+':
            event.preventDefault();
            store.zoomIn();
            return;
          case '-':
            event.preventDefault();
            store.zoomOut();
            return;
          default:
            return;
        }
      }

      if (event.altKey) return;

      if (key === 'delete' || key === 'backspace') {
        if (store.selection) {
          event.preventDefault();
          store.deleteSelectionPixels();
        }
        return;
      }

      // Enter 确认进行中的会话。裁剪和变换都靠它落刀，与 PS 一致
      if (key === 'enter') {
        if (store.transformSession) {
          event.preventDefault();
          store.commitTransform();
          return;
        }
        if (store.cropRect) {
          event.preventDefault();
          store.commitCrop();
          return;
        }
        return;
      }

      // Esc 的优先级：变换 > 裁剪 > 选区。先取消最"进行中"的那个
      if (key === 'escape') {
        if (store.transformSession) {
          store.cancelTransform();
          return;
        }
        if (store.cropRect) {
          store.cancelCrop();
          return;
        }
        if (store.selection) store.deselect();
        return;
      }

      // X 互换前后景色，D 恢复默认，这两个不是工具快捷键
      if (key === 'x') {
        store.swapColors();
        return;
      }
      if (key === 'd') {
        store.resetColors();
        return;
      }

      const tools = SHORTCUT_MAP[key];
      if (tools?.length) {
        event.preventDefault();
        // 同键多工具时按当前选中的往后循环
        const index = tools.indexOf(store.activeTool);
        store.setTool(tools[(index + 1) % tools.length]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onPickFile, onSave, onSaveAs, getViewport]);
}
