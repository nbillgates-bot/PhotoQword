/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import {
  clipToDocument,
  createViewBufferAt,
  docRectToViewRect,
  fullViewBox,
  makeViewportContext,
  padViewRect,
  prepareViewportCanvas,
  resetCounters,
  counters,
  subViewport,
  unionViewRect,
} from './viewportRender';
import { ctx2d } from './canvasUtils';

/** 一份典型参数：文档比视口大，居中无偏移 */
function ctx(over: Partial<Parameters<typeof makeViewportContext>[0]> = {}) {
  return makeViewportContext({
    viewportWidth: 800,
    viewportHeight: 600,
    docWidth: 400,
    docHeight: 300,
    zoom: 1,
    panX: 0,
    panY: 0,
    dpr: 1,
    ...over,
  });
}

describe('makeViewportContext', () => {
  it('画布尺寸跟视口走，与文档尺寸无关', () => {
    // 这是整套优化的前提：长图文档不该让画布跟着长
    const view = ctx({ docWidth: 790, docHeight: 16041 });
    expect(view.viewWidth).toBe(800);
    expect(view.viewHeight).toBe(600);
  });

  it('文档比视口小时居中摆放', () => {
    const view = ctx();
    expect(view.originX).toBe((800 - 400) / 2);
    expect(view.originY).toBe((600 - 300) / 2);
  });

  it('缩放乘进 scale 和 origin', () => {
    const view = ctx({ zoom: 2 });
    expect(view.scale).toBe(2);
    expect(view.originX).toBe((800 - 400 * 2) / 2);
  });

  it('pan 叠加在居中之后', () => {
    const view = ctx({ panX: 30, panY: -20 });
    expect(view.originX).toBe((800 - 400) / 2 + 30);
    expect(view.originY).toBe((600 - 300) / 2 - 20);
  });

  it('dpr 同时放大画布尺寸、scale 和 origin', () => {
    const one = ctx({ dpr: 1 });
    const two = ctx({ dpr: 2 });
    expect(two.viewWidth).toBe(one.viewWidth * 2);
    expect(two.scale).toBe(one.scale * 2);
    expect(two.originX).toBe(one.originX * 2);
  });

  it('docRect 覆盖视口能看到的文档范围', () => {
    // zoom=1、文档居中时，视口比文档大，可见范围应当左右各溢出 200
    const view = ctx();
    expect(view.docRect.x).toBe(-200);
    expect(view.docRect.width).toBe(800);
  });

  it('放大后 docRect 只剩文档的一小块', () => {
    const view = ctx({ zoom: 4 });
    expect(view.docRect.width).toBe(200);
    expect(view.docRect.height).toBe(150);
  });

  it('zoom 为 0 时 docRect 退化成整个文档，宁可不裁也不裁错', () => {
    const view = ctx({ zoom: 0 });
    expect(view.docRect).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('视口尺寸为 0 时画布至少 1 像素，不能建 0 尺寸画布', () => {
    const view = ctx({ viewportWidth: 0, viewportHeight: 0 });
    expect(view.viewWidth).toBeGreaterThanOrEqual(1);
    expect(view.viewHeight).toBeGreaterThanOrEqual(1);
  });
});

/*
 * 重采样质量分两档：手势中 'low'，静止 'high'。
 * 'high' 在缩小倍率下会走逐级降采样，几十个图层叠起来足够掉帧；
 * 而静止画面必须是高质量的，否则缩略视图一直发虚。
 */
describe('重采样质量分档', () => {
  it('默认按静止画质，用 high', () => {
    expect(ctx().smoothingQuality).toBe('high');
  });

  it('交互中降到 low', () => {
    expect(ctx({ interacting: true }).smoothingQuality).toBe('low');
  });

  it('装进上下文的质量档跟着 view 走', () => {
    const canvas = document.createElement('canvas');
    const moving = prepareViewportCanvas(canvas, ctx({ zoom: 0.4, interacting: true }));
    expect(moving.imageSmoothingEnabled).toBe(true);
    expect(moving.imageSmoothingQuality).toBe('low');

    const settled = prepareViewportCanvas(canvas, ctx({ zoom: 0.4 }));
    expect(settled.imageSmoothingQuality).toBe('high');
  });

  it('300% 以上一律关插值，与 PS 一致，交互与否都不影响', () => {
    const canvas = document.createElement('canvas');
    // scale = zoom * dpr，取 4 越过 3 这条线
    const moving = prepareViewportCanvas(canvas, ctx({ zoom: 4, interacting: true }));
    expect(moving.imageSmoothingEnabled).toBe(false);
    const settled = prepareViewportCanvas(canvas, ctx({ zoom: 4 }));
    expect(settled.imageSmoothingEnabled).toBe(false);
  });

  it('中间缓冲用与主画布相同的质量档', () => {
    // 一半 low 一半 high 会让组内外的边缘对不上
    const view = ctx({ zoom: 0.5, interacting: true });
    const buffer = createViewBufferAt(view, { x: 0, y: 0, width: 40, height: 40 });
    expect(ctx2d(buffer.canvas).imageSmoothingQuality).toBe('low');
  });

  it('子视口继承外层的质量档', () => {
    const view = ctx({ interacting: true });
    const sub = subViewport(view, { x: 10, y: 10, width: 40, height: 40 });
    expect(sub.smoothingQuality).toBe('low');
  });
});

describe('prepareViewportCanvas', () => {
  it('把画布调到视口尺寸并装上变换矩阵', () => {
    const canvas = document.createElement('canvas');
    const view = ctx({ zoom: 2, dpr: 1 });
    const context = prepareViewportCanvas(canvas, view);
    expect(canvas.width).toBe(view.viewWidth);
    expect(canvas.height).toBe(view.viewHeight);
    const m = context.getTransform();
    expect(m.a).toBe(2);
    expect(m.e).toBe(view.originX);
  });

  it('清屏清的是整张画布，不只是文档那块', () => {
    // 缩小时文档只占中间一小块，视口其余部分必须一起清掉，
    // 否则上一帧的蚂蚁线会挂在画布外侧
    const canvas = document.createElement('canvas');
    const view = ctx({ zoom: 0.5 });
    const context = prepareViewportCanvas(canvas, view);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, view.viewWidth, view.viewHeight);

    prepareViewportCanvas(canvas, view);
    const corner = ctx2d(canvas).getImageData(2, 2, 1, 1).data;
    expect(corner[3]).toBe(0);
  });

  it('尺寸没变时重复调用也能拿到干净画布', () => {
    const canvas = document.createElement('canvas');
    const view = ctx();
    const first = prepareViewportCanvas(canvas, view);
    first.fillStyle = '#00ff00';
    first.fillRect(0, 0, 10, 10);
    prepareViewportCanvas(canvas, view);
    const pixel = ctx2d(canvas).getImageData(
      Math.round(view.originX) + 2,
      Math.round(view.originY) + 2,
      1,
      1,
    ).data;
    expect(pixel[3]).toBe(0);
  });
});

describe('docRectToViewRect', () => {
  it('按 scale 和 origin 换算', () => {
    const view = ctx({ zoom: 2, dpr: 1 });
    const box = docRectToViewRect({ x: 10, y: 20, width: 30, height: 40 }, view)!;
    expect(box.x).toBe(Math.floor(10 * 2 + view.originX));
    expect(box.width).toBe(30 * 2);
  });

  it('超出视口的部分被夹掉', () => {
    const view = ctx();
    const box = docRectToViewRect({ x: -1000, y: -1000, width: 4000, height: 4000 }, view)!;
    expect(box.x).toBe(0);
    expect(box.y).toBe(0);
    expect(box.width).toBe(view.viewWidth);
    expect(box.height).toBe(view.viewHeight);
  });

  it('完全在视口外返回 null', () => {
    const view = ctx();
    expect(docRectToViewRect({ x: 100000, y: 0, width: 10, height: 10 }, view)).toBeNull();
  });

  it('宽高为 1 的矩形也至少占一个像素', () => {
    const view = ctx({ zoom: 0.25 });
    const box = docRectToViewRect({ x: 100, y: 100, width: 1, height: 1 }, view);
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(1);
  });
});

/*
 * 画布外一律不显示。
 *
 * 旧方案的画布本身就是文档尺寸，超出部分被画布边界天然裁掉；改成视口画布后
 * 文档外那片区域也是可画的，所以「图层被拖出画布」「图层比画布大」都会
 * 把画布外的内容显示出来。这一组守住裁剪补回来了。
 */
describe('clipToDocument', () => {
  /** 在视口画布上画一大片红色，返回取像素的函数 */
  function paintAll(view: ReturnType<typeof ctx>, clip: boolean) {
    const canvas = document.createElement('canvas');
    const context = prepareViewportCanvas(canvas, view);
    context.save();
    if (clip) clipToDocument(context, 400, 300);
    // 按文档坐标画一块远超文档范围的矩形
    context.fillStyle = '#ff0000';
    context.fillRect(-500, -500, 2000, 2000);
    context.restore();
    const raw = ctx2d(canvas);
    raw.setTransform(1, 0, 0, 1, 0, 0);
    return (x: number, y: number) => Array.from(raw.getImageData(x, y, 1, 1).data);
  }

  it('文档内画得上', () => {
    const view = ctx();
    const at = paintAll(view, true);
    // 文档(10,10) 在视口里的位置
    const x = Math.round(10 * view.scale + view.originX);
    const y = Math.round(10 * view.scale + view.originY);
    expect(at(x, y)).toEqual([255, 0, 0, 255]);
  });

  it('文档外画不上', () => {
    const view = ctx();
    const at = paintAll(view, true);
    // 文档左上角往外 10px，仍在视口内（文档比视口小，四周有留白）
    const x = Math.round(view.originX) - 10;
    const y = Math.round(view.originY) - 10;
    expect(at(x, y)).toEqual([0, 0, 0, 0]);
  });

  it('不裁的话文档外会显示出来（对照组，证明裁剪确实在起作用）', () => {
    const view = ctx();
    const at = paintAll(view, false);
    const x = Math.round(view.originX) - 10;
    const y = Math.round(view.originY) - 10;
    expect(at(x, y)).toEqual([255, 0, 0, 255]);
  });

  it('restore 之后裁剪失效，不会污染后续绘制', () => {
    const view = ctx();
    const canvas = document.createElement('canvas');
    const context = prepareViewportCanvas(canvas, view);
    context.save();
    clipToDocument(context, 400, 300);
    context.restore();

    context.fillStyle = '#00ff00';
    context.fillRect(-50, -50, 40, 40);
    const raw = ctx2d(canvas);
    raw.setTransform(1, 0, 0, 1, 0, 0);
    const x = Math.round(-30 * view.scale + view.originX);
    const y = Math.round(-30 * view.scale + view.originY);
    expect(Array.from(raw.getImageData(x, y, 1, 1).data)).toEqual([0, 255, 0, 255]);
  });
});

describe('unionViewRect', () => {
  it('并出能盖住两个框的最小框', () => {
    const box = unionViewRect({ x: 10, y: 20, width: 30, height: 40 }, { x: 5, y: 50, width: 10, height: 10 });
    expect(box).toEqual({ x: 5, y: 20, width: 35, height: 40 });
  });

  it('任一侧为 null 时返回另一侧，两侧都是 null 才返回 null', () => {
    const a = { x: 1, y: 2, width: 3, height: 4 };
    expect(unionViewRect(null, a)).toBe(a);
    expect(unionViewRect(a, null)).toBe(a);
    expect(unionViewRect(null, null)).toBeNull();
  });

  it('一个框完全包住另一个时结果就是大的那个', () => {
    const big = { x: 0, y: 0, width: 100, height: 100 };
    expect(unionViewRect(big, { x: 10, y: 10, width: 5, height: 5 })).toEqual(big);
  });
});

describe('padViewRect', () => {
  const view = ctx(); // 800×600 视口

  it('四边各留出 pad', () => {
    const box = padViewRect({ x: 100, y: 100, width: 50, height: 50 }, 10, view);
    expect(box).toEqual({ x: 90, y: 90, width: 70, height: 70 });
  });

  it('留边不会越出视口', () => {
    const box = padViewRect({ x: 2, y: 2, width: 796, height: 596 }, 50, view);
    expect(box).toEqual({ x: 0, y: 0, width: 800, height: 600 });
  });

  it('pad 为 0 时按整数对齐，不返回小数尺寸', () => {
    // getImageData/canvas 尺寸都吃不了小数，留边必须自己取整
    const box = padViewRect({ x: 10.7, y: 20.2, width: 5.5, height: 5.5 }, 0, view);
    expect(box).toEqual({ x: 10, y: 20, width: 7, height: 6 });
  });

  it('框整体在视口外时返回 null，调用方可以整条路跳过', () => {
    expect(padViewRect({ x: 900, y: 10, width: 50, height: 50 }, 5, view)).toBeNull();
    expect(padViewRect({ x: -200, y: 10, width: 50, height: 50 }, 5, view)).toBeNull();
  });
});

/*
 * 局部缓冲的核心契约：调用方仍然按文档坐标画，落点却要在缓冲本地坐标上正确。
 * 这一组守住的就是「缓冲缩小之后内容不错位」——错位是这次改动最可能引入的 bug。
 */
describe('createViewBufferAt', () => {
  it('按文档坐标画，落点是文档位置减去 box 偏移', () => {
    const view = ctx(); // scale=1, origin=(200,150)
    const box = { x: 210, y: 160, width: 40, height: 40 };
    const buffer = createViewBufferAt(view, box);
    const context = ctx2d(buffer.canvas);
    // 文档 (20,20) → 视口 (220,170) → 缓冲本地 (10,10)
    context.fillStyle = '#ff0000';
    context.fillRect(20, 20, 5, 5);

    context.setTransform(1, 0, 0, 1, 0, 0);
    expect(Array.from(context.getImageData(10, 10, 1, 1).data)).toEqual([255, 0, 0, 255]);
    expect(Array.from(context.getImageData(0, 0, 1, 1).data)).toEqual([0, 0, 0, 0]);
  });

  it('缓冲尺寸就是 box 尺寸，位置随缓冲一起带出来', () => {
    const view = ctx();
    const buffer = createViewBufferAt(view, { x: 7, y: 9, width: 33, height: 21 });
    expect(buffer.canvas.width).toBe(33);
    expect(buffer.canvas.height).toBe(21);
    expect([buffer.x, buffer.y, buffer.width, buffer.height]).toEqual([7, 9, 33, 21]);
  });

  it('缓冲像素数按 box 记，不按视口记', () => {
    resetCounters();
    const view = ctx();
    createViewBufferAt(view, { x: 0, y: 0, width: 20, height: 10 });
    expect(counters.buffers).toBe(1);
    expect(counters.bufferPixels).toBe(200);
    // 整幅视口是 480000，局部缓冲必须远小于它，否则这次改动等于没做
    expect(counters.bufferPixels).toBeLessThan(view.viewWidth * view.viewHeight);
  });
});

/*
 * 组和剪贴组要往局部缓冲里递归画子节点，子节点得按「缓冲即视口」重算坐标。
 * 这个换算错了，组里的内容会整体偏移一个 box 的量。
 */
describe('subViewport', () => {
  it('原点减掉 box 偏移，尺寸换成 box 尺寸', () => {
    const view = ctx(); // origin=(200,150), 800×600
    const inner = subViewport(view, { x: 30, y: 40, width: 100, height: 80 });
    expect(inner.originX).toBe(170);
    expect(inner.originY).toBe(110);
    expect(inner.viewWidth).toBe(100);
    expect(inner.viewHeight).toBe(80);
    expect(inner.scale).toBe(view.scale);
  });

  it('换算后的文档 → 视口坐标就是缓冲本地坐标', () => {
    const view = ctx();
    const box = { x: 210, y: 160, width: 40, height: 40 };
    const inner = subViewport(view, box);
    // 文档 (20,20) 在外层视口是 (220,170)，在缓冲里应是 (10,10)
    const local = docRectToViewRect({ x: 20, y: 20, width: 5, height: 5 }, inner);
    expect(local).toEqual({ x: 10, y: 10, width: 5, height: 5 });
  });

  it('docRect 跟着收窄，缓冲外的子节点会被裁掉', () => {
    const view = ctx();
    const inner = subViewport(view, { x: 200, y: 150, width: 100, height: 100 });
    // 缓冲覆盖文档 (0,0)~(100,100)，文档 (200,200) 处的内容不该算进来
    expect(inner.docRect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(docRectToViewRect({ x: 200, y: 200, width: 10, height: 10 }, inner)).toBeNull();
  });

  it('整幅视口的 box 换出来跟原 view 等价（退化情形不该出偏移）', () => {
    const view = ctx();
    const inner = subViewport(view, fullViewBox(view));
    expect(inner.originX).toBe(view.originX);
    expect(inner.originY).toBe(view.originY);
    expect(inner.viewWidth).toBe(view.viewWidth);
    expect(inner.viewHeight).toBe(view.viewHeight);
  });
});
