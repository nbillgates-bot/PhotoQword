/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ToolHandler } from './types';
import type { Point, Rect, Selection } from '../types';
import { transformBlockReason } from '../engine/layerLock';
import { translateBounds } from '../engine/layerBounds';
import { extractSelection, pasteSelection } from '../engine/floatingSelection';
import { translateSelection } from '../engine/translateSelection';
import { cloneCanvas, ctx2d } from '../engine/canvasUtils';
import { selectionOutline } from '../engine/selectionOutline';
import type { OutlineSegment } from '../engine/selectionOutline';

/**
 * 画 PS 风格蚂蚁线：白实线底 + 黑虚线（动画）。
 * dash 和 lineWidth 都比 overlayPainter 里的更细，更接近 PS 的精细感。
 */
function paintMarchingAnts(
  context: CanvasRenderingContext2D,
  segments: OutlineSegment[],
  zoom: number,
): void {
  if (segments.length === 0) return;
  const dash = 2.5 / zoom; // 原来是 4，改成 2.5 让虚线更密
  const trace = () => {
    context.beginPath();
    for (const s of segments) {
      context.moveTo(s.x1, s.y1);
      context.lineTo(s.x2, s.y2);
    }
  };

  context.save();
  context.lineWidth = 1 / zoom;

  context.strokeStyle = '#ffffff';
  context.setLineDash([]);
  trace();
  context.stroke();

  context.strokeStyle = '#000000';
  context.setLineDash([dash, dash]);
  context.lineDashOffset = -(Date.now() / 50) % (dash * 2);
  trace();
  context.stroke();

  context.restore();
}

/**
 * 浮动选区：第一次拖动时从图层上剪下来的那块像素，之后可以反复移动。
 *
 * 为什么需要跨手势保留：每次按下都重新 extractSelection 会把"方块 + 它当前
 * 压着的背景"一起剪走，于是第二下之后背景被越吃越多。PS 的模型是第一下剪出
 * 浮动像素，之后的拖动移动的是同一块浮动像素，不再动图层。
 *
 * pristine 是"挖掉原位置之后、还没贴任何东西"的图层快照。每次拖动都从它重画，
 * 这样图层上永远只有一个洞（原位置），且贴过的位置能干净地撤回。
 */
interface FloatState {
  layerId: string;
  /** 剪下来的像素块 */
  block: HTMLCanvasElement;
  /** 挖洞后的图层快照，每次拖动从它重建 */
  pristine: HTMLCanvasElement;
  /** 块的原始左上角（文档坐标） */
  origin: Point;
  /** 相对 origin 的累计偏移 */
  offset: Point;
  /**
   * 建立浮动时的选区对象引用。用它判断"还是同一个浮动"：
   * 用户重新框选会换成新对象，此时应该丢弃浮动重新开始。
   */
  selectionRef: Selection;
  /** 我们最后一次改动图层后的 revision。别人动过图层就作废浮动，避免抹掉他的笔画 */
  revision: number;
  /**
   * 蚂蚁线轮廓，**相对 origin** 的归一化坐标（左上角为 0,0）。
   *
   * 存成相对量而不是每帧从 store 的选区重算，有两个原因：
   * 一是 onPointerUp 会把 store 里的选区挪到新位置，再整体加 offset 就会把
   * 上一次的位移重复计一遍；二是 translateSelection 会把 bounds 与文档求交裁掉，
   * 拿被裁过的 bounds 当位移基准会继续偏。归一化之后画的时候只需加 origin+offset。
   * 顺带也省掉了每帧一次 getImageData。
   */
  outline: OutlineSegment[];
}

let float: FloatState | null = null;

/**
 * 获取当前浮动选区的 pristine 快照（如果存在）。
 * pristine 保存的是移动前的图层状态（原位空 + 其他位置保持移动前状态）。
 */
export function getFloatPristine(): HTMLCanvasElement | null {
  return float?.pristine ?? null;
}

/**
 * 从外部装入一个浮动选区。
 *
 * 给自由变换确认用：确认时像素已经画进图层了，如果就这样撒手，
 * 用户接着拖动会重新 extractSelection，把方块连同它底下的原始背景一起剪走，
 * 于是背景第二次被挖空。改成把「方块 + 背景快照」交回浮动状态，
 * 下一次按下就走 restorePristine 那条路，不再动第二刀。
 *
 * pristine 必须与图层画布同尺寸（restorePristine 是按 (0,0) 对齐画回去的）。
 */
export function adoptFloat(params: {
  layerId: string;
  block: HTMLCanvasElement;
  pristine: HTMLCanvasElement;
  origin: Point;
  selection: Selection;
  revision: number;
}): void {
  const { origin, selection } = params;
  float = {
    layerId: params.layerId,
    block: params.block,
    pristine: params.pristine,
    origin: { ...origin },
    offset: { x: 0, y: 0 },
    selectionRef: selection,
    revision: params.revision,
    outline: selectionOutline(selection.mask, selection.bounds).map((s) => ({
      x1: s.x1 - origin.x,
      y1: s.y1 - origin.y,
      x2: s.x2 - origin.x,
      y2: s.y2 - origin.y,
    })),
  };
}

/**
 * 移动工具。
 *
 * 无选区：把图层整体平移（只改 bounds）
 * 有选区：拖动选区内的像素（PS 的浮动选区）
 */
let session:
  | {
      type: 'layer';
      layerId: string;
      origin: Rect;
      start: Point;
      offset: Point;
    }
  | {
      type: 'selection';
      /** 按下时的起点，用来算本次手势的位移 */
      start: Point;
      /** 按下时浮动块已有的偏移，本次位移叠加在它上面 */
      baseOffset: Point;
    }
  | null = null;

/** 点是否落在选区包围盒内 */
function isInSelectionBounds(point: Point, bounds: Rect): boolean {
  return (
    point.x >= bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

/** 现有浮动块还能不能接着用：同图层、同选区、且这期间没人改过图层 */
function floatIsReusable(layerId: string, selection: Selection, revision: number): boolean {
  return (
    float !== null &&
    float.layerId === layerId &&
    float.selectionRef === selection &&
    float.revision === revision
  );
}

/** 把图层还原成"只有原位置一个洞"的状态 */
function restorePristine(canvas: HTMLCanvasElement, pristine: HTMLCanvasElement): void {
  const context = ctx2d(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(pristine, 0, 0);
}

export const moveTool: ToolHandler = {
  id: 'move',
  cursor: 'default',
  onPointerDown: (pointer, ctx) => {
    const layer = ctx.store.activeLayer();
    if (!layer) return;
    const blocked = transformBlockReason(layer);
    if (blocked) {
      ctx.store.showToast(blocked, 'error');
      return;
    }

    const { selection } = ctx.store;

    // 有选区且按在选区内：搬选区里的像素，而不是整个图层（PS 的行为）
    if (selection && isInSelectionBounds(pointer.point, selection.bounds)) {
      if (floatIsReusable(layer.id, selection, ctx.store.revision)) {
        /*
         * 接着移动同一块浮动像素。先把图层还原成只有原位置一个洞的样子，
         * 上一次贴下的那份由 pristine 覆盖掉——不能再 extract，
         * 否则会把方块连同它现在压着的背景一起剪走。
         */
        restorePristine(layer.canvas, float!.pristine);
        ctx.store.bumpRevision();
        session = { type: 'selection', start: pointer.point, baseOffset: { ...float!.offset } };
        return;
      }

      // 第一次：从图层上剪下这块像素，并记下挖洞后的快照
      // 选区是文档坐标，图层画布是局部坐标，差 layer.bounds 那个原点
      const block = extractSelection(layer.canvas, selection, layer.bounds);
      const origin = { x: selection.bounds.x, y: selection.bounds.y };
      float = {
        layerId: layer.id,
        block,
        pristine: cloneCanvas(layer.canvas),
        origin,
        offset: { x: 0, y: 0 },
        selectionRef: selection,
        revision: ctx.store.revision,
        // 归一化到 origin：画的时候加 origin+offset 即可，不受 store 选区后续变化影响
        outline: selectionOutline(selection.mask, selection.bounds).map((s) => ({
          x1: s.x1 - origin.x,
          y1: s.y1 - origin.y,
          x2: s.x2 - origin.x,
          y2: s.y2 - origin.y,
        })),
      };
      ctx.store.bumpRevision();
      session = { type: 'selection', start: pointer.point, baseOffset: { x: 0, y: 0 } };
      return;
    }

    // 按在选区外：浮动块就此定妆，后面按整层移动处理
    float = null;

    // 否则进入图层移动模式
    session = {
      type: 'layer',
      layerId: layer.id,
      origin: { ...layer.bounds },
      start: pointer.point,
      offset: { x: 0, y: 0 },
    };
  },

  onPointerMove: (pointer, ctx) => {
    if (!session) return;

    let dx = pointer.point.x - session.start.x;
    let dy = pointer.point.y - session.start.y;
    if (pointer.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const step = { x: Math.round(dx), y: Math.round(dy) };

    if (session.type === 'layer') {
      // 图层移动模式
      session.offset = step;
      const layerId = session.layerId;
      const layer = ctx.store.layers.find((item) => item.id === layerId);
      if (!layer) return;
      layer.bounds = translateBounds(session.origin, session.offset.x, session.offset.y);
      /*
       * 走 bumpVisualRevision：整层平移只改 bounds，一个像素都没动。
       * 用 bumpRevision 会连带自增 pixelRevision，让全部图层的缩略图缓存失效，
       * 于是每个 pointermove 都要重跑几百次 contentBounds + toDataURL——
       * 这是「放大后拖图层很慢」的主因，而缩略图本身根本不需要变。
       */
      ctx.store.bumpVisualRevision();
    } else if (float) {
      // 浮动选区：本次位移叠在按下时的偏移上，overlay 里预览
      float.offset = {
        x: session.baseOffset.x + step.x,
        y: session.baseOffset.y + step.y,
      };
      ctx.requestOverlayRepaint();
    }
  },

  onPointerUp: (_pointer, ctx) => {
    if (!session) return;

    if (session.type === 'selection') {
      const active = float;
      session = null;
      if (!active) return;

      const layer = ctx.store.layers.find((item) => item.id === active.layerId);
      if (!layer) {
        float = null;
        return;
      }

      // 把浮动块贴到当前位置。图层此刻是 pristine（只有原位置一个洞），
      // 所以贴下去不会叠加上一次的残留
      const targetX = active.origin.x + active.offset.x;
      const targetY = active.origin.y + active.offset.y;
      pasteSelection(layer.canvas, active.block, targetX, targetY, layer.bounds);
      ctx.store.bumpRevision();

      // 蚂蚁线跟着像素走，与 PS 一致；同时更新 selectionRef，
      // 否则下次按下会因为选区换了对象而误判成"新的浮动"
      const current = ctx.store.selection;
      if (current) {
        const moved = translateSelection(
          current,
          targetX - current.bounds.x,
          targetY - current.bounds.y,
        );
        if (moved) {
          ctx.store.setSelection(moved);
          active.selectionRef = moved;
        }
      }
      active.revision = ctx.store.revision;
      ctx.store.pushHistory('action.moveSelection');
      return;
    }

    // 图层移动模式
    {
      const { layerId, offset } = session;
      if (offset.x === 0 && offset.y === 0) {
        session = null;
        return;
      }

      const layer = ctx.store.layers.find((item) => item.id === layerId);
      /*
       * 只有文字/形状层会在这里重画像素，普通栅格层整场拖拽只动了 bounds。
       * bounds 属于「非像素属性」，在 meta 里是整存的，撤销靠它就够，
       * 不需要任何像素增量——所以栅格层传空 hint，一层都不用扫。
       *
       * 实测拖一次图层这里要 520~950ms（292 层全扫），是「放大后拖图层卡」
       * 剩下的那一半原因（另一半是 pixelRevision 连带失效，见 onPointerMove）。
       */
      let pixelsChanged = false;
      if (layer?.textData) {
        /*
         * 走 updateTextLayer 而不是 updateLayer：拖拽期间只平移了 bounds，
         * 像素还在老位置。点文本的落笔基准是 canvas 本地 (data.x, data.y)，
         * 只改 data 不重画的话，下一次因改字号等原因重画时位移会叠加一次
         * （见 textBox.ts 的坐标约定）。重画一遍顺便把 bounds 摆回正确原点。
         */
        ctx.store.updateTextLayer(layerId, {
          x: layer.textData.x + offset.x,
          y: layer.textData.y + offset.y,
        });
        pixelsChanged = true;
      } else if (layer?.shapeData) {
        ctx.store.updateLayer(layerId, {
          shapeData: {
            ...layer.shapeData,
            rect: {
              ...layer.shapeData.rect,
              x: layer.shapeData.rect.x + offset.x,
              y: layer.shapeData.rect.y + offset.y,
            },
          },
        });
        pixelsChanged = true;
      }
      ctx.store.pushHistory('action.moveLayer', {
        layerIds: pixelsChanged ? [layerId] : [],
      });
    }

    session = null;
  },

  onDeactivate: () => {
    session = null;
    // 浮动块的像素在每次抬手时都已经贴进图层了，这里丢掉状态就行，不用补贴
    float = null;
  },

  /**
   * 拖拽中把浮动块画在 overlay 上做预览。
   * 图层此刻是 pristine（只有洞），块由这里补上，视觉上等于贴好了。
   * 同时画平移后的蚂蚁线，让选区边界跟着内容走（PS 的行为）。
   */
  drawOverlay: (context, _ctx, zoom) => {
    if (!session || session.type !== 'selection' || !float) return;
    const active = float; // 局部引用，避免 TS 认为模块变量可能在异步期间变 null

    const x = active.origin.x + active.offset.x;
    const y = active.origin.y + active.offset.y;
    context.drawImage(active.block, x, y);

    // 轮廓是相对 origin 的，加上块当前的左上角就是它该在的位置
    paintMarchingAnts(
      context,
      active.outline.map((s) => ({
        x1: s.x1 + x,
        y1: s.y1 + y,
        x2: s.x2 + x,
        y2: s.y2 + y,
      })),
      zoom,
    );
  },
};

/** 拖动浮动块时为真。overlayPainter 靠它避免在原位置再画一份蚂蚁线 */
export function floatDragActive(): boolean {
  return session?.type === 'selection' && float !== null;
}

/**
 * 提交浮动选区到图层。
 *
 * 如果浮动块存在且有偏移，先贴回图层。
 *
 * pasteToLayer: 回调函数，接收 (block, targetX, targetY)，负责把块贴到图层。
 */
export function commitFloat(
  pasteToLayer?: (block: HTMLCanvasElement, targetX: number, targetY: number) => void,
): void {
  if (!float) {
    session = null;
    return;
  }

  // 如果提供了贴合回调且浮动块有偏移，先贴回图层
  if (pasteToLayer && (float.offset.x !== 0 || float.offset.y !== 0)) {
    const targetX = float.origin.x + float.offset.x;
    const targetY = float.origin.y + float.offset.y;
    pasteToLayer(float.block, targetX, targetY);
  }

  float = null;
  session = null;
}
