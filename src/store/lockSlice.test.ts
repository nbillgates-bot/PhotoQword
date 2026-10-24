/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './index';
import { ctx2d } from '../engine/canvasUtils';

const store = () => useEditorStore.getState();

function newDoc(): string {
  store().createDoc({ name: '测试', width: 4, height: 4, background: 'white' });
  return store().layers[0].id;
}

function addLayer(): string {
  const layer = store().addLayer('raster');
  if (!layer) throw new Error('建图层失败');
  return layer.id;
}

const at = (id: string) => store().layers.find((l) => l.id === id)!;

beforeEach(() => {
  store().closeDoc();
});

describe('toggleSelectedLock', () => {
  it('切换活动层的细分锁', () => {
    const bg = newDoc();
    store().toggleSelectedLock('pixels');
    expect(at(bg).lockPixels).toBe(true);
    store().toggleSelectedLock('pixels');
    expect(at(bg).lockPixels).toBe(false);
  });

  it('四种锁各写各的字段，互不影响', () => {
    const bg = newDoc();
    store().toggleSelectedLock('transparent');
    expect(at(bg).lockTransparent).toBe(true);
    expect(at(bg).lockPixels).toBeFalsy();
    expect(at(bg).lockPosition).toBeFalsy();
    expect(at(bg).locked).toBe(false);
  });

  it('「全部锁定」写的是 locked', () => {
    const bg = newDoc();
    store().toggleSelectedLock('all');
    expect(at(bg).locked).toBe(true);
  });

  it('多选时整批取活动层的反状态，不是逐层各自取反', () => {
    const bg = newDoc();
    const top = addLayer();
    // 先让 bg 单独锁上，再连选两层切一次
    store().selectLayer(bg);
    store().toggleSelectedLock('pixels');
    store().selectLayer(top);
    store().selectLayer(bg, 'toggle');
    // 活动层此时是 bg（已锁），所以整批目标值是「解锁」
    store().toggleSelectedLock('pixels');
    expect(at(bg).lockPixels).toBe(false);
    expect(at(top).lockPixels).toBe(false);
  });

  it('多选时活动层没锁则整批锁上', () => {
    const bg = newDoc();
    const top = addLayer();
    store().selectLayer(bg);
    store().toggleSelectedLock('position');
    store().selectLayer(top);
    store().selectLayer(bg, 'toggle');
    // 活动层是 bg（已锁位置）→ 目标是解锁；再切一次两层都锁上
    store().toggleSelectedLock('position');
    store().toggleSelectedLock('position');
    expect(at(bg).lockPosition).toBe(true);
    expect(at(top).lockPosition).toBe(true);
  });

  it('压了历史，能撤销回去', () => {
    const bg = newDoc();
    store().toggleSelectedLock('pixels');
    expect(at(bg).lockPixels).toBe(true);
    store().undo();
    expect(at(bg).lockPixels).toBeFalsy();
  });

  it('没有文档时不报错', () => {
    expect(() => store().toggleSelectedLock('all')).not.toThrow();
  });
});

describe('锁定透明像素在 commitOverlay 时生效', () => {
  /** 在图层左半边填一块不透明红色，作为"原有像素" */
  function paintLeftHalf(id: string) {
    const context = ctx2d(at(id).canvas);
    context.clearRect(0, 0, 4, 4);
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 2, 4);
  }

  /** 整幅刷绿，走 overlay 提交 */
  function strokeAll(id: string) {
    const buffer = store().beginOverlay({
      targetLayerId: id,
      target: 'canvas',
      opacity: 100,
      operation: 'source-over',
      clipToSelection: false,
    });
    if (!buffer) throw new Error('overlay 建失败');
    const context = ctx2d(buffer);
    context.fillStyle = '#00ff00';
    context.fillRect(0, 0, 4, 4);
    store().commitOverlay('画笔');
  }

  const pixel = (id: string, x: number) =>
    Array.from(ctx2d(at(id).canvas).getImageData(x, 0, 1, 1).data);

  it('没锁时整幅都画上', () => {
    const bg = newDoc();
    paintLeftHalf(bg);
    strokeAll(bg);
    expect(pixel(bg, 0)).toEqual([0, 255, 0, 255]);
    expect(pixel(bg, 3)).toEqual([0, 255, 0, 255]);
  });

  it('锁了透明像素时只画在原有不透明区域内', () => {
    const bg = newDoc();
    paintLeftHalf(bg);
    store().toggleSelectedLock('transparent');
    strokeAll(bg);
    // 左半边原本有像素 → 画上绿色
    expect(pixel(bg, 0)).toEqual([0, 255, 0, 255]);
    // 右半边原本透明 → 保持透明，绿色被裁掉
    expect(pixel(bg, 3)).toEqual([0, 0, 0, 0]);
  });

  it('裁完不产生 NaN（Uint8ClampedArray 会把 NaN 变 0，画面只是黑一块）', () => {
    const bg = newDoc();
    paintLeftHalf(bg);
    store().toggleSelectedLock('transparent');
    strokeAll(bg);
    const { data } = ctx2d(at(bg).canvas).getImageData(0, 0, 4, 4);
    expect(Array.from(data).some((v) => Number.isNaN(v))).toBe(false);
  });

  it('半透明的原有像素 alpha 原样不动，只换颜色', () => {
    const bg = newDoc();
    const context = ctx2d(at(bg).canvas);
    context.clearRect(0, 0, 4, 4);
    context.fillStyle = 'rgba(255,0,0,0.5)';
    context.fillRect(0, 0, 2, 4);
    const before = pixel(bg, 0)[3];
    store().toggleSelectedLock('transparent');
    strokeAll(bg);
    const [r, g, , alpha] = pixel(bg, 0);
    // alpha 锁死在原值：相乘的实现会变成 ~192，画几笔就实心，柔边会越画越硬
    expect(alpha).toBe(before);
    // 颜色换成了绿色
    expect(g).toBeGreaterThan(200);
    expect(r).toBeLessThan(60);
  });

  it('连画多笔柔边不会越画越实', () => {
    const bg = newDoc();
    const context = ctx2d(at(bg).canvas);
    context.clearRect(0, 0, 4, 4);
    context.fillStyle = 'rgba(255,0,0,0.5)';
    context.fillRect(0, 0, 2, 4);
    const before = pixel(bg, 0)[3];
    store().toggleSelectedLock('transparent');
    strokeAll(bg);
    strokeAll(bg);
    strokeAll(bg);
    expect(pixel(bg, 0)[3]).toBe(before);
  });

  it('蒙版不受这个锁限制：锁的是图层像素，蒙版是另一张画布', () => {
    const bg = newDoc();
    store().addMask(bg, 'reveal');
    store().toggleSelectedLock('transparent');
    const mask = at(bg).mask!;
    // 先把蒙版整幅涂黑，这样"原有不透明区"的判断若误用到蒙版上会挡住后续绘制
    const maskCtx = ctx2d(mask);
    maskCtx.fillStyle = '#000000';
    maskCtx.fillRect(0, 0, 4, 4);

    const buffer = store().beginOverlay({
      targetLayerId: bg,
      target: 'mask',
      opacity: 100,
      operation: 'source-over',
      clipToSelection: false,
    });
    if (!buffer) throw new Error('overlay 建失败');
    const context = ctx2d(buffer);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 4, 4);
    store().commitOverlay('画蒙版');

    const [r] = Array.from(ctx2d(at(bg).mask!).getImageData(0, 0, 1, 1).data);
    expect(r).toBe(255);
  });
});
