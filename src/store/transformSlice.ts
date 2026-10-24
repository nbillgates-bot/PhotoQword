/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { StateCreator } from 'zustand';
import type { EditorStore, TransformSession, TransformSlice } from './types';
import type { Layer, Point, Selection } from '../types';
import {
  cloneCanvas,
  createCanvas,
  createReadbackCanvas,
  cropCanvas,
  ctx2d,
  clearCanvas,
} from '../engine/canvasUtils';
import { normalize } from '../engine/handleBox';
import { sizeCheckToast } from '../i18n/errorMessage';
import { transformBlockReason } from '../engine/layerLock';
import { checkCanvasSize } from '../engine/canvasLimits';
import { boundsFor, unionRect } from '../engine/layerBounds';
import { invalidateMask } from '../engine/mask';
import { createTransformState, type TransformState } from '../engine/transformBox';
import { transformSourceOf, transformSourceWithSelection } from '../engine/transformSource';
import { textBoxLocal } from '../engine/textBox';
import {
  drawTransformed,
  renderTransformed,
  renderTransformedTo,
  transformedBounds,
} from '../engine/transformRender';
import { maskBounds } from '../engine/selection';
import { pasteSelection } from '../engine/floatingSelection';
import { adoptFloat, commitFloat, getFloatPristine } from '../tools/moveTool';

/**
 * 自由变换会话（Ctrl+T）。
 *
 * 开启时冻住当前图层的一份快照 + 原始矩形，用户拖控制点改状态、
 * 每次移动都从快照按仿射矩阵重算结果盖回图层画布，Enter 确认、Esc 取消。
 * 支持缩放、旋转、斜切；不支持透视/扭曲（非仿射，canvas 2D 画不了）。
 */
/**
 * 确认时按变换结果重新给图层画布定尺寸，把出界的像素也装进来。
 *
 * 预览是画进原画布的，出界部分已被裁掉，所以这里不能拿预览的结果去搬，
 * 必须从 session.origin 重画一遍。
 */
function refitLayerCanvas(
  get: () => EditorStore,
  layer: Layer,
  session: TransformSession,
): void {
  const bounds = transformedBounds(session.state);
  const check = checkCanvasSize(bounds.width, bounds.height);
  if (!check.ok) {
    // 放大到画布撑不住的尺寸：保留预览裁过的结果（画面上看到的就是它），
    // 并明确告知，不能静默把用户的操作变成别的样子
    const m = sizeCheckToast(check, 'error.transform.clippedToCanvas');
    get().showToast(m.key, 'error', m.params, m.paramKeys);
    return;
  }

  const canvas = renderTransformedTo(session.origin, session.state, bounds);
  const mask = session.originMask
    ? renderTransformedTo(session.originMask, session.state, bounds)
    : undefined;
  if (mask) invalidateMask(mask);
  get().updateLayer(layer.id, {
    canvas,
    bounds: boundsFor(canvas, bounds.x, bounds.y),
    ...(mask ? { mask } : {}),
  });
  get().bumpRevision();
}

/** 选区变换确认后，交回浮动选区所需的材料 */
interface RefitResult {
  /** 只含背景的画布，与新图层画布同尺寸，可直接当 restorePristine 的入参 */
  pristine: HTMLCanvasElement;
  /** 变换后的那块像素，单独一张画布 */
  block: HTMLCanvasElement;
  /** block 左上角的文档坐标 */
  blockOrigin: Point;
}

/**
 * 选区变换的确认：新画布要同时装下「原位不动的背景」和「变换后的选区像素」。
 *
 * 与整层变换的区别在于背景不参与变换，所以尺寸取两者的并集，
 * 而不是只看 transformedBounds。
 *
 * 返回值供 commitTransform 把结果交回浮动选区，null 表示尺寸超限没改动。
 */
function refitLayerWithBackground(
  get: () => EditorStore,
  layer: Layer,
  session: TransformSession,
  background: HTMLCanvasElement,
): RefitResult | null {
  const moved = transformedBounds(session.state);
  const bounds = unionRect(layer.bounds, moved);
  const check = checkCanvasSize(bounds.width, bounds.height);
  if (!check.ok) {
    const m = sizeCheckToast(check, 'error.transform.clippedToCanvas');
    get().showToast(m.key, 'error', m.params, m.paramKeys);
    return null;
  }

  // 背景单独留一份：确认后要拿它当浮动选区的 pristine，所以尺寸得跟新画布一致
  const pristine = createCanvas(bounds.width, bounds.height);
  // 背景在图层原来的位置，换算到新画布坐标
  ctx2d(pristine).drawImage(background, layer.bounds.x - bounds.x, layer.bounds.y - bounds.y);

  // 这张会成为 layer.canvas，声明必须下在创建时
  const canvas = createReadbackCanvas(bounds.width, bounds.height);
  ctx2d(canvas).drawImage(pristine, 0, 0);
  drawTransformed(canvas, session.origin, session.state, bounds);

  get().updateLayer(layer.id, { canvas, bounds: boundsFor(canvas, bounds.x, bounds.y) });
  get().bumpRevision();

  return {
    pristine,
    block: renderTransformedTo(session.origin, session.state, moved),
    blockOrigin: { x: moved.x, y: moved.y },
  };
}

/**
 * 按同一个变换矩阵变换选区蒙版本身，让蚂蚁线跟着变换后的像素走。
 *
 * PS 里对选区内的像素做 Ctrl+T 确认之后，选区确实缩到了结果的形状上，
 * 而不是停在原来的位置。蒙版是文档尺寸的，变换后仍要裁回文档范围。
 */
function transformSelectionMask(
  get: () => EditorStore,
  session: TransformSession,
  before: Selection,
): void {
  const { doc } = get();
  if (!doc) return;
  // 蒙版是文档尺寸，origin 那一块对应 originalRect，所以先裁出选区那一块再变换
  const piece = cropCanvas(before.mask, {
    x: session.originalRect.x,
    y: session.originalRect.y,
    width: session.originalRect.width,
    height: session.originalRect.height,
  });
  // 变换后的选区蒙版和 buildSelection 那张地位一样，会被反复读
  const mask = createReadbackCanvas(doc.width, doc.height);
  drawTransformed(mask, piece, session.state, { x: 0, y: 0 });
  const bounds = maskBounds(mask);
  // 整块被变换到文档外时选区就没了，与 PS 里选区被移出画布的结果一致
  get().setSelection(bounds.width === 0 || bounds.height === 0 ? null : { mask, bounds });
}

export const createTransformSlice: StateCreator<EditorStore, [], [], TransformSlice> = (
  _set,
  get,
) => ({
  transformSession: null,
  transformAspectLocked: true, // 默认锁定宽高比，与 PS 一致

  beginTransform: () => {
    const active = get().activeLayer();
    if (!active) return;

    // 保存浮动选区的 pristine（如果存在），它记录了移动前的图层状态
    const floatPristine = getFloatPristine();
    const boundsBeforeCommit = floatPristine ? { ...active.bounds } : null;

    // 提交浮动选区：如果浮动块有偏移（用户拖动了但可能没抬手），先贴回图层
    commitFloat((block, targetX, targetY) => {
      const layer = get().layers.find((l) => l.id === active.id);
      if (layer) {
        pasteSelection(layer.canvas, block, targetX, targetY, layer.bounds);
        get().bumpRevision();
      }
    });

    // 重新获取 layer，因为 commitFloat 可能修改了它
    const layer = get().layers.find((l) => l.id === active.id);
    if (!layer) return;
    // 变换既改像素也改位置，两种锁都得挡
    const blocked = transformBlockReason(layer);
    if (blocked) {
      get().showToast(blocked, 'error');
      return;
    }

    // 变换在文档坐标系里操作（变换框画在文档上），先让画布覆盖住文档
    const expandedLayer = get().expandLayerForEdit(layer.id);
    if (!expandedLayer) return;
    /*
     * 有选区且是纯像素层时只变换选区内的像素，与 PS 一致。
     * 文字/形状层不走这条：PS 里对矢量层的局部变换要先栅格化，
     * 我们不在这里替用户做栅格化这个不可逆的决定，退回整层变换。
     */
    const selection = get().selection;
    const vector = Boolean(expandedLayer.textData || expandedLayer.shapeData);
    if (selection && !vector) {
      /*
       * 有选区时只变换选区内的像素。
       * 如果有 floatPristine（用户先移动了选区），使用它作为背景基础。
       * pristine 保留了移动前的图层状态（原位空 + 其他位置是移动前的状态），
       * 需要扩展到和当前图层同尺寸后再传给 transformSourceWithSelection。
       */
      let pristineExpanded: HTMLCanvasElement | undefined;
      if (floatPristine && boundsBeforeCommit) {
        // 扩展 pristine 到和当前图层同尺寸
        pristineExpanded = createCanvas(expandedLayer.canvas.width, expandedLayer.canvas.height);
        const offsetX = boundsBeforeCommit.x - expandedLayer.bounds.x;
        const offsetY = boundsBeforeCommit.y - expandedLayer.bounds.y;
        ctx2d(pristineExpanded).drawImage(floatPristine, offsetX, offsetY);
      }

      const source = pristineExpanded
        ? transformSourceWithSelection(expandedLayer.canvas, expandedLayer.bounds, expandedLayer.mask, selection, pristineExpanded)
        : transformSourceWithSelection(expandedLayer.canvas, expandedLayer.bounds, expandedLayer.mask, selection);

      _set({
        transformSession: {
          layerId: expandedLayer.id,
          origin: source.origin,
          originMask: source.originMask,
          maskBefore: expandedLayer.mask ? cloneCanvas(expandedLayer.mask) : undefined,
          originalRect: source.rect,
          state: createTransformState({ ...source.rect }),
          background: source.background,
          canvasBefore: cloneCanvas(expandedLayer.canvas),
          selectionBefore: selection,
        },
      });
      return;
    }

    /*
     * 框贴着图层内容而不是整张画布，与 PS 一致。
     * rect 在文档坐标系里（框画在文档上），applyTransformPreview 再减回去换算到画布坐标。
     * 蒙版跟着图层一起变换（PS 里蒙版默认与图层链接），所以它也要有自己的快照，
     * 否则第二帧就是在已变换的结果上再变换。
     */
    /*
     * 文字层的框贴文字外框，不贴墨迹：PS 里对文字层按 Ctrl+T，框就是那个
     * 定界框——段落文本是拖出来的那个矩形，点文本是行盒外接框。贴墨迹的话
     * 一段没写满的段落文本，框会缩到只包住写了字的那几行，跟编辑态的框对不上。
     */
    const preferRect = expandedLayer.textData
      ? textBoxLocal(expandedLayer.textData, expandedLayer.bounds)
      : undefined;
    const { rect, origin, originMask } = transformSourceOf(
      expandedLayer.canvas,
      expandedLayer.bounds,
      expandedLayer.mask,
      preferRect,
    );
    _set({
      transformSession: {
        layerId: expandedLayer.id,
        origin,
        originMask,
        maskBefore: expandedLayer.mask ? cloneCanvas(expandedLayer.mask) : undefined,
        originalRect: rect,
        state: createTransformState({ ...rect }),
      },
    });
  },

  updateTransform: (state: TransformState) => {
    const session = get().transformSession;
    if (!session) return;
    _set({ transformSession: { ...session, state } });
    get().applyTransformPreview();
  },

  applyTransformPreview: () => {
    const session = get().transformSession;
    if (!session) return;
    const layer = get().layers.find((item) => item.id === session.layerId);
    if (!layer) return;

    /*
     * 预览只画进现有画布，出界部分会被裁掉——但拖动过程中出界的地方本来
     * 也看不见，而每帧换一张新画布代价太高（要重新分配 + 触发 React 更新）。
     * 真正要紧的是确认那一刻不能丢像素，那一步在 commitTransform 里重新定尺寸。
     */
    if (session.background) {
      // 选区变换：先原位铺挖空后的背景，再把变换结果叠上去
      clearCanvas(layer.canvas);
      ctx2d(layer.canvas).drawImage(session.background, 0, 0);
      drawTransformed(layer.canvas, session.origin, session.state, layer.bounds);
    } else {
      renderTransformed(layer.canvas, session.origin, session.state, layer.bounds);
    }
    /*
     * 图层蒙版只在整层变换时跟着动。选区变换动的是「图层里被选中的那部分像素」，
     * 图层蒙版是另一套遮挡关系，PS 里也不会因为变换选区内的像素就把蒙版一起挪走。
     */
    if (!session.background && layer.mask && session.originMask) {
      renderTransformed(layer.mask, session.originMask, session.state, layer.bounds);
      invalidateMask(layer.mask);
    }
    get().bumpRevision();
  },

  commitTransform: () => {
    const session = get().transformSession;
    if (!session) return;
    _set({ transformSession: null });
    // PS 的行为：确认变换后自动切回之前的工具
    get().setTool(get().previousTool);
    const layer = get().layers.find((item) => item.id === session.layerId);
    if (!layer) return;

    const { state } = session;

    /*
     * 选区变换独立一条路径：背景不参与变换，所以画布尺寸取并集重算；
     * 选区蒙版本身也要跟着变换，蚂蚁线才落在结果上。
     * 矢量数据同步不用管——beginTransform 已经把矢量层挡在这条路径之外了。
     */
    if (session.background) {
      const refit = refitLayerWithBackground(get, layer, session, session.background);
      if (session.selectionBefore) transformSelectionMask(get, session, session.selectionBefore);
      get().pushHistory('action.freeTransform');
      /*
       * 把结果交回浮动选区。不做这一步的话，用户接着拖动会重新 extractSelection，
       * 把这块像素连同它底下刚保住的原始背景一起剪走 —— 背景第二次被挖空。
       * pristine 只含背景，与新画布同尺寸，正好是 restorePristine 要的形状。
       */
      const selectionAfter = get().selection;
      if (refit && selectionAfter) {
        adoptFloat({
          layerId: layer.id,
          block: refit.block,
          pristine: refit.pristine,
          origin: refit.blockOrigin,
          selection: selectionAfter,
          revision: get().revision,
        });
      }
      return;
    }

    refitLayerCanvas(get, layer, session);

    /*
     * 旋转和斜切没法塞进 textData / shapeData——这两个模型只有位置和尺寸，
     * 没有角度字段。硬存一个缩放值会让下次编辑文字时按未旋转的样子重绘，
     * 把用户的变换悄悄丢掉。所以这里栅格化：像素已经是对的，
     * 只把矢量数据摘掉，图层退化成普通像素层，并明确告知用户。
     */
    if ((state.angle !== 0 || state.skewX !== 0 || state.skewY !== 0)
      && (layer.textData || layer.shapeData)) {
      get().updateLayer(session.layerId, { textData: undefined, shapeData: undefined });
      get().showToast('toast.rasterizedByTransform', 'info');
      get().pushHistory('action.freeTransform');
      return;
    }

    // 纯缩放才能保住矢量数据：同步坐标与尺寸
    const from = session.originalRect;
    const norm = normalize(state.rect);
    const scaleX = norm.width / from.width;
    const scaleY = norm.height / from.height;
    /*
     * 坐标要相对变换框的起始位置换算：先减去 from.x 得到框内的相对量，
     * 缩放后再加上新框的位置。图层被移动过时 from.x 不再是 0，
     * 少减这一步文字/形状就会跳到别处去。
     */
    const mapX = (x: number) => (x - from.x) * scaleX + norm.x;
    const mapY = (y: number) => (y - from.y) * scaleY + norm.y;

    if (layer.textData) {
      const { width, height } = layer.textData;
      /*
       * 段落文本的边界框也要跟着缩放，否则下次进编辑时框还是变换前的尺寸，
       * 而且 renderText 会按旧宽度重新折行，把这次变换悄悄丢掉。
       * width/height 成对出现（见 TextData），点文本两者都是 undefined，保持原样。
       *
       * PS 的做法是另存「水平/垂直缩放」两个百分比，所以非等比缩放能保住被拉扁的字形；
       * TextData 只有一个 fontSize，存不下这个信息，非等比缩放时字形会在下次重绘时
       * 回到正常比例（框的比例是对的）。要完全对齐得给 TextData 加 scaleX/scaleY。
       */
      const box =
        width !== undefined && height !== undefined
          ? {
              width: Math.max(1, Math.round(width * scaleX)),
              height: Math.max(1, Math.round(height * scaleY)),
            }
          : {};

      get().updateLayer(session.layerId, {
        textData: {
          ...layer.textData,
          ...box,
          x: mapX(layer.textData.x),
          y: mapY(layer.textData.y),
          fontSize: layer.textData.fontSize * Math.min(scaleX, scaleY),
        },
      });
    } else if (layer.shapeData) {
      get().updateLayer(session.layerId, {
        shapeData: {
          ...layer.shapeData,
          rect: {
            x: mapX(layer.shapeData.rect.x),
            y: mapY(layer.shapeData.rect.y),
            width: layer.shapeData.rect.width * scaleX,
            height: layer.shapeData.rect.height * scaleY,
          },
        },
      });
    }

    get().pushHistory('action.freeTransform');
  },

  cancelTransform: () => {
    const session = get().transformSession;
    if (!session) return;

    // 先清除 session，避免后续 setTool 调用再次触发 transform 检查导致无限递归
    _set({ transformSession: null });

    // PS 的行为：取消变换后自动切回之前的工具
    get().setTool(get().previousTool);

    const layer = get().layers.find((item) => item.id === session.layerId);
    if (layer) {
      /*
       * 选区变换有整张画布的快照，直接盖回去即可。
       * 不能用「背景 + origin」重合成：羽化选区提取时按强度拆过 alpha，
       * 合成回来有舍入误差，取消一次羽化边缘就变一点。
       */
      if (session.canvasBefore) {
        clearCanvas(layer.canvas);
        ctx2d(layer.canvas).drawImage(session.canvasBefore, 0, 0);
        get().bumpRevision();
        return;
      }
      /*
       * 快照是按内容裁过的，只覆盖 originalRect 那一块，所以要画回它原来的位置。
       * 画到 (0,0) 会把内容整体搬到画布左上角——取消一次图像就跳位了。
       */
      const x = session.originalRect.x - layer.bounds.x;
      const y = session.originalRect.y - layer.bounds.y;
      clearCanvas(layer.canvas);
      ctx2d(layer.canvas).drawImage(session.origin, x, y);
      // 蒙版预览时也被改过，用整张快照还原，否则取消之后蒙版停在半路的形状上
      if (layer.mask && session.maskBefore) {
        clearCanvas(layer.mask);
        ctx2d(layer.mask).drawImage(session.maskBefore, 0, 0);
        invalidateMask(layer.mask);
      }
      get().bumpRevision();
    }
  },

  setTransformAspectLocked: (locked) => {
    _set({ transformAspectLocked: locked });
  },
});
