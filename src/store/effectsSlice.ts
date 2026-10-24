/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore } from './types';
import type { EffectKind, LayerEffects } from '../types';
import { DEFAULT_EFFECTS } from '../types';

/**
 * 图层样式。
 *
 * 这些 action 都**不记历史**：对话框里拖滑块会连续调用它们做实时预览，
 * 每帧压一条历史会瞬间冲爆 HISTORY_LIMIT。确认时由对话框调 pushHistory 提交一次
 * （与 AdjustPanel 的做法一致，见规约 2.2）。
 */
export interface EffectsSlice {
  /** 整体替换图层样式。传 undefined 清空 */
  setLayerEffects: (id: string, effects: LayerEffects | undefined) => void;
  /**
   * 勾选/取消某个效果。
   * 第一次勾选时用 PS 默认值初始化；取消只置 enabled=false，
   * 参数留着，这样再勾回来用户之前调的值还在（与 PS 一致）。
   */
  toggleEffect: (id: string, kind: EffectKind, enabled: boolean) => void;
  /**
   * 改某个效果的部分参数。
   * 效果还没配置过时按默认值补齐后再套用改动，但不会顺带启用它。
   */
  updateEffect: (id: string, kind: EffectKind, patch: Record<string, unknown>) => void;
}

/**
 * 改某图层的 effects，并推进 revision。
 *
 * 走替换而不是就地改：canvas 之外的属性变化要让 zustand 的浅比较看见，
 * 否则图层面板与画布都不刷新。
 */
function patchEffects(
  get: () => EditorStore,
  set: (partial: Partial<EditorStore>) => void,
  id: string,
  next: (current: LayerEffects) => LayerEffects | undefined,
): void {
  const { layers } = get();
  const index = layers.findIndex((layer) => layer.id === id);
  if (index < 0) return;

  const updated = [...layers];
  updated[index] = { ...updated[index], effects: next(updated[index].effects ?? {}) };
  set({ layers: updated });
  get().bumpRevision();
}

export const createEffectsSlice: StateCreator<EditorStore, [], [], EffectsSlice> = (set, get) => ({
  setLayerEffects: (id, effects) => {
    patchEffects(get, set, id, () => effects);
  },

  toggleEffect: (id, kind, enabled) => {
    patchEffects(get, set, id, (current) => {
      const existing = current[kind];
      return {
        ...current,
        // 没配置过就拿默认值起头，否则只翻 enabled 保住已调的参数
        [kind]: existing ? { ...existing, enabled } : { ...DEFAULT_EFFECTS[kind], enabled },
      };
    });
  },

  updateEffect: (id, kind, patch) => {
    patchEffects(get, set, id, (current) => {
      const existing = current[kind];
      if (existing) return { ...current, [kind]: { ...existing, ...patch } };
      /*
       * 没配置过也要能改：PS 的参数面板对未勾选的效果同样可编辑，
       * 调完再勾上，调过的值还在。
       * 但改参数本身不等于启用，所以 enabled 强制为 false，
       * 盖掉 DEFAULT_EFFECTS 里的 true。
       */
      return { ...current, [kind]: { ...DEFAULT_EFFECTS[kind], ...patch, enabled: false } };
    });
  },
});
