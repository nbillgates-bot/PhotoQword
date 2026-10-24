/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Layer } from '../types';
import { cloneCanvas } from './canvasUtils';
import { descendantIds } from './layerTree';

/**
 * 图层复制的纯计算。不认识 store 与 React。
 *
 * 从 layerSlice 抽出来是因为有了第二个调用方：面板里 Alt+拖动是
 * 「复制并落到指定位置」，它要一步历史，不能先调复制再调移动。
 */

/** 深拷贝一个图层的像素与可再编辑数据；id 由调用方另行指定 */
export function cloneLayer(layer: Layer): Layer {
  return {
    ...layer,
    canvas: cloneCanvas(layer.canvas),
    // 位置一起复制，bounds 是值对象不能共享引用
    bounds: { ...layer.bounds },
    mask: layer.mask ? cloneCanvas(layer.mask) : undefined,
    textData: layer.textData ? { ...layer.textData } : undefined,
    shapeData: layer.shapeData
      ? { ...layer.shapeData, rect: { ...layer.shapeData.rect } }
      : undefined,
  };
}

export interface DuplicateResult {
  /** 复制后的完整图层表；id 不存在时是原数组本身 */
  layers: Layer[];
  /** 根副本的 id，没复制成功时为 null */
  newId: string | null;
}

/**
 * 复制一个图层（或一整个组）。副本紧贴在原子树上方。
 *
 * makeId 由调用方提供：store 用 uid()，测试用可预测的计数器。
 * nameCopy 同理：图层名是用户数据，「副本」这个词要按当前语言取
 * （PS 英文版是 "Background copy"），而 engine 不认识语言。
 * 不传时退回中文后缀，与词条表的兜底语言一致。
 */
export function duplicateSubtree(
  layers: Layer[],
  id: string,
  makeId: (seed: string) => string,
  nameCopy: (name: string) => string = (name) => `${name} 副本`, // i18n-exempt: 兜底值，正常路径由 store 传入
): DuplicateResult {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index < 0) return { layers, newId: null };

  // 复制组要连整棵子树一起复制，并且组内的父子指向要重新接到副本上
  const kids = new Set(descendantIds(layers, id));
  const subtree = layers.filter((layer) => layer.id === id || kids.has(layer.id));
  const idMap = new Map(
    subtree.map((layer) => [layer.id, makeId(layer.type === 'group' ? 'group' : 'layer')]),
  );

  const copies = subtree.map((layer) => ({
    ...cloneLayer(layer),
    id: idMap.get(layer.id)!,
    name: layer.id === id ? nameCopy(layer.name) : layer.name,
    // 子图层指向副本组；根副本保持原来的父级
    parentId:
      layer.id === id
        ? (layer.parentId ?? null)
        : (idMap.get(layer.parentId ?? '') ?? null),
  }));

  /*
   * 插在整棵原子树之后。用 subtree.length 而不是 kids 的下标：
   * 子图层在数组里紧跟在组后面，插到中间会把原来的子树切断。
   */
  const next = [...layers];
  next.splice(index + subtree.length, 0, ...copies);
  return { layers: next, newId: idMap.get(id)! };
}
