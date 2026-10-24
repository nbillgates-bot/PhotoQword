/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { renderViewport } from './viewRenderer';
import { RASTER_BLEED } from './viewCompositor';
import { createCanvas, ctx2d } from './canvasUtils';
import type { BlendMode, Layer } from '../types';

const DOC_W = 400;
const DOC_H = 300;

/** 一张纯色图层。canvas 尺寸由 bounds 推出，与真实文档的不变量一致 */
function solid(id: string, color: string, over: Partial<Layer> = {}): Layer {
  const bounds = over.bounds ?? { x: 0, y: 0, width: DOC_W, height: DOC_H };
  const canvas = createCanvas(bounds.width, bounds.height);
  const context = ctx2d(canvas);
  context.fillStyle = color;
  context.fillRect(0, 0, bounds.width, bounds.height);
  return {
    id,
    name: id,
    type: 'raster',
    visible: true,
    opacity: 100,
    blendMode: 'normal' as BlendMode,
    canvas,
    ...over,
    bounds,
  } as Layer;
}

/** 渲染一帧，返回主画布与取色函数 */
function render(layers: Layer[], over: Partial<Parameters<typeof renderViewport>[0]> = {}) {
  const canvas = document.createElement('canvas');
  const stats = renderViewport({
    canvas,
    layers,
    docWidth: DOC_W,
    docHeight: DOC_H,
    viewportWidth: 800,
    viewportHeight: 600,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
    ...over,
  });
  const context = ctx2d(canvas);
  context.setTransform(1, 0, 0, 1, 0, 0);
  const at = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
  return { stats, at, canvas };
}

/**
 * 文档在视口里的原点。
 *
 * 文档比视口小时居中，所以文档 (0,0) 落在视口的这个位置。
 * 测试要按这个偏移换算采样点。
 */
const ORIGIN_X = (800 - DOC_W) / 2;
const ORIGIN_Y = (600 - DOC_H) / 2;

describe('renderViewport', () => {
  it('画布尺寸跟视口走，不跟文档走', () => {
    const { stats } = render([solid('a', '#ff0000')], { docWidth: 790, docHeight: 16041 });
    expect(stats.viewWidth).toBe(800);
    expect(stats.viewHeight).toBe(600);
  });

  it('画得出内容，统计里记了画了几层', () => {
    const { stats, at } = render([solid('a', '#ff0000')]);
    expect(stats.painted).toBe(1);
    expect(at(ORIGIN_X + 10, ORIGIN_Y + 10)).toEqual([255, 0, 0, 255]);
  });

  it('dpr 2 时画布翻倍，scale 跟着翻', () => {
    const { stats } = render([solid('a', '#ff0000')], { dpr: 2 });
    expect(stats.viewWidth).toBe(1600);
    expect(stats.viewHeight).toBe(1200);
    expect(stats.scale).toBe(2);
  });

  it('隐藏的图层不画', () => {
    const { stats } = render([solid('a', '#ff0000', { visible: false })]);
    expect(stats.painted).toBe(0);
    expect(stats.culled).toBe(1);
  });

  /*
   * 画布外一律不显示，这是 PS 的行为：图层拖出画布后那部分就看不见了，
   * 只有打开「图层边缘」才能看出内容还在。
   *
   * 视口画布比文档大（文档 400×300 摆在 800×600 的视口里），所以文档外
   * 那一圈是真的可画区域，不裁就会露出来。
   */
  describe('画布外不显示', () => {
    it('比文档大的图层，超出的部分不显示', () => {
      // 图层从 (-100,-100) 开始，比文档四周各多出 100
      const layer = solid('big', '#ff0000', {
        bounds: { x: -100, y: -100, width: DOC_W + 200, height: DOC_H + 200 },
      });
      const { at } = render([layer]);

      // 文档内看得见
      expect(at(ORIGIN_X + 10, ORIGIN_Y + 10)).toEqual([255, 0, 0, 255]);
      // 文档左上角外 20px 看不见
      expect(at(ORIGIN_X - 20, ORIGIN_Y - 20)).toEqual([0, 0, 0, 0]);
      // 文档右下角外也看不见
      expect(at(ORIGIN_X + DOC_W + 20, ORIGIN_Y + DOC_H + 20)).toEqual([0, 0, 0, 0]);
    });

    it('整个被拖到文档外的图层，一个像素都不显示', () => {
      const layer = solid('out', '#ff0000', {
        bounds: { x: DOC_W + 50, y: 0, width: 100, height: 100 },
      });
      const { stats, at } = render([layer]);
      // 落在文档外，连算都不用算
      expect(stats.painted).toBe(0);
      expect(at(ORIGIN_X + DOC_W + 60, ORIGIN_Y + 10)).toEqual([0, 0, 0, 0]);
    });

    it('一半在文档内的图层，只显示文档内那一半', () => {
      const layer = solid('half', '#00ff00', {
        bounds: { x: DOC_W - 50, y: 100, width: 100, height: 50 },
      });
      const { stats, at } = render([layer]);
      expect(stats.painted).toBe(1);
      // 文档内那一半
      expect(at(ORIGIN_X + DOC_W - 25, ORIGIN_Y + 110)).toEqual([0, 255, 0, 255]);
      // 越过文档右边界的那一半
      expect(at(ORIGIN_X + DOC_W + 25, ORIGIN_Y + 110)).toEqual([0, 0, 0, 0]);
    });

    it('负坐标的图层同样被裁', () => {
      const layer = solid('neg', '#0000ff', {
        bounds: { x: -80, y: 50, width: 100, height: 50 },
      });
      const { at } = render([layer]);
      expect(at(ORIGIN_X + 10, ORIGIN_Y + 60)).toEqual([0, 0, 255, 255]);
      expect(at(ORIGIN_X - 40, ORIGIN_Y + 60)).toEqual([0, 0, 0, 0]);
    });
  });

  describe('视口裁剪', () => {
    /*
     * pan 为 0 时视口看的是文档**中心**，不是左上角：文档放大后比视口大，
     * documentOrigin 会把它居中。zoom=4 下视口 800×600 覆盖文档
     * 200×150 那么大一块，以 (200,150) 为中心，即约 (100,75)~(300,225)。
     */
    it('放大后视口外的图层被裁掉', () => {
      const inside = solid('in', '#ff0000', {
        bounds: { x: 180, y: 130, width: 40, height: 40 },
      });
      const outside = solid('out', '#00ff00', {
        bounds: { x: 0, y: 0, width: 40, height: 40 },
      });
      const { stats } = render([inside, outside], { zoom: 4, panX: 0, panY: 0 });
      expect(stats.painted).toBe(1);
      expect(stats.culled).toBe(1);
    });

    it('文档整个被平移出视口时一层都不画，且不报错', () => {
      const { stats } = render([solid('a', '#ff0000')], { zoom: 4, panX: -100000 });
      expect(stats.painted).toBe(0);
    });
  });

  it('没有图层时不报错，画布仍然是视口尺寸', () => {
    const { stats } = render([]);
    expect(stats.painted).toBe(0);
    expect(stats.viewWidth).toBe(800);
  });

  it('totalMs 是个非负数', () => {
    const { stats } = render([solid('a', '#ff0000')]);
    expect(stats.totalMs).toBeGreaterThanOrEqual(0);
    expect(Number.isNaN(stats.totalMs)).toBe(false);
  });

  /*
   * buffers / readbackPixels 是诊断用的开销计数。它们要能回答
   * 「这一帧慢在中间缓冲分配还是在画布读回」，所以断言的是
   * 「快速路径一分钱不花、需要缓冲的路径确实记上了账」这个契约，
   * 不断言具体数值——数值会随合成实现调整而变。
   */
  describe('开销计数', () => {
    it('普通图层走快速路径，不分配缓冲也不读回', () => {
      const { stats } = render([solid('a', '#ff0000'), solid('b', '#00ff00')]);
      expect(stats.painted).toBe(2);
      expect(stats.buffers).toBe(0);
      expect(stats.readbackPixels).toBe(0);
    });

    /*
     * 用 linear-burn：它在 blendModes 的 CUSTOM 表里，canvas 没有对应的
     * globalCompositeOperation，必须手写混合。别用 color-burn——
     * 那个是原生的，会走快速路径，测不到这条分支。
     */
    it('非原生混合模式要摊平到缓冲并读回', () => {
      const layer = solid('hand', '#ff0000', { blendMode: 'linear-burn' as BlendMode });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      expect(stats.buffers).toBeGreaterThan(0);
      expect(stats.readbackPixels).toBeGreaterThan(0);
    });

    it('原生混合模式仍走快速路径，不花缓冲', () => {
      const layer = solid('native', '#ff0000', { blendMode: 'color-burn' as BlendMode });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      expect(stats.painted).toBe(2);
      expect(stats.buffers).toBe(0);
    });

    it('每帧从零起算，不跨帧累加', () => {
      const layer = solid('hand', '#ff0000', { blendMode: 'linear-burn' as BlendMode });
      const first = render([layer]).stats;
      const second = render([layer]).stats;
      expect(second.buffers).toBe(first.buffers);
      expect(second.readbackPixels).toBe(first.readbackPixels);
    });

    /*
     * willReadFrequently 会让画布退出 GPU 光栅化,只有真要 getImageData 才划得来。
     * 016.psd 那一帧 82 张缓冲全标了可读回、而读回为 0,整帧合成白白跑在软件光栅器上。
     * 所以这里锁死契约:不读的路径一张可读回缓冲都不许要。
     */
    it('只有蒙版、混合模式原生时,缓冲不许声明可读回', () => {
      const mask = createCanvas(DOC_W, DOC_H);
      const maskCtx = ctx2d(mask);
      maskCtx.fillStyle = '#ffffff';
      maskCtx.fillRect(0, 0, DOC_W, DOC_H);
      const layer = solid('masked', '#ff0000', { mask });

      const { stats } = render([layer]);
      expect(stats.buffers).toBeGreaterThan(0);
      expect(stats.readableBuffers).toBe(0);
      expect(stats.readbackPixels).toBe(0);
    });

    it('手写混合确实要读,这时才允许声明可读回', () => {
      const layer = solid('hand', '#ff0000', { blendMode: 'linear-burn' as BlendMode });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      expect(stats.readableBuffers).toBeGreaterThan(0);
      // 声明了就得真的读,否则等于白付软件光栅的代价
      expect(stats.readbackPixels).toBeGreaterThan(0);
    });

    it('可读回缓冲数不会超过缓冲总数', () => {
      const layer = solid('hand', '#ff0000', { blendMode: 'linear-burn' as BlendMode });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      expect(stats.readableBuffers).toBeLessThanOrEqual(stats.buffers);
    });

    it('被裁掉的图层不产生任何开销', () => {
      const layer = solid('out', '#ff0000', {
        blendMode: 'linear-burn' as BlendMode,
        bounds: { x: DOC_W + 50, y: 0, width: 100, height: 100 },
      });
      const { stats } = render([layer]);
      expect(stats.painted).toBe(0);
      expect(stats.buffers).toBe(0);
      expect(stats.readableBuffers).toBe(0);
      expect(stats.readbackPixels).toBe(0);
    });
  });

  /*
   * 缓冲尺寸。016.psd 那 4448ms 的成因:82 张缓冲一律开整幅视口 4.05Mpx,
   * 合计 332Mpx,占整帧 97~99%。改成按内容范围开之后,一个小图层的缓冲
   * 不该再跟视口一样大——这一组用像素数把它钉死,免得以后又退回去。
   */
  describe('缓冲尺寸', () => {
    const VIEW_PIXELS = 800 * 600;

    /*
     * 每张缓冲要在 bounds 外留 RASTER_BLEED 圈边：drawImage 开着平滑采样时
     * 会往几何边界外溢出约一个像素，缓冲刚好卡在 box 上会把那一圈切掉，
     * 缩略视图下整层消失（见 viewCompositor 里的说明）。
     * 所以期望值按公式写，不写死数字——把 bleed 算进来，box 本身错了照样能抓到。
     */
    const boxed = (width: number, height: number) =>
      (width + RASTER_BLEED * 2) * (height + RASTER_BLEED * 2);

    it('小图层的缓冲按 bounds 开，远小于整幅视口', () => {
      const layer = solid('small', '#ff0000', {
        blendMode: 'linear-burn' as BlendMode,
        bounds: { x: 10, y: 10, width: 40, height: 30 },
      });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      expect(stats.buffers).toBe(1);
      expect(stats.bufferPixels).toBe(boxed(40, 30));
      expect(stats.bufferPixels).toBeLessThan(VIEW_PIXELS / 100);
    });

    it('读回量也跟着缩到 bounds，不再读整幅视口', () => {
      const layer = solid('small', '#ff0000', {
        blendMode: 'linear-burn' as BlendMode,
        bounds: { x: 10, y: 10, width: 40, height: 30 },
      });
      const { stats } = render([solid('base', '#0000ff'), layer]);
      // 手写混合读两幅(backdrop + source)
      expect(stats.readbackPixels).toBe(boxed(40, 30) * 2);
    });

    it('图层比视口大时缓冲也不会超过视口', () => {
      const layer = solid('huge', '#ff0000', {
        blendMode: 'linear-burn' as BlendMode,
        bounds: { x: -2000, y: -2000, width: 6000, height: 6000 },
      });
      const { stats } = render([layer]);
      expect(stats.bufferPixels).toBeLessThanOrEqual(VIEW_PIXELS);
    });

    it('多层各自按自己的范围开，不是每层一份视口', () => {
      const layers = [0, 1, 2, 3].map((i) =>
        solid(`l${i}`, '#ff0000', {
          blendMode: 'linear-burn' as BlendMode,
          bounds: { x: i * 20, y: 0, width: 20, height: 20 },
        }),
      );
      const { stats } = render(layers);
      expect(stats.buffers).toBe(4);
      expect(stats.bufferPixels).toBe(4 * boxed(20, 20));
    });
  });

  /*
   * 缓冲缩小之后最可能出的 bug 是「内容整体偏移一个 box 的量」或者
   * 「边缘被缓冲裁掉」。上面那组只证明了缓冲变小，这一组证明画面没变。
   */
  describe('局部缓冲下的落点', () => {
    /** 白色蒙版：只是为了逼出缓冲路径，不改变可见结果 */
    function opaqueMask(width: number, height: number) {
      const mask = createCanvas(width, height);
      const context = ctx2d(mask);
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      return mask;
    }

    it('带蒙版的偏移图层落在 bounds 指定的位置，不跑偏', () => {
      const layer = solid('masked', '#ff0000', {
        bounds: { x: 120, y: 90, width: 60, height: 40 },
        mask: opaqueMask(DOC_W, DOC_H),
      });
      const { stats, at } = render([layer]);
      expect(stats.buffers).toBe(1);
      // 四角内侧都得是红的
      expect(at(ORIGIN_X + 121, ORIGIN_Y + 91)).toEqual([255, 0, 0, 255]);
      expect(at(ORIGIN_X + 178, ORIGIN_Y + 128)).toEqual([255, 0, 0, 255]);
      // bounds 外一律空
      expect(at(ORIGIN_X + 118, ORIGIN_Y + 91)).toEqual([0, 0, 0, 0]);
      expect(at(ORIGIN_X + 121, ORIGIN_Y + 88)).toEqual([0, 0, 0, 0]);
      expect(at(ORIGIN_X + 182, ORIGIN_Y + 132)).toEqual([0, 0, 0, 0]);
    });

    it('蒙版按 bounds 对齐，缓冲偏移不影响遮挡范围', () => {
      /*
       * 蒙版跟画布同尺寸、对齐到 bounds（见 mask.ts 的 maskGeometry）。
       * 这条原先按「蒙版是文档坐标」写，那个约定会让 PSD 里 bounds 不在原点的
       * 图层整层消失，已经改掉。
       *
       * 100×50 的图层配同尺寸蒙版、左半白右半黑，
       * 所以遮挡边界落在图层自己的中线，也就是文档 x = 150 + 50 = 200。
       */
      const mask = createCanvas(100, 50);
      const maskCtx = ctx2d(mask);
      maskCtx.fillStyle = '#ffffff';
      maskCtx.fillRect(0, 0, 50, 50);
      const layer = solid('halfMasked', '#ff0000', {
        bounds: { x: 150, y: 100, width: 100, height: 50 },
        mask,
      });
      const { at } = render([layer]);
      expect(at(ORIGIN_X + 190, ORIGIN_Y + 120)).toEqual([255, 0, 0, 255]);
      expect(at(ORIGIN_X + 210, ORIGIN_Y + 120)).toEqual([0, 0, 0, 0]);
    });

    it('手写混合只改缓冲覆盖的那一块，块外保持下方原样', () => {
      // linear-dodge = 相加，红 + 蓝 = 品红，好判断
      const base = solid('base', '#0000ff');
      const top = solid('top', '#ff0000', {
        blendMode: 'linear-dodge' as BlendMode,
        bounds: { x: 100, y: 80, width: 50, height: 50 },
      });
      const { at } = render([base, top]);
      expect(at(ORIGIN_X + 120, ORIGIN_Y + 100)).toEqual([255, 0, 255, 255]);
      // 缓冲之外只剩基底
      expect(at(ORIGIN_X + 20, ORIGIN_Y + 20)).toEqual([0, 0, 255, 255]);
      expect(at(ORIGIN_X + 160, ORIGIN_Y + 100)).toEqual([0, 0, 255, 255]);
    });

    it('缩放和平移之后落点依然对得上', () => {
      const layer = solid('masked', '#ff0000', {
        bounds: { x: 100, y: 100, width: 40, height: 40 },
        mask: opaqueMask(DOC_W, DOC_H),
      });
      // zoom=2、文档 400×300 放大成 800×600 刚好铺满视口，原点回到 (0,0)
      const { at } = render([layer], { zoom: 2 });
      expect(at(2 * 110, 2 * 110)).toEqual([255, 0, 0, 255]);
      expect(at(2 * 90, 2 * 110)).toEqual([0, 0, 0, 0]);
      expect(at(2 * 150, 2 * 110)).toEqual([0, 0, 0, 0]);
    });
  });
});
