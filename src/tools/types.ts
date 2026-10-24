/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, ToolId } from '../types';
import type { EditorStore } from '../store/types';

/** 指针事件在文档坐标系下的描述 */
export interface ToolPointer {
  /** 文档坐标（已换算，未取整） */
  point: Point;
  /** 视口坐标。抓手/缩放这类工具必须用它，否则会与 pan 形成反馈循环 */
  screen: Point;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  /**
   * 压感，取值 (0, 1]。只有手写笔报真实力度，鼠标与触屏一律是 1
   * —— 换算规则和为什么不能直接用 event.pressure 见 engine/pointerPressure。
   */
  pressure: number;
  button: number;
}

/** 工具可用的运行时上下文 */
export interface ToolContext {
  store: EditorStore;
  /** 请求重绘画布覆盖层（选框、变换框等） */
  requestOverlayRepaint: () => void;
}

/**
 * 工具生命周期。所有回调都是可选的，
 * 只做点击的工具只需实现 onPointerDown。
 */
export interface ToolHandler {
  id: ToolId;
  /** 光标样式 */
  cursor?: string | ((ctx: ToolContext) => string);
  onPointerDown?: (pointer: ToolPointer, ctx: ToolContext) => void;
  onPointerMove?: (pointer: ToolPointer, ctx: ToolContext) => void;
  onPointerUp?: (pointer: ToolPointer, ctx: ToolContext) => void;
  /** 双击。裁剪用它确认，PS 里双击裁剪框内即落刀 */
  onDoubleClick?: (pointer: ToolPointer, ctx: ToolContext) => void;
  /** 工具切换离开时清理未提交状态 */
  onDeactivate?: (ctx: ToolContext) => void;
  /** 在画布覆盖层上绘制工具自身的视觉反馈（虚线框等） */
  drawOverlay?: (context: CanvasRenderingContext2D, ctx: ToolContext, zoom: number) => void;
}
