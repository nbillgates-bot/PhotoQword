/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, OverlaySlice } from './types';
import { cloneCanvas, createCanvas, ctx2d } from '../engine/canvasUtils';
import { invalidateMask } from '../engine/mask';
import { clipToAlpha } from '../engine/clipping';

/** 把 source 裁到 shape 的不透明区域内，返回新画布（不动 source） */
function clipTo(source: HTMLCanvasElement, shape: HTMLCanvasElement): HTMLCanvasElement {
  const output = createCanvas(source.width, source.height);
  const context = ctx2d(output);
  context.drawImage(source, 0, 0);
  context.globalCompositeOperation = 'destination-in';
  context.drawImage(shape, 0, 0);
  return output;
}

export const createOverlaySlice: StateCreator<EditorStore, [], [], OverlaySlice> = (set, get) => ({
  overlay: null,

  beginOverlay: (config) => {
    const { doc } = get();
    if (!doc) return null;
    const canvas = createCanvas(doc.width, doc.height);
    set({ overlay: { ...config, canvas } });
    return canvas;
  },

  commitOverlay: (label) => {
    const { overlay, selection } = get();
    if (!overlay) return;
    /*
     * 缓冲是文档尺寸、文档坐标的，图层画布却可能偏出去（被移动过）。
     * 先把图层撑到覆盖整个文档，之后按 -bounds.x/y 平移合入即可对上。
     */
    const layer = get().expandLayerForEdit(overlay.targetLayerId);
    if (!layer) {
      set({ overlay: null });
      return;
    }
    // 画在蒙版上时目标画布是蒙版；蒙版中途被删掉就放弃这一笔
    const destination = overlay.target === 'mask' ? layer.mask : layer.canvas;
    if (!destination) {
      set({ overlay: null });
      get().bumpRevision();
      return;
    }

    let source = overlay.canvas;
    // 有选区时，先把缓冲裁到选区内再合入
    if (overlay.clipToSelection && selection) source = clipTo(source, selection.mask);

    /*
     * 锁定透明像素：记下图层原有的 alpha，合入之后逐像素还原回去。
     *
     * 锁住的是 alpha 本身，不是「只在不透明处生效」。区别在半透明像素上：
     * 相乘的做法会让 alpha 128 的像素画一笔变 192、画几笔就实心，
     * 抗锯齿边缘会越画越硬——而 PS 里锁着透明像素重涂颜色，柔边始终不变，
     * 这正是它被当作重新上色标准做法的原因。所以必须是赋值而不是相乘。
     *
     * 代价是橡皮擦在这个锁下擦不动（alpha 会被还原）。PS 的措辞
     * 「将编辑限制在不透明区域」在橡皮上是否也这样，我不确定，按
     * 「锁住 alpha」这个字面语义实现，与柔边不变的表现自洽。
     *
     * 蒙版不受这个锁影响——锁的是图层像素，蒙版是另一张画布。
     */
    const alphaGuard =
      overlay.target !== 'mask' && layer.lockTransparent ? cloneCanvas(destination) : null;

    const context = ctx2d(destination);
    context.save();
    context.globalAlpha = overlay.opacity / 100;
    context.globalCompositeOperation = overlay.operation;
    // 蒙版是文档坐标系的，不跟着图层偏移走；图层像素要减掉 bounds 的偏移
    if (overlay.target === 'mask') {
      context.drawImage(source, 0, 0);
    } else {
      context.drawImage(source, -layer.bounds.x, -layer.bounds.y);
    }
    context.restore();
    if (alphaGuard) clipToAlpha(destination, alphaGuard);
    if (overlay.target === 'mask') invalidateMask(destination);

    set({ overlay: null });
    // 描边只可能落在目标图层上，点名它可以省掉其余图层的整幅 getImageData
    get().pushHistory(label, { layerIds: [layer.id] });
    get().bumpRevision();
  },

  cancelOverlay: () => {
    set({ overlay: null });
    get().bumpRevision();
  },
});
