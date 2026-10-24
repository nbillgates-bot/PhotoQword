/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';

const store = () => useEditorStore.getState();

function newDoc(): string {
  store().createDoc({ name: '测试', width: 8, height: 8, background: 'white' });
  return store().layers[0].id;
}

beforeEach(() => {
  store().closeDoc();
});

/*
 * 缩略图只需要在像素真的变了以后重画。以前 updateLayer 无论改什么都 bumpRevision，
 * 而 revision 在 useThumbnail 的依赖里，于是点一下眼睛就把全部图层的缩略图
 * 重新 draw + toDataURL 一遍——图层多的时候就是这里卡住。
 * 所以拆出 pixelRevision：只有像素/蒙版真的换了才自增。
 */
describe('pixelRevision 只跟着像素走', () => {
  it('切换可见性不动像素，pixelRevision 不变，revision 要变', () => {
    const id = newDoc();
    const before = { pixel: store().pixelRevision, visual: store().revision };

    store().updateLayer(id, { visible: false });

    expect(store().pixelRevision).toBe(before.pixel);
    expect(store().revision).toBeGreaterThan(before.visual);
  });

  it('改不透明度、混合模式、名字、锁都不算像素变化', () => {
    const id = newDoc();
    const before = store().pixelRevision;

    store().updateLayer(id, { opacity: 50 });
    store().updateLayer(id, { blendMode: 'multiply' });
    store().updateLayer(id, { name: '改名' });
    store().updateLayer(id, { locked: true });

    expect(store().pixelRevision).toBe(before);
  });

  it('换画布算像素变化', () => {
    const id = newDoc();
    const before = store().pixelRevision;
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 8;
    ctx2d(canvas).fillRect(0, 0, 4, 4);

    store().updateLayer(id, { canvas });

    expect(store().pixelRevision).toBeGreaterThan(before);
  });

  it('换蒙版算像素变化', () => {
    const id = newDoc();
    store().addMask(id, 'reveal');
    const before = store().pixelRevision;
    const mask = document.createElement('canvas');
    mask.width = 8;
    mask.height = 8;

    store().updateLayer(id, { mask });

    expect(store().pixelRevision).toBeGreaterThan(before);
  });

  it('bumpRevision 两个都自增，就地改像素的调用点才不用改', () => {
    newDoc();
    const before = { pixel: store().pixelRevision, visual: store().revision };

    store().bumpRevision();

    expect(store().pixelRevision).toBeGreaterThan(before.pixel);
    expect(store().revision).toBeGreaterThan(before.visual);
  });
});
