/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 局部缓冲的正确性契约：把中间缓冲缩到节点可见范围后，结果必须和用全视口缓冲
 * 一致（容差见 TOL）。
 *
 * 为什么不跟文档路径对照：文档路径是先在文档尺寸合成再缩放，缩放的重采样噪声
 * 会盖住 box 差一像素这种真问题。同一条视口路径跑两遍，唯一变量就是缓冲尺寸，
 * 任何超出容差的差异都是 box 算错了。
 *
 * 为什么必须测非整数 scale：box 用 floor 起点 / ceil 终点。scale=1 时文档像素和
 * 视口像素一一对应，floor/ceil 都是恒等，box 永远刚好；scale=0.109 时一个视口
 * 像素跨九个文档像素，起止取整的方向、蒙版与缓冲的对齐、组的并集边界才会真正
 * 被考验——用户看到「图层丢了」正是在这个量级的缩放下。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TOL, bufferDiff, makeLayer as layer } from './viewBufferHarness';
import type { Layer } from '../types';

/** 用户日志里出现过的缩放档位，含 016.psd 那张长图的整体视图 0.109 */
const SCALES = [0.109, 0.25, 0.333, 0.5, 0.667, 0.942, 1, 1.5, 2];
beforeEach(() => {
  (globalThis as { __qwordFullViewportBuffers?: boolean }).__qwordFullViewportBuffers = false;
});

describe('局部缓冲与全视口缓冲逐像素一致', () => {
  it('隔离组里的多个条带，跨全部缩放档位', () => {
    const layers = [
      layer({ id: 'g', type: 'group', x: 0, y: 0, width: 1, height: 1, opacity: 60 }),
      layer({ id: 'a', parentId: 'g', x: 40, y: 100, width: 700, height: 300, color: '#ff0000' }),
      layer({ id: 'b', parentId: 'g', x: 40, y: 1800, width: 700, height: 300, color: '#00ff00' }),
      layer({ id: 'c', parentId: 'g', x: 40, y: 3600, width: 700, height: 300, color: '#0000ff' }),
    ];
    for (const zoom of SCALES) {
      const { max, at } = bufferDiff(layers, zoom, 0);
      expect(max, `zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('带蒙版的图层，跨全部缩放档位', () => {
    const layers = [
      layer({ id: 'base', x: 0, y: 0, width: 790, height: 4000, color: '#222222' }),
      layer({ id: 'm', x: 137, y: 913, width: 411, height: 277, color: '#ff8800', mask: true }),
    ];
    for (const zoom of SCALES) {
      const { max, at } = bufferDiff(layers, zoom, 0);
      expect(max, `zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('组自己带蒙版，跨全部缩放档位', () => {
    const layers = [
      layer({ id: 'g', type: 'group', x: 137, y: 913, width: 411, height: 277, mask: true }),
      layer({ id: 'gc', parentId: 'g', x: 137, y: 913, width: 411, height: 277, color: '#00ccff' }),
    ];
    for (const zoom of SCALES) {
      const { max, at } = bufferDiff(layers, zoom, 0);
      expect(max, `zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('剪贴组，成员大于基底，跨全部缩放档位', () => {
    const layers = [
      layer({ id: 'base', x: 200, y: 1000, width: 300, height: 200, color: '#ffffff' }),
      layer({ id: 'mem', x: 100, y: 900, width: 600, height: 500, color: '#ff00ff', clipped: true }),
    ];
    for (const zoom of SCALES) {
      const { max, at } = bufferDiff(layers, zoom, 0);
      expect(max, `zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
    }
  });

  /*
   * 这一组是「图层丢了」的真实形态：016.psd 里大量文字行只有几个文档像素高,
   * 在整体视图(scale 0.109)下不足一个视口像素。这种图层的全部落点都是平滑
   * 采样的边缘覆盖,缓冲不留边就整层消失——不是淡一点,是没有。
   */
  it('亚像素高度的薄图层带蒙版，缩略视图下不能丢', () => {
    for (const height of [1, 2, 3, 5, 8, 13]) {
      const layers = [
        layer({ id: 'bg', x: 0, y: 0, width: 790, height: 4000, color: '#111111' }),
        layer({ id: 't', x: 137, y: 913, width: 600, height, color: '#ffcc00', mask: true }),
      ];
      for (const zoom of [0.109, 0.2, 0.35]) {
        const { max, at } = bufferDiff(layers, zoom, 0);
        expect(max, `height=${height} zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
      }
    }
  });

  it('隔离组里叠一摞薄图层，缩略视图下不能丢', () => {
    const layers: Layer[] = [
      layer({ id: 'g', type: 'group', x: 0, y: 0, width: 1, height: 1, opacity: 85 }),
    ];
    for (let i = 0; i < 12; i += 1) {
      layers.push(
        layer({
          id: `t${i}`,
          parentId: 'g',
          x: 100 + i,
          y: 200 + i * 47,
          width: 500,
          height: 6,
          color: i % 2 ? '#ff0000' : '#00ff00',
        }),
      );
    }
    for (const zoom of [0.109, 0.15, 0.22, 0.4]) {
      const { max, at } = bufferDiff(layers, zoom, 0);
      expect(max, `zoom=${zoom} ${at}`).toBeLessThanOrEqual(TOL);
    }
  });

  it('平移到文档中段，缓冲被视口边界裁一半', () => {
    const layers = [
      layer({ id: 'g', type: 'group', x: 0, y: 0, width: 1, height: 1, opacity: 75 }),
      layer({ id: 'a', parentId: 'g', x: 40, y: 1700, width: 700, height: 600, color: '#ff0000', mask: true }),
    ];
    for (const zoom of SCALES) {
      for (const panY of [-1750, -1900, -2100]) {
        const { max, at } = bufferDiff(layers, zoom, panY);
        expect(max, `zoom=${zoom} panY=${panY} ${at}`).toBeLessThanOrEqual(TOL);
      }
    }
  });
});
