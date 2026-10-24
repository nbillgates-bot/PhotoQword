/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { textLayerName } from '../i18n/defaultNames';
import type { ToolHandler } from './types';
import type { TextData } from '../types';
import { DEFAULT_TEXT, renderText } from '../engine/textRender';
import { textHitTest, textLayerBounds } from '../engine/textBox';
import { visualOrder } from '../engine/layerVisualOrder';
import { effectiveVisible } from '../engine/layerTree';

/**
 * 文字工具：点击创建点文本，拖拽创建段落文本。
 * 对齐 PS：
 * - 点击空白 → 点文本（横向无限延伸）
 * - 拖出矩形 → 段落文本（固定宽度，自动换行）
 * - 点击已有文字 → 重新编辑
 */

/** 拖拽起点，null 表示这次按下命中了已有文字（不进入拖拽） */
let dragStart: { x: number; y: number } | null = null;

/**
 * 按下时命中的已有文字图层。
 *
 * 进入编辑模式必须等到 pointerup 才做：enterTextEdit 一旦在 pointerdown 里调用，
 * TextEditor 挂载并 focus() 之后，紧随其后的 pointerup / click 会落在下层
 * viewport 上把焦点抢回去，textarea 立刻 blur，等于刚进编辑就退出了。
 */
let pendingEditLayerId: string | null = null;

export const textTool: ToolHandler = {
  id: 'text',
  cursor: 'text',
  onPointerDown: (pointer, ctx) => {
    dragStart = null;
    pendingEditLayerId = null;
    const { doc } = ctx.store;
    if (!doc) return;

    /*
     * 命中检测用文字的边界框而不是像素 alpha：
     * 空文本和半透明/抗锯齿边缘的 alpha 为 0，按像素判会点不中。
     * 框怎么算见 textHitRects —— PSD 进来的文字层要多算一块图层 bounds，
     * 且两块分别判、不并起来，否则中间的空白会吃掉邻居文字层的点击。
     *
     * 顺序必须走 visualOrder：有组时扁平数组直接 reverse 得到的不是视觉堆叠顺序，
     * 两个文字层重叠时会选中被盖住的那个。
     * 可见性必须走 effectiveVisible：图层自己 visible 为真但父组关掉了，
     * 画布上根本看不见，点它却能进编辑就是幽灵命中。
     */
    const layers = ctx.store.layers;
    const hit = visualOrder(layers).find((layer) => {
      if (layer.type !== 'text' || !layer.textData) return false;
      if (layer.locked || !effectiveVisible(layers, layer.id)) return false;
      return textHitTest(layer, pointer.point.x, pointer.point.y, doc);
    });

    if (hit) {
      ctx.store.setActiveLayer(hit.id);
      pendingEditLayerId = hit.id;
      return;
    }

    dragStart = pointer.point;
  },

  onPointerMove: (pointer, ctx) => {
    if (!dragStart) return;
    if (!ctx.store.doc) return;

    const dx = pointer.point.x - dragStart.x;
    const dy = pointer.point.y - dragStart.y;

    // 移动超过 3px 才认为是拖拽（否则算点击，创建点文本）
    if (Math.hypot(dx, dy) > 3) {
      ctx.store.setTextDragRect({
        x: Math.min(dragStart.x, pointer.point.x),
        y: Math.min(dragStart.y, pointer.point.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    }
  },

  onPointerUp: (pointer, ctx) => {
    // 重新编辑已有文字：等到这里才进编辑模式，原因见 pendingEditLayerId 的注释
    if (pendingEditLayerId) {
      const layerId = pendingEditLayerId;
      pendingEditLayerId = null;
      ctx.store.enterTextEdit(layerId);
      return;
    }

    const start = dragStart;
    // 先清状态，后面任何提前 return 都不会留下脏的起点
    dragStart = null;
    if (!start) return;

    const { doc, foreground, toolOptions, textDragRect } = ctx.store;
    ctx.store.setTextDragRect(null);
    if (!doc) return;

    const dist = Math.hypot(pointer.point.x - start.x, pointer.point.y - start.y);

    const textData: TextData = {
      ...DEFAULT_TEXT,
      fontFamily: toolOptions.textFontFamily ?? DEFAULT_TEXT.fontFamily,
      fontSize: toolOptions.textFontSize ?? DEFAULT_TEXT.fontSize,
      fontWeight: toolOptions.textFontWeight ?? DEFAULT_TEXT.fontWeight,
      bold: toolOptions.textBold ?? DEFAULT_TEXT.bold,
      italic: toolOptions.textItalic ?? DEFAULT_TEXT.italic,
      underline: toolOptions.textUnderline ?? DEFAULT_TEXT.underline,
      align: toolOptions.textAlign ?? DEFAULT_TEXT.align,
      color: foreground,
      content: '',
      x: start.x,
      y: start.y,
    };

    /*
     * 拖出了矩形就是段落文本，带宽高限制；否则是点文本，横向无限。
     *
     * 宽高取整到整像素：canvas.width 只接受整数（赋小数会被截断），而 textarea
     * 和折行都按 data.width 排版。不取整的话两边差最多 1px，提交后文字会错半个像素。
     */
    if (dist > 3 && textDragRect && textDragRect.width > 0 && textDragRect.height > 0) {
      textData.width = Math.max(1, Math.round(textDragRect.width));
      textData.height = Math.max(1, Math.round(textDragRect.height));
      textData.x = Math.round(textDragRect.x);
      textData.y = Math.round(textDragRect.y);
    }

    const layer = ctx.store.insertLayer('text', textLayerName(ctx.store.locale));
    if (!layer) return;
    renderText(layer.canvas, textData);
    // bounds 原点按 textBox.ts 的约定算：段落取 (x,y)，点文本取 (0,0)
    const bounds = textLayerBounds(layer.canvas, textData);
    ctx.store.updateLayer(layer.id, { textData, bounds, name: textLayerName(ctx.store.locale) });
    ctx.store.enterTextEdit(layer.id);
  },

  onDeactivate: (ctx) => {
    dragStart = null;
    pendingEditLayerId = null;
    if (ctx.store.textDragRect) ctx.store.setTextDragRect(null);
  },
};
