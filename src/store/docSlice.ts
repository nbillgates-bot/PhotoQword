/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { DocSlice, EditorStore } from './types';
import type { Layer } from '../types';
import {
  createReadbackCanvas,
  cropCanvas,
  ctx2d,
  fillCanvas,
  recanvas,
  resizeCanvas,
  uid,
} from '../engine/canvasUtils';
import { checkCanvasSize } from '../engine/canvasLimits';
import { isPsdFileName } from '../engine/psdNaming';
import { AppError } from '../engine/appError';
import { backgroundLayerName, unnamedLayerName } from '../i18n/defaultNames';
import { errorToToast, sizeCheckToast } from '../i18n/errorMessage';
import {
  contentRect,
  coversDoc,
  docRect,
  translateBounds,
  unionRect,
  withCanvas,
} from '../engine/layerBounds';
import { remapGuidesAfterCrop } from '../engine/guides';
import { resetHistoryShadows } from './historySlice';
import { makeLayer } from './layerSlice';

/** 读取文件为 HTMLImageElement */
export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      // 用户能靠换个文件避免，走带 key 的错误让 UI 翻译
      reject(new AppError('error.image.decodeFailed'));
    };
    image.src = url;
  });
}

/** 九宫格锚点 -> 偏移量 */
function anchorOffset(
  anchor: string,
  oldSize: number,
  newSize: number,
  startKey: string,
  endKey: string,
): number {
  if (anchor.includes(startKey)) return 0;
  if (anchor.includes(endKey)) return newSize - oldSize;
  return Math.round((newSize - oldSize) / 2);
}

/** zustand 给 slice 的那两个函数，抽出来给 openPsd 用 */
type DocSet = Parameters<StateCreator<EditorStore, [], [], DocSlice>>[0];
type DocGet = Parameters<StateCreator<EditorStore, [], [], DocSlice>>[1];

/**
 * 打开 PSD。单独一个函数是因为它比别的分支复杂得多：
 * 要报进度、要能取消、要区分「取消」和「真出错」。
 */
async function openPsd(file: File, set: DocSet, get: DocGet): Promise<void> {
  /*
   * 动态 import：ag-psd 约 287 kB，只在真的开 PSD 时才下载这段代码。
   * 判断扩展名的 isPsdFileName 来自 psdNaming（不依赖 ag-psd），
   * 否则静态引用会把整个库拖回主包。
   */
  const controller = new AbortController();
  get().beginProgress({
    titleKey: 'progress.open',
    labelKey: 'progress.preparing',
    // 代码块还没下载完，这段时间进度未知
    ratio: null,
    cancel: () => controller.abort(),
  });

  try {
    const { readPsdFile } = await import('../engine/psdIO');
    const { doc, layers } = await readPsdFile(file, {
      signal: controller.signal,
      onProgress: ({ ratio, labelKey, labelParams }) =>
        get().updateProgress({ ratio, labelKey, labelParams }),
      backgroundName: backgroundLayerName(get().locale),
      fallbackLayerName: unnamedLayerName(get().locale),
    });
    set({
      doc,
      layers,
      activeLayerId: layers[layers.length - 1]?.id ?? null,
      selectedLayerIds: layers.length > 0 ? [layers[layers.length - 1].id] : [],
      soloLayerId: null,
      selection: null,
      history: [],
      historyIndex: -1,
      dirty: false,
      // 新文档还没有关联文件，「存储」要退化成「存储为」。
      // 打开文件的路径会在读完之后再把句柄补上（见 useSaveFile.rememberOpened）
      saveTarget: null,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    /*
     * 从这里到 bumpRevision 是全程唯一一段「不可让出」的同步代码，
     * 用户看到的「进度条走到 287/287 之后还要卡一下」就发生在这里加上
     * 随后的 React 提交。超过一帧就打点，好把「还慢在哪」定位到具体一步。
     */
    const t0 = performance.now();
    get().pushHistory('action.openPSD');
    const t1 = performance.now();
    get().bumpRevision();
    const t2 = performance.now();
    if (t2 - t0 > 16) {
      console.log(
        `[openPsd] 尾段同步: pushHistory=${(t1 - t0).toFixed(1)}ms, ` +
          `bumpRevision=${(t2 - t1).toFixed(1)}ms, layers=${layers.length}`,
      );
    }
  } catch (err) {
    /*
     * 用户自己点的取消不是错误，不弹红条。
     * 认名字而不是 instanceof：ReadCancelled 定义在动态 import 的那半边，
     * 为了判类型把它静态 import 进来，就把 ag-psd 一起拖回主包了。
     */
    if (err instanceof Error && err.name === 'ReadCancelled') {
      get().showToast('toast.openCancelled');
    } else {
      const { key, params, paramKeys } = errorToToast(err, 'error.psd.openFailed');
      get().showToast(key, 'error', params, paramKeys);
    }
  } finally {
    // 成功、失败、取消都要收摊，否则进度窗永远盖在界面上
    get().endProgress();
  }
}

export const createDocSlice: StateCreator<EditorStore, [], [], DocSlice> = (set, get) => ({
  doc: null,
  revision: 0,
  pixelRevision: 0,
  dirty: false,

  /*
   * 默认两个一起自增：绝大多数调用点是「就地改了画布再通知界面」，
   * 少刷缩略图会留下旧图。想省缩略图那一份开销要显式走 bumpVisualRevision。
   */
  bumpRevision: () =>
    set((state) => ({ revision: state.revision + 1, pixelRevision: state.pixelRevision + 1 })),

  bumpVisualRevision: () => set((state) => ({ revision: state.revision + 1 })),

  createDoc: ({ name, width, height, background, resolution = 72 }) => {
    // UI 的 max 属性挡不住程序调用，store 层再校一遍
    const check = checkCanvasSize(width, height);
    if (!check.ok) {
      const m = sizeCheckToast(check, 'error.doc.cannotCreate');
      get().showToast(m.key, 'error', m.params, m.paramKeys);
      return;
    }
    const layer = makeLayer(width, height, backgroundLayerName(get().locale));
    if (background !== 'transparent') {
      fillCanvas(layer.canvas, background === 'white' ? '#ffffff' : background);
    }
    set({
      doc: { id: uid('doc'), name, width, height, resolution },
      layers: [layer],
      activeLayerId: layer.id,
      selectedLayerIds: [layer.id],
      soloLayerId: null,
      selection: null,
      history: [],
      historyIndex: -1,
      dirty: false,
      // 新文档还没有关联文件，「存储」要退化成「存储为」。
      // 打开文件的路径会在读完之后再把句柄补上（见 useSaveFile.rememberOpened）
      saveTarget: null,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    get().pushHistory('action.newDoc');
    get().bumpRevision();
  },

  openImageFile: async (file) => {
    // PSD / PSB 文件走专门的读取逻辑
    if (isPsdFileName(file.name)) {
      await openPsd(file, set, get);
      return;
    }

    // 普通图片文件（PNG / JPG / ...）按原来的路径处理
    const image = await loadImageFile(file);
    /*
     * 必须在建画布之前校验：超限时浏览器给的是一张空白画布，
     * 不抛异常也不告警，用户只看到全白，控制台干净，是最难查的一类失败。
     */
    const check = checkCanvasSize(image.naturalWidth, image.naturalHeight);
    if (!check.ok) {
      const m = sizeCheckToast(check, 'error.image.cannotOpen');
      get().showToast(m.key, 'error', m.params, m.paramKeys);
      return;
    }
    const layer = makeLayer(
      image.naturalWidth,
      image.naturalHeight,
      backgroundLayerName(get().locale),
    );
    ctx2d(layer.canvas).drawImage(image, 0, 0);
    set({
      doc: {
        id: uid('doc'),
        name: file.name.replace(/\.[^.]+$/, ''),
        width: image.naturalWidth,
        height: image.naturalHeight,
        resolution: 72,
      },
      layers: [layer],
      activeLayerId: layer.id,
      selectedLayerIds: [layer.id],
      soloLayerId: null,
      selection: null,
      history: [],
      historyIndex: -1,
      dirty: false,
      // 新文档还没有关联文件，「存储」要退化成「存储为」。
      // 打开文件的路径会在读完之后再把句柄补上（见 useSaveFile.rememberOpened）
      saveTarget: null,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    get().pushHistory('action.openImage');
    get().bumpRevision();
  },

  /** 把图片作为新图层置入当前文档，超出画布时等比缩小 */
  placeImageFile: async (file) => {
    const { doc } = get();
    if (!doc) {
      await get().openImageFile(file);
      return;
    }
    const image = await loadImageFile(file);
    const scale = Math.min(1, doc.width / image.naturalWidth, doc.height / image.naturalHeight);
    const w = image.naturalWidth * scale;
    const h = image.naturalHeight * scale;
    const layer = makeLayer(doc.width, doc.height, file.name.replace(/\.[^.]+$/, ''));
    ctx2d(layer.canvas).drawImage(image, (doc.width - w) / 2, (doc.height - h) / 2, w, h);
    set({ layers: [...get().layers, layer], activeLayerId: layer.id });
    get().pushHistory('action.placeImage');
    get().bumpRevision();
  },

  closeDoc: () => {
    // 影子副本占一份全量像素，关文档时必须放掉，否则一直挂着已关闭文档的内存
    resetHistoryShadows();
    set({
      doc: null,
      layers: [],
      activeLayerId: null,
      selectedLayerIds: [],
      soloLayerId: null,
      selection: null,
      history: [],
      historyIndex: -1,
      dirty: false,
      saveTarget: null,
      // 文字编辑状态跟着文档走，留着会指向已经不存在的图层
      editingTextLayer: null,
      textDragRect: null,
    });
  },

  renameDoc: (name) => {
    const { doc } = get();
    if (!doc) return;
    set({ doc: { ...doc, name } });
  },

  resizeImage: (width, height, smooth = true) => {
    const { doc, layers } = get();
    if (!doc) return;
    const check = checkCanvasSize(width, height);
    if (!check.ok) {
      const m = sizeCheckToast(check, 'error.doc.cannotResizeImage');
      get().showToast(m.key, 'error', m.params, m.paramKeys);
      return;
    }
    const next: Layer[] = layers.map((layer) =>
      withCanvas(layer, resizeCanvas(layer.canvas, width, height, smooth), 0, 0),
    );
    set({ doc: { ...doc, width, height }, layers: next, selection: null });
    get().pushHistory('action.imageSize');
    get().bumpRevision();
  },

  resizeCanvasTo: (width, height, anchor) => {
    const { doc, layers } = get();
    if (!doc) return;
    const check = checkCanvasSize(width, height);
    if (!check.ok) {
      const m = sizeCheckToast(check, 'error.doc.cannotResizeCanvas');
      get().showToast(m.key, 'error', m.params, m.paramKeys);
      return;
    }
    const dx = anchorOffset(anchor, doc.width, width, 'left', 'right');
    const dy = anchorOffset(anchor, doc.height, height, 'top', 'bottom');
    const next: Layer[] = layers.map((layer) =>
      withCanvas(layer, recanvas(layer.canvas, width, height, dx, dy), 0, 0),
    );
    set({ doc: { ...doc, width, height }, layers: next, selection: null });
    get().pushHistory('action.canvasSize');
    get().bumpRevision();
  },

  /**
   * 显示全部（PS：图像 > 显示全部）。
   * 把画布扩到刚好装下所有图层的内容，被移出画布的部分因此重新可见。
   *
   * 有了 bounds 之后这里一个像素都不用重画：算出并集，改文档尺寸，
   * 再把每个图层的位置平移 -union.x/-union.y 即可。像素本来就没丢过，
   * 只是之前落在文档范围之外看不见。
   */
  revealAll: () => {
    const { doc, layers } = get();
    if (!doc) return;

    let union = docRect(doc.width, doc.height);
    for (const layer of layers) {
      // 组没有自己的像素（画布是 1×1 占位），不参与
      if (layer.type === 'group') continue;
      const rect = contentRect(layer);
      if (rect) union = unionRect(union, rect);
    }

    if (coversDoc(union, doc.width, doc.height)) {
      get().showToast('toast.allLayersInsideCanvas');
      return;
    }

    const check = checkCanvasSize(union.width, union.height);
    if (!check.ok) {
      const m = sizeCheckToast(check, 'error.doc.cannotRevealAll');
      get().showToast(m.key, 'error', m.params, m.paramKeys);
      return;
    }

    set({
      doc: { ...doc, width: union.width, height: union.height },
      layers: layers.map((layer) => ({
        ...layer,
        bounds: translateBounds(layer.bounds, -union.x, -union.y),
      })),
      selection: null,
    });
    get().pushHistory('action.revealAll');
    get().bumpRevision();
  },

  cropTo: (rect) => {
    const { doc, layers } = get();
    if (!doc || rect.width < 1 || rect.height < 1) return;
    // 裁剪前先写历史，否则记录的是裁剪后的尺寸
    get().pushHistory('action.crop');
    const next: Layer[] = layers.map((layer) =>
      withCanvas(layer, cropCanvas(layer.canvas, rect), 0, 0),
    );
    set({
      doc: { ...doc, width: Math.round(rect.width), height: Math.round(rect.height) },
      layers: next,
      selection: null,
      // 参考线钉在图像上：原点挪了，线要跟着挪，裁掉的区域上的线丢弃
      guides: remapGuidesAfterCrop(get().guides, rect),
    });
    get().bumpRevision();
  },

  rotateDoc: (degrees) => {
    const { doc, layers } = get();
    if (!doc) return;
    const swap = degrees === 90 || degrees === 270;
    const width = swap ? doc.height : doc.width;
    const height = swap ? doc.width : doc.height;
    const next: Layer[] = layers.map((layer) => {
      const target = createReadbackCanvas(width, height);
      const context = ctx2d(target);
      context.translate(width / 2, height / 2);
      context.rotate((degrees * Math.PI) / 180);
      context.drawImage(layer.canvas, -doc.width / 2, -doc.height / 2);
      return withCanvas(layer, target, 0, 0);
    });
    set({ doc: { ...doc, width, height }, layers: next, selection: null });
    get().pushHistory('action.rotate', { labelParams: { degrees } });
    get().bumpRevision();
  },

  flipDoc: (axis) => {
    const { doc, layers } = get();
    if (!doc) return;
    const next: Layer[] = layers.map((layer) => {
      const target = createReadbackCanvas(doc.width, doc.height);
      const context = ctx2d(target);
      if (axis === 'horizontal') {
        context.translate(doc.width, 0);
        context.scale(-1, 1);
      } else {
        context.translate(0, doc.height);
        context.scale(1, -1);
      }
      context.drawImage(layer.canvas, 0, 0);
      return withCanvas(layer, target, 0, 0);
    });
    set({ layers: next, selection: null });
    get().pushHistory(axis === 'horizontal' ? 'action.flipH' : 'action.flipV');
    get().bumpRevision();
  },
});
