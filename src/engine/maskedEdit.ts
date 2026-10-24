/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { Point, Selection } from '../types';
import { createReadbackCanvas, ctx2d } from './canvasUtils';

/**
 * 把一个 ImageData 级的处理限制在选区内执行（就地修改传入的 canvas）。
 *
 * 无选区时等于直接处理整幅。有选区时按蒙版强度在「原像素」和「处理后像素」
 * 之间线性插值，羽化边缘因此得到平滑过渡。
 *
 * 为什么不用 canvas 合成（整幅处理 → destination-in 裁到选区 → 贴回）：
 * 半透明像素上贴不回去。source-over 会把两层 alpha 叠加起来（本该保持不变），
 * 先 destination-out 挖掉再贴又会在羽化圈上留下 alpha 缺口。逐点插值才是准确的。
 */
export function applyWithinSelection(
  canvas: HTMLCanvasElement,
  selection: Selection | null,
  fn: (image: ImageData) => void,
  origin: Point = { x: 0, y: 0 },
): void {
  const context = ctx2d(canvas);
  const { width, height } = canvas;
  const image = context.getImageData(0, 0, width, height);

  if (!selection) {
    fn(image);
    context.putImageData(image, 0, 0);
    return;
  }

  // 处理前先留一份原像素，插值要用它当起点
  const before = image.data.slice();
  fn(image);

  const strength = maskAlpha(selection.mask, width, height, origin);
  const after = image.data;
  for (let i = 0; i < after.length; i += 4) {
    const s = strength[i + 3];
    if (s === 255) continue; // 完全选中：处理结果直接留着
    if (s === 0) {
      // 完全没选中：整点还原，逐通道写回比条件判断少一次分支
      after[i] = before[i];
      after[i + 1] = before[i + 1];
      after[i + 2] = before[i + 2];
      after[i + 3] = before[i + 3];
      continue;
    }
    const t = s / 255;
    for (let c = 0; c < 4; c += 1) {
      after[i + c] = before[i + c] + (after[i + c] - before[i + c]) * t;
    }
  }
  context.putImageData(image, 0, 0);
}

/**
 * 取选区蒙版对齐到目标画布后的像素数据。
 *
 * 蒙版是文档坐标系的，目标画布可能因为图层被移动/撑大而尺寸不同、原点不在文档 (0,0)。
 * 这种情况要按 origin 平移贴过去，**不能缩放**——缩放会把选区拉变形，
 * 选中的位置就整体跑偏了。origin 是图层在文档里的位置（即 bounds.x/y）。
 */
function maskAlpha(
  mask: HTMLCanvasElement,
  width: number,
  height: number,
  origin: Point,
): Uint8ClampedArray {
  if (mask.width === width && mask.height === height && origin.x === 0 && origin.y === 0) {
    return ctx2d(mask).getImageData(0, 0, width, height).data;
  }
  // 画完立刻就读，这张画布存在的唯一目的就是被 getImageData
  const aligned = createReadbackCanvas(width, height);
  ctx2d(aligned).drawImage(mask, -origin.x, -origin.y);
  return ctx2d(aligned).getImageData(0, 0, width, height).data;
}
