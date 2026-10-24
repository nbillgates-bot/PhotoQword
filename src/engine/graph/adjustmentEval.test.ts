/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, it, expect } from 'vitest';
import { evaluateGraph } from './evaluator';
import { createCanvas, ctx2d } from '../canvasUtils';
import { applyAdjust } from '../adjustments';
import type { LayerGraph } from '../../types/graph';

describe('调整节点求值', () => {
  it('亮度/对比度调整节点能改变下方画面', () => {
    // 底层：一个红色方块
    const baseCanvas = createCanvas(100, 100);
    const baseCtx = ctx2d(baseCanvas);
    baseCtx.fillStyle = '#ff0000';
    baseCtx.fillRect(20, 20, 60, 60);

    const canvases = new Map<string, HTMLCanvasElement>();
    canvases.set('surf:base', baseCanvas);

    const graph: LayerGraph = {
      nodes: {
        base: {
          id: 'base',
          name: '底层',
          kind: 'pixel',
          surfaceId: 'surf:base',
          visible: true,
          opacity: 100,
          blendMode: 'normal',
          parentId: null,
          bounds: { x: 0, y: 0, width: 100, height: 100 },
        },
        adjust: {
          id: 'adjust',
          name: '亮度+100',
          kind: 'adjustment',
          adjustment: 'brightness-contrast',
          params: { brightness: 100, contrast: 0 },
          visible: true,
          opacity: 100,
          blendMode: 'normal',
          parentId: null,
        },
      },
      order: ['base', 'adjust'],
    };

    const result = evaluateGraph(graph, {
      width: 100,
      height: 100,
      resolver: {
        pixels: (node) => canvases.get(node.kind === 'pixel' ? node.surfaceId : '') ?? null,
        mask: () => null,
      },
      applyAdjustment: (image, kind, params) => {
        if (kind === 'brightness-contrast') {
          applyAdjust(image, {
            brightness: (params.brightness as number) ?? 0,
            contrast: (params.contrast as number) ?? 0,
            saturation: 0,
            hue: 0,
            exposure: 0,
            temperature: 0,
            vibrance: 0,
          });
        }
      },
    });

    // 取中心点像素，应该比原来的红色亮（原来是 255,0,0，加了亮度应该接近 255,100,100）
    const pixel = ctx2d(result).getImageData(50, 50, 1, 1).data;
    expect(pixel[0]).toBeGreaterThan(250); // R 仍接近 255
    expect(pixel[1]).toBeGreaterThan(90); // G 从 0 变亮到接近 100
    expect(pixel[2]).toBeGreaterThan(90); // B 从 0 变亮到接近 100
  });
});
