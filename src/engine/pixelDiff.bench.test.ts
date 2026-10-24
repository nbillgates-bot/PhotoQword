/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { diffBounds } from './pixelDiff';
import { createCanvas, ctx2d } from './canvasUtils';

/**
 * 差分扫描的耗时下限验证。
 * 历史记录每次提交都要扫一遍图层，这个开销直接决定笔刷抬手后卡不卡，
 * 所以用一个宽松但有意义的上限把它钉住：回归到"整幅图逐字节比"会立刻超。
 */
function readAllOf(width: number, height: number, paint?: (c: CanvasRenderingContext2D) => void) {
  const canvas = createCanvas(width, height);
  const context = ctx2d(canvas);
  context.fillStyle = '#808080';
  context.fillRect(0, 0, width, height);
  paint?.(context);
  return context.getImageData(0, 0, width, height);
}

describe('diffBounds 性能', () => {
  it('4000x3000 全图无变化时的扫描耗时在可接受范围', () => {
    const before = readAllOf(4000, 3000);
    const after = readAllOf(4000, 3000);
    const start = performance.now();
    const result = diffBounds(before, after);
    const cost = performance.now() - start;
    expect(result).toBeNull();
    // 无变化是最坏情况：必须扫完每一个字才能确认没变
    expect(cost).toBeLessThan(300);
  });

  it('4000x3000 局部小改动时应快速收敛', () => {
    const before = readAllOf(4000, 3000);
    const after = readAllOf(4000, 3000, (c) => {
      c.fillStyle = '#ff0000';
      c.fillRect(1000, 1200, 200, 150);
    });
    const start = performance.now();
    const result = diffBounds(before, after);
    const cost = performance.now() - start;
    expect(result).toEqual({ x: 1000, y: 1200, width: 200, height: 150 });
    expect(cost).toBeLessThan(300);
  });
});
