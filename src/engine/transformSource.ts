/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Rect, Selection } from '../types';
import { cloneCanvas, cropCanvas } from './canvasUtils';
import { contentBounds, intersectRect, unionRect } from './layerBounds';
import { extractSelectionOnly, clearSelection } from './floatingSelection';

/**
 * 自由变换的源快照与初始变换框。
 *
 * 为什么不直接拿整张图层画布：绘制类操作前画布会先长到覆盖整个文档
 * （expandLayerForEdit），四周多出来的一圈是全透明的。框跟着画布走的话，
 * 缩小确认之后再按一次 Ctrl+T，框又是整幅文档那么大——表现就是
 * 「框还停在第一次缩放前的位置」。PS 的框是贴着有像素的那一块画的。
 */
export interface TransformSource {
  /** 变换框的初始矩形（文档坐标） */
  rect: Rect;
  /** 源像素快照，尺寸等于 rect */
  origin: HTMLCanvasElement;
  /** 蒙版快照，与 origin 同尺寸；没有蒙版时为 undefined */
  originMask?: HTMLCanvasElement;
}

/**
 * @param preferRect - 期望的框（canvas 本地坐标）。文字/形状这类有"自己的外框"的
 *   图层传它，框就贴外框而不是贴墨迹。会与墨迹取并集，避免斜体伸出的部分被裁掉。
 */
export function transformSourceOf(
  canvas: HTMLCanvasElement,
  bounds: Rect,
  mask?: HTMLCanvasElement,
  preferRect?: Rect,
): TransformSource {
  const ink = contentBounds(canvas);
  const local = preferRect ? withPreferred(canvas, preferRect, ink) : ink;
  /*
   * 蒙版与画布不同尺寸时不裁：按画布坐标去裁它会错位。
   * 正常情况下两者同尺寸（见 mask.ts 的 maskGeometry：蒙版跟画布同尺寸、
   * 对齐到 bounds），组是唯一的例外（组按文档尺寸建，但组也没有可变换的像素）。
   * 退回整张画布只是框大一圈，不会画错。
   */
  const sameSize = !mask || (mask.width === canvas.width && mask.height === canvas.height);

  // 全透明图层没有内容可贴，退回整张画布，至少还能开出框来
  if (!local || !sameSize) {
    return {
      rect: { x: bounds.x, y: bounds.y, width: canvas.width, height: canvas.height },
      origin: cloneCanvas(canvas),
      originMask: mask ? cloneCanvas(mask) : undefined,
    };
  }

  return {
    rect: { ...local, x: local.x + bounds.x, y: local.y + bounds.y },
    origin: cropCanvas(canvas, local),
    // 蒙版按同一块裁：源与蒙版必须同尺寸，boxMatrix 才会把两者映射到同一个框
    originMask: mask ? cropCanvas(mask, local) : undefined,
  };
}

/**
 * 把期望框并上墨迹，再夹进画布范围。
 *
 * 先取整（向外扩）：文字外框是量出来的，带小数的话裁出来的源会做一次半像素重采样，
 * 框一开就先糊一层。夹进画布是因为 origin 只能从画布上裁得到，
 * 框比画布还大的部分没有像素可贴，留着只会让框和内容错位。
 */
function withPreferred(canvas: HTMLCanvasElement, prefer: Rect, ink: Rect | null): Rect | null {
  const x = Math.floor(prefer.x);
  const y = Math.floor(prefer.y);
  const outer = {
    x,
    y,
    width: Math.ceil(prefer.x + prefer.width) - x,
    height: Math.ceil(prefer.y + prefer.height) - y,
  };
  const clamped = intersectRect(outer, { x: 0, y: 0, width: canvas.width, height: canvas.height });
  if (!clamped) return ink;
  return ink ? unionRect(clamped, ink) : clamped;
}

/**
 * 选区感知的变换源：提取选区内的像素并生成挖空后的背景。
 *
 * PS 的行为：有选区时 Ctrl+T 只变换选区内的像素，变换框贴着选区外接矩形，
 * 选区外的背景保持不动。羽化选区的 alpha 由 floatingSelection 的提取逻辑处理。
 *
 * @param pristine - 可选的移动前快照。如果提供，用它作为背景基础，能保留被移动覆盖的原始内容。
 */
export interface SelectionTransformSource {
  /** 变换框初始矩形（文档坐标）= selection.bounds */
  rect: Rect;
  /** 选中的像素，尺寸 = rect */
  origin: HTMLCanvasElement;
  /** 图层蒙版按选区裁过的快照（图层本身有蒙版时存在） */
  originMask?: HTMLCanvasElement;
  /** 挖空选区后的图层像素，用于每帧合成背景（不变） */
  background: HTMLCanvasElement;
}

export function transformSourceWithSelection(
  canvas: HTMLCanvasElement,
  bounds: Rect,
  layerMask: HTMLCanvasElement | undefined,
  selection: Selection,
  pristine?: HTMLCanvasElement,
): SelectionTransformSource {
  // 提取选区内的像素（不破坏原画布）
  const origin = extractSelectionOnly(canvas, selection, bounds);

  /*
   * 生成背景。
   *
   * 有 pristine（用户先用移动工具挪过选区）时直接拿它当背景，**不能再挖一次**：
   * pristine 是「剪走方块之后、落到新位置之前」的快照，洞已经在原位置了，
   * 而新位置底下那份原始像素只存在 pristine 里（画布上已被方块盖掉）。
   * 再按当前选区 clearSelection 就把这份唯一的备份也挖穿，
   * 表现就是方块后面的背景变透明。
   *
   * 没有 pristine 时选区还在原位，克隆当前画布挖掉选区即可。
   */
  const background = cloneCanvas(pristine ?? canvas);
  if (!pristine) clearSelection(background, selection, bounds);

  // 图层蒙版按选区外接矩形裁一块（整块裁，不按强度）
  const sameSize = !layerMask || (layerMask.width === canvas.width && layerMask.height === canvas.height);
  const originMask =
    layerMask && sameSize
      ? cropCanvas(layerMask, {
          x: selection.bounds.x - bounds.x,
          y: selection.bounds.y - bounds.y,
          width: selection.bounds.width,
          height: selection.bounds.height,
        })
      : undefined;

  return {
    rect: selection.bounds,
    origin,
    originMask,
    background,
  };
}
