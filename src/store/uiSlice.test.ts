/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './index';
import { translatorFor } from '../i18n/translate';

/**
 * 进度状态的用例。
 *
 * 这块的坑全在时序上：解码是异步的，最后一次 onProgress 完全可能排在
 * endProgress 之后才到。所以「任务结束后再更新」必须是空操作，
 * 否则进度窗被重新打开，而那时已经没有人会去关它了。
 */
describe('uiSlice 进度状态', () => {
  beforeEach(() => {
    useEditorStore.getState().endProgress();
  });

  it('初始没有进度任务', () => {
    expect(useEditorStore.getState().progress).toBeNull();
  });

  it('beginProgress 原样存下传入的任务', () => {
    const cancel = vi.fn();
    useEditorStore.getState().beginProgress({
      titleKey: 'progress.open',
      labelKey: 'progress.preparing',
      ratio: null,
      cancel,
    });
    const progress = useEditorStore.getState().progress;
    expect(progress?.titleKey).toBe('progress.open');
    expect(progress?.labelKey).toBe('progress.preparing');
    expect(progress?.ratio).toBeNull();
    expect(progress?.cancel).toBe(cancel);
  });

  it('不传 cancel 表示这次任务不能取消', () => {
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.readingFile', ratio: 0 });
    expect(useEditorStore.getState().progress?.cancel).toBeUndefined();
  });

  it('updateProgress 只改传进来的字段，其余保持不变', () => {
    const cancel = vi.fn();
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.readingFile', ratio: 0, cancel });
    useEditorStore.getState().updateProgress({ ratio: 0.5, labelKey: 'progress.psd.decodingLayers', labelParams: { done: 1, total: 2 } });
    const progress = useEditorStore.getState().progress;
    // 标题和 cancel 没传，不该被 patch 掉
    expect(progress?.titleKey).toBe('progress.open');
    expect(progress?.cancel).toBe(cancel);
    expect(progress?.ratio).toBe(0.5);
    expect(progress?.labelKey).toBe('progress.psd.decodingLayers');
  });

  /*
   * 进度窗存的是词条 key（I18N.md §2.2），所以必须验两件事：
   * key 真的在词条表里，占位符也真的被填上。
   * 少了这一条，界面上会显示 'progress.psd.decodingLayers' 或者
   * 「正在解码图层 {done}/{total}…」——都不报错，只是看着不对。
   */
  it('存的 key 与参数能翻成完整句子，两种语言都不残留占位符', () => {
    useEditorStore.getState().beginProgress({
      titleKey: 'progress.open',
      labelKey: 'progress.psd.decodingLayers',
      labelParams: { done: 3, total: 12 },
      ratio: 0.4,
    });
    const progress = useEditorStore.getState().progress!;
    for (const locale of ['zh-CN', 'en'] as const) {
      const t = translatorFor(locale);
      const title = t(progress.titleKey);
      const label = t(progress.labelKey, progress.labelParams);
      // 翻不出来时 translate 会把 key 原样吐回，据此判断词条是否存在
      expect(title).not.toBe(progress.titleKey);
      expect(label).not.toBe(progress.labelKey);
      expect(label).not.toContain('{');
      expect(label).toContain('3');
      expect(label).toContain('12');
    }
  });

  it('ratio 从未知变成已知，进度条从循环动画切成确定值', () => {
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.preparing', ratio: null });
    useEditorStore.getState().updateProgress({ ratio: 0.2 });
    expect(useEditorStore.getState().progress?.ratio).toBe(0.2);
  });

  it('endProgress 收摊', () => {
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.readingFile', ratio: 0.3 });
    useEditorStore.getState().endProgress();
    expect(useEditorStore.getState().progress).toBeNull();
  });

  /*
   * 这条是这组用例的主角。迟到的 onProgress 不能把关掉的进度窗开回来——
   * 一旦开回来，界面上就永久盖着一个谁都关不掉的遮罩。
   */
  it('任务结束后迟到的更新是空操作，不会把进度窗开回来', () => {
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.psd.decodingImage', ratio: 0.9 });
    useEditorStore.getState().endProgress();
    useEditorStore.getState().updateProgress({ ratio: 1, labelKey: 'progress.openDone' });
    expect(useEditorStore.getState().progress).toBeNull();
  });

  it('没有任务时直接 updateProgress 也不会凭空造出一个进度窗', () => {
    useEditorStore.getState().updateProgress({ ratio: 0.5, labelKey: 'progress.readingFile' });
    expect(useEditorStore.getState().progress).toBeNull();
  });

  it('endProgress 可以重复调用', () => {
    useEditorStore.getState().beginProgress({ titleKey: 'progress.open', labelKey: 'progress.readingFile', ratio: 0 });
    useEditorStore.getState().endProgress();
    useEditorStore.getState().endProgress();
    expect(useEditorStore.getState().progress).toBeNull();
  });

  it('前一个任务没收摊就开下一个，新任务完整覆盖旧任务', () => {
    const oldCancel = vi.fn();
    useEditorStore.getState().beginProgress({
      titleKey: 'progress.open', labelKey: 'progress.readingFile', ratio: 0.5, cancel: oldCancel,
    });
    useEditorStore.getState().beginProgress({ titleKey: 'progress.save', labelKey: 'progress.writing', ratio: null });
    const progress = useEditorStore.getState().progress;
    expect(progress?.titleKey).toBe('progress.save');
    expect(progress?.ratio).toBeNull();
    // 旧任务的 cancel 必须一起没掉，否则点取消取消的是上一个任务
    expect(progress?.cancel).toBeUndefined();
    expect(oldCancel).not.toHaveBeenCalled();
  });
});
