/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 随机图层树上的局部缓冲对照。
 *
 * 手写用例只能覆盖「我想得到的结构」，而局部缓冲的坑恰恰藏在想不到的组合里：
 * 带蒙版的层套在带混合模式的组里、剪贴组的基底本身是个隔离组、组里混着不可见
 * 的层……随机生成结构把这些组合枚举出来，再拿同一条路径的全视口缓冲当基准。
 *
 * 只在非整数 scale 上跑：scale=1 时 floor/ceil 是恒等，box 永远刚好，测不出问题。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bufferDiff, makeLayer } from './viewBufferHarness';
import type { BlendMode, Layer } from '../types';

/*
 * 判据是两条，不是一条：
 *
 * - CHANNEL_MAX：单个像素允许的最大预乘差。手写混合（color-burn / linear-burn 等）
 *   要 getImageData 逐级量化到 8 位，而两条路径的中间缓冲尺寸不同，
 *   嵌套五层再叠上 15% / 30% 的组不透明度，末位差会攒到 2。
 *   color-burn 的公式在源接近 0 时本身就极敏感（255-(255-b)*255/s），这是数学性质。
 * - SPREAD_MAX：允许超差的像素**个数**。这一条才是真正的把关：
 *   box 算错是成片的（少则一整行边、多则整层消失，动辄上千像素），
 *   末位舍入是零星的。放宽单像素差值而收紧扩散范围，抓 bug 的能力不降反升。
 *
 * 确定性用例（viewBufferParity.test.ts）仍然按 TOL=1 卡，结构可控的地方不放松。
 */
const CHANNEL_MAX = 2;
const SPREAD_MAX = 8;

/** 定点线性同余，保证复现 */
function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const BLENDS: BlendMode[] = ['normal', 'multiply', 'screen', 'linear-burn', 'color-burn', 'overlay'];
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffcc00', '#888888'];

interface Spec {
  kind: 'raster' | 'group';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  blendMode: BlendMode;
  opacity: number;
  mask: boolean;
  clipped: boolean;
  children: Spec[];
}

function makeSpec(next: () => number, depth: number): Spec {
  const isGroup = depth < 2 && next() < 0.4;
  // 故意混进「只有几个文档像素高」的薄层——缩略视图下它们不足一个视口像素，
  // 是最容易被缓冲边界切光的形态
  const thin = next() < 0.4;
  const spec: Spec = {
    kind: isGroup ? 'group' : 'raster',
    x: Math.floor(next() * 700),
    y: Math.floor(next() * 3800),
    width: 20 + Math.floor(next() * 600),
    height: thin ? 1 + Math.floor(next() * 12) : 20 + Math.floor(next() * 500),
    color: COLORS[Math.floor(next() * COLORS.length)],
    blendMode: BLENDS[Math.floor(next() * BLENDS.length)],
    opacity: next() < 0.35 ? 10 + Math.floor(next() * 85) : 100,
    mask: next() < 0.35,
    clipped: next() < 0.3,
    children: [],
  };
  if (isGroup) {
    const count = 1 + Math.floor(next() * 3);
    for (let i = 0; i < count; i += 1) spec.children.push(makeSpec(next, depth + 1));
  }
  return spec;
}

/** 把 Spec 树摊成扁平的 Layer[]（父在前，子在后，与 store 的顺序一致） */
function toLayers(specs: Spec[]): Layer[] {
  const layers: Layer[] = [];
  let seq = 0;
  const walk = (spec: Spec, parentId: string | null): void => {
    const id = `L${seq++}`;
    layers.push(
      makeLayer({
        id,
        type: spec.kind,
        parentId,
        x: spec.x,
        y: spec.y,
        width: spec.width,
        height: spec.height,
        color: spec.color,
        // 组用 pass-through 之外的混合模式才会被隔离，正好覆盖两条分支
        blendMode: spec.blendMode,
        opacity: spec.opacity,
        mask: spec.mask,
        clipped: spec.clipped,
      }),
    );
    for (const child of spec.children) walk(child, id);
  };
  for (const spec of specs) walk(spec, null);
  return layers;
}

beforeEach(() => {
  (globalThis as { __qwordFullViewportBuffers?: boolean }).__qwordFullViewportBuffers = false;
});

// 这个用例要把 120 棵树各渲两遍，实测 6~7s，超时靠 vitest.config.ts 的 testTimeout
describe('随机结构下的局部缓冲对照', () => {
  it('120 个随机图层树，局部缓冲与全视口缓冲一致', () => {
    const failures: string[] = [];
    for (let seed = 1; seed <= 120; seed += 1) {
      const next = rng(seed);
      const count = 1 + Math.floor(next() * 4);
      const specs: Spec[] = [];
      for (let i = 0; i < count; i += 1) specs.push(makeSpec(next, 0));
      const layers = toLayers(specs);
      const zoom = [0.109, 0.17, 0.28, 0.42, 0.63, 0.87, 1.3][seed % 7];

      const { max, at, over } = bufferDiff(layers, zoom, 0);
      if (max > CHANNEL_MAX || over > SPREAD_MAX) {
        failures.push(
          `seed=${seed} zoom=${zoom} max=${max} 超差像素=${over} ${at}\n结构：${JSON.stringify(specs)}`,
        );
        if (failures.length >= 3) break;
      }
    }
    expect(failures.join('\n\n')).toBe('');
  });
});
