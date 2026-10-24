/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer, Point } from '../types';
import { ctx2d } from './canvasUtils';
import { effectiveVisible } from './layerTree';
import { visualOrder } from './layerVisualOrder';

/**
 * 检测指定文档坐标下有哪些图层有不透明像素。
 *
 * @param layers 所有图层，自顶向底排列（渲染顺序的逆序）
 * @param point 文档坐标系下的点
 * @param tolerance alpha 阈值，大于此值才算命中。PS 默认是 1（任何不透明像素）
 * @returns 命中的图层列表，按 z-index 从上到下排序
 */
export function pickLayers(
  layers: Layer[],
  point: Point,
  tolerance = 1,
): Layer[] {
  const result: Layer[] = [];
  const x = Math.floor(point.x);
  const y = Math.floor(point.y);

  for (const layer of layers) {
    // 跳过隐藏图层和组（组没有自己的像素）
    if (!layer.visible || layer.type === 'group') continue;

    // 点是否在图层边界内
    const { bounds } = layer;
    const localX = x - bounds.x;
    const localY = y - bounds.y;
    if (
      localX < 0 ||
      localY < 0 ||
      localX >= layer.canvas.width ||
      localY >= layer.canvas.height
    ) {
      continue;
    }

    // 采样该点的 alpha 值
    const context = ctx2d(layer.canvas);
    const pixel = context.getImageData(localX, localY, 1, 1).data;
    const alpha = pixel[3];

    if (alpha > tolerance) {
      result.push(layer);
    }
  }

  return result;
}

/**
 * 画布右键取层：光标下所有能看见的图层，按视觉堆叠自顶向底排序。
 *
 * 与 pickLayers 的区别是这个函数吃 store 里那份原始扁平数组，
 * 自己负责排序和可见性判断，调用方不用操心两个坑：
 *
 * 1. 顺序不能用 [...layers].reverse()。扁平数组里组的子图层是靠 parentId
 *    挂上去的，简单反转会把子图层的相对位置弄反，菜单第一项就不是
 *    视觉上最顶的那层了。必须走 visualOrder 逐层反转。
 * 2. 可见性要看 effectiveVisible。图层自己 visible=true 但父组关掉时，
 *    画布上根本看不见它，右键菜单里也不该出现。
 *
 * @param layers store 里的扁平图层数组（自底向顶）
 * @param point 文档坐标系下的点
 * @param tolerance alpha 阈值，与 pickLayers 一致
 */
export function pickVisibleLayersAt(
  layers: Layer[],
  point: Point,
  tolerance = 1,
): Layer[] {
  const ordered = visualOrder(layers).filter((layer) =>
    effectiveVisible(layers, layer.id),
  );
  return pickLayers(ordered, point, tolerance);
}
