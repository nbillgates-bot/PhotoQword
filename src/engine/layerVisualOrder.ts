/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';
import { buildTree, type LayerNode } from './layerTree';

/**
 * 把图层数组转成视觉堆叠顺序：从顶层到底层的扁平列表。
 *
 * 简单 reverse 在有组时是错的：组内子图层的视觉顺序受组在同级中的位置影响。
 * 必须先建树、每一层都反序、再展平。
 *
 * 例：layers = [bg, groupA, childA1, childA2, top]
 *   - 简单 reverse → [top, childA2, childA1, groupA, bg] ❌ 子图层被拆散了
 *   - 正确结果 → [top, childA2, childA1, bg]（组自己不参与，见下方注释）
 *
 * @param layers 扁平的图层数组（store 原样）
 * @param includeGroups 是否保留组自己（组没有像素，pickLayers 时应该去掉）
 * @returns 自顶向底的扁平列表
 */
export function visualOrder(layers: Layer[], includeGroups = false): Layer[] {
  const result: Layer[] = [];
  const walk = (nodes: LayerNode[]) => {
    // 面板从上往下 = 堆叠从顶层到底层，每一层都要倒序
    for (const node of [...nodes].reverse()) {
      if (includeGroups || node.layer.type !== 'group') {
        result.push(node.layer);
      }
      // 组折叠与否不影响渲染顺序，子图层都要展开
      if (node.layer.type === 'group') {
        walk(node.children);
      }
    }
  };
  walk(buildTree(layers));
  return result;
}
