/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 中位切分（median cut）颜色量化，把真彩图降到 GIF 能表达的 256 色以内。
 *
 * 为什么是中位切分而不是「取出现最多的 256 色」：后者在渐变上会整片塌成
 * 一两个颜色，天空这种大面积平滑过渡直接变色阶。中位切分按颜色分布反复
 * 沿最长的那条轴对半劈，颜色多的区域自动分到更多格子，渐变能保住层次。
 *
 * GIF 的透明只有「全透明」一档（没有半透明），所以 alpha 低于阈值的像素
 * 统一映射到调色板里专门留出的那一个透明槽位，与 PS 存 GIF 的行为一致。
 */

/** alpha 低于这个值算全透明。PS 的 GIF 存储也是硬阈值二选一 */
const ALPHA_THRESHOLD = 128;

export interface Quantized {
  /** 调色板，每色 3 字节 RGB，长度 = colorCount * 3 */
  palette: Uint8Array;
  /** 每像素一个调色板下标 */
  indices: Uint8Array;
  /** 调色板实际色数（含透明槽） */
  colorCount: number;
  /** 透明色的下标，没有透明像素时为 -1 */
  transparentIndex: number;
}

interface Box {
  /** 落在这个盒子里的像素在 pixels 里的下标 */
  members: number[];
  min: [number, number, number];
  max: [number, number, number];
}

/** 算一个盒子的包围范围 */
function bounds(members: number[], pixels: Uint8Array): Pick<Box, 'min' | 'max'> {
  const min: [number, number, number] = [255, 255, 255];
  const max: [number, number, number] = [0, 0, 0];
  for (const index of members) {
    for (let c = 0; c < 3; c += 1) {
      const value = pixels[index * 3 + c];
      if (value < min[c]) min[c] = value;
      if (value > max[c]) max[c] = value;
    }
  }
  return { min, max };
}

/**
 * 量化到最多 maxColors 色。
 * 有透明像素时会占掉一个槽位，所以不透明色最多 maxColors - 1 种。
 */
export function quantize(image: ImageData, maxColors = 256): Quantized {
  const { data, width, height } = image;
  const pixelCount = width * height;

  // 先把不透明像素的 RGB 收集起来，同时记下每个像素是否透明
  const opaque = new Uint8Array(pixelCount * 3);
  const isTransparent = new Uint8Array(pixelCount);
  let opaqueCount = 0;
  const sourceOf: number[] = [];
  for (let p = 0; p < pixelCount; p += 1) {
    if (data[p * 4 + 3] < ALPHA_THRESHOLD) {
      isTransparent[p] = 1;
      continue;
    }
    opaque[opaqueCount * 3] = data[p * 4];
    opaque[opaqueCount * 3 + 1] = data[p * 4 + 1];
    opaque[opaqueCount * 3 + 2] = data[p * 4 + 2];
    sourceOf.push(p);
    opaqueCount += 1;
  }

  const hasTransparent = sourceOf.length < pixelCount;
  const colorBudget = hasTransparent ? maxColors - 1 : maxColors;

  const boxes = splitBoxes(opaque, opaqueCount, colorBudget);
  const palette = new Uint8Array(maxColors * 3);
  // 每个盒子取其成员的平均色作为代表色
  boxes.forEach((box, slot) => {
    const avg = averageColor(box.members, opaque);
    palette[slot * 3] = avg[0];
    palette[slot * 3 + 1] = avg[1];
    palette[slot * 3 + 2] = avg[2];
  });

  const transparentIndex = hasTransparent ? boxes.length : -1;
  const indices = new Uint8Array(pixelCount);
  // 盒子成员直接回填下标，省掉一轮最近色搜索
  boxes.forEach((box, slot) => {
    for (const localIndex of box.members) indices[sourceOf[localIndex]] = slot;
  });
  if (transparentIndex >= 0) {
    for (let p = 0; p < pixelCount; p += 1) {
      if (isTransparent[p]) indices[p] = transparentIndex;
    }
  }

  return {
    palette,
    indices,
    colorCount: boxes.length + (hasTransparent ? 1 : 0),
    transparentIndex,
  };
}

/** 反复劈盒子直到数量够或者劈不动了 */
function splitBoxes(pixels: Uint8Array, count: number, budget: number): Box[] {
  if (count === 0) {
    // 全透明的图也得有至少一个调色板项，否则 GIF 头写不出来
    return [{ members: [], min: [0, 0, 0], max: [0, 0, 0] }];
  }
  const all = Array.from({ length: count }, (_, i) => i);
  let boxes: Box[] = [{ members: all, ...bounds(all, pixels) }];

  while (boxes.length < budget) {
    // 每轮挑「最长边最长」的盒子劈，优先把颜色跨度大的区域分细
    let target = -1;
    let longest = 0;
    boxes.forEach((box, i) => {
      if (box.members.length < 2) return;
      const span = Math.max(
        box.max[0] - box.min[0],
        box.max[1] - box.min[1],
        box.max[2] - box.min[2],
      );
      if (span > longest) {
        longest = span;
        target = i;
      }
    });
    // 所有盒子都劈不动了（跨度为 0 或只剩一个成员）
    if (target < 0 || longest === 0) break;

    const box = boxes[target];
    const axis = longestAxis(box);
    // 按该轴排序取中位数，两半成员数尽量相等
    const sorted = [...box.members].sort(
      (a, b) => pixels[a * 3 + axis] - pixels[b * 3 + axis],
    );
    const mid = Math.floor(sorted.length / 2);
    const left = sorted.slice(0, mid);
    const right = sorted.slice(mid);
    boxes = [
      ...boxes.slice(0, target),
      { members: left, ...bounds(left, pixels) },
      { members: right, ...bounds(right, pixels) },
      ...boxes.slice(target + 1),
    ];
  }
  return boxes;
}

/** 跨度最大的那条通道轴 */
function longestAxis(box: Box): number {
  const spans = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
  return spans.indexOf(Math.max(...spans));
}

/** 盒子成员的平均色 */
function averageColor(members: number[], pixels: Uint8Array): [number, number, number] {
  if (members.length === 0) return [0, 0, 0];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const index of members) {
    r += pixels[index * 3];
    g += pixels[index * 3 + 1];
    b += pixels[index * 3 + 2];
  }
  const n = members.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}
