/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { clampPan, documentOrigin, panForFocusZoom, panLimit, visibleDocRect } from './viewportRect';

/**
 * 视口换算。
 *
 * 这组用例盯的是"放大后画面变白"那个 bug：可见区域漏算居中项时，
 * 放大后矩形会偏到文档之外，视口裁剪把所有图层都判成不可见。
 * 所以核心断言是「可见区域必须始终盖住视口中心对应的那个文档点」。
 */

const box = { width: 800, height: 600 };

describe('documentOrigin', () => {
  it('无 pan 时文档在视口里居中', () => {
    const origin = documentOrigin({
      viewport: box,
      docWidth: 400,
      docHeight: 300,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    expect(origin).toEqual({ x: 200, y: 150 });
  });

  it('文档比视口大时原点为负', () => {
    const origin = documentOrigin({
      viewport: box,
      docWidth: 1600,
      docHeight: 1200,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    expect(origin).toEqual({ x: -400, y: -300 });
  });

  it('pan 直接叠在居中位置上', () => {
    const origin = documentOrigin({
      viewport: box,
      docWidth: 400,
      docHeight: 300,
      zoom: 1,
      panX: 30,
      panY: -20,
    });
    expect(origin).toEqual({ x: 230, y: 130 });
  });
});

describe('visibleDocRect 覆盖视口中心', () => {
  /** 视口中心对应的文档点，必须落在可见区域里 */
  function centerCovered(args: Parameters<typeof visibleDocRect>[0]): boolean {
    const origin = documentOrigin(args);
    const center = {
      x: (args.viewport.width / 2 - origin.x) / args.zoom,
      y: (args.viewport.height / 2 - origin.y) / args.zoom,
    };
    const rect = visibleDocRect(args);
    return (
      center.x >= rect.x &&
      center.x <= rect.x + rect.width &&
      center.y >= rect.y &&
      center.y <= rect.y + rect.height
    );
  }

  it('各种缩放下都盖住视口中心（放大后变白的回归用例）', () => {
    // 1 以上是放大。旧实现漏了居中项，这几档会算出偏到文档外的矩形
    for (const zoom of [0.08, 0.25, 0.5, 1, 2, 4, 8, 16]) {
      expect(
        centerCovered({
          viewport: box,
          docWidth: 790,
          docHeight: 14235,
          zoom,
          panX: 0,
          panY: 0,
        }),
      ).toBe(true);
    }
  });

  it('平移之后仍盖住视口中心', () => {
    for (const [panX, panY] of [
      [0, 0],
      [300, -200],
      [-1200, 900],
    ]) {
      expect(
        centerCovered({
          viewport: box,
          docWidth: 790,
          docHeight: 14235,
          zoom: 4,
          panX,
          panY,
        }),
      ).toBe(true);
    }
  });

  it('小图放大时可见区域覆盖整张文档', () => {
    const rect = visibleDocRect({
      viewport: box,
      docWidth: 100,
      docHeight: 100,
      zoom: 4,
      panX: 0,
      panY: 0,
    });
    // 400×400 的显示尺寸装在 800×600 视口里，整张图都看得见
    expect(rect.x).toBeLessThanOrEqual(0);
    expect(rect.y).toBeLessThanOrEqual(0);
    expect(rect.x + rect.width).toBeGreaterThanOrEqual(100);
    expect(rect.y + rect.height).toBeGreaterThanOrEqual(100);
  });
});

describe('visibleDocRect 边界', () => {
  it('缩放为 0 时退化成整个文档，不产出 Infinity', () => {
    const rect = visibleDocRect({
      viewport: box,
      docWidth: 400,
      docHeight: 300,
      zoom: 0,
      panX: 0,
      panY: 0,
    });
    expect(rect).toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it('视口尺寸为 0 时不产出 NaN', () => {
    const rect = visibleDocRect({
      viewport: { width: 0, height: 0 },
      docWidth: 400,
      docHeight: 300,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    for (const v of [rect.x, rect.y, rect.width, rect.height]) {
      expect(Number.isNaN(v)).toBe(false);
    }
  });

  it('1×1 文档也能算出有效矩形', () => {
    const rect = visibleDocRect({
      viewport: box,
      docWidth: 1,
      docHeight: 1,
      zoom: 1,
      panX: 0,
      panY: 0,
    });
    expect(rect.width).toBe(800);
    expect(rect.height).toBe(600);
  });
});

describe('panLimit', () => {
  it('文档比视口小时锁死居中', () => {
    expect(panLimit(800, 400, 1)).toBe(0);
    expect(panLimit(800, 400, 0.5)).toBe(0);
  });

  it('刚好等大时也是 0', () => {
    expect(panLimit(800, 800, 1)).toBe(0);
  });

  it('文档比视口大时上限是溢出量的一半', () => {
    // 1600 宽装进 800 视口，溢出 800，两侧各能滚 400
    expect(panLimit(800, 1600, 1)).toBe(400);
  });

  it('上限随缩放变化', () => {
    expect(panLimit(600, 14235, 0.08)).toBeCloseTo((14235 * 0.08 - 600) / 2, 6);
  });
});

describe('clampPan', () => {
  const doc = { docWidth: 790, docHeight: 14235 };

  it('把超界的 pan 夹到边缘对齐', () => {
    const limitY = panLimit(600, doc.docHeight, 1);
    const pan = clampPan({ viewport: box, ...doc, zoom: 1, panX: 0, panY: 99999 });
    expect(pan.y).toBeCloseTo(limitY, 6);
  });

  it('负方向同样夹住', () => {
    const limitY = panLimit(600, doc.docHeight, 1);
    const pan = clampPan({ viewport: box, ...doc, zoom: 1, panX: 0, panY: -99999 });
    expect(pan.y).toBeCloseTo(-limitY, 6);
  });

  it('范围内的 pan 原样返回', () => {
    const pan = clampPan({ viewport: box, ...doc, zoom: 1, panX: 0, panY: 120 });
    expect(pan).toEqual({ x: 0, y: 120 });
  });

  it('横向：文档比视口窄，pan 只能是 0', () => {
    const pan = clampPan({ viewport: box, ...doc, zoom: 1, panX: 300, panY: 0 });
    expect(pan.x).toBe(0);
  });

  it('视口尺寸为 0 时不夹，避免首帧把视图推歪', () => {
    const pan = clampPan({
      viewport: { width: 0, height: 0 },
      ...doc,
      zoom: 1,
      panX: 100,
      panY: 100,
    });
    expect(pan).toEqual({ x: 100, y: 100 });
  });

  it('横向溢出时可以左右滚', () => {
    const pan = clampPan({ viewport: box, docWidth: 2000, docHeight: 100, zoom: 1, panX: 300, panY: 0 });
    expect(pan.x).toBe(300);
  });

  it('夹完不产出 NaN', () => {
    const pan = clampPan({ viewport: box, docWidth: 1, docHeight: 1, zoom: 0.02, panX: 5, panY: 5 });
    expect(Number.isNaN(pan.x)).toBe(false);
    expect(Number.isNaN(pan.y)).toBe(false);
  });
});

/** 焦点处对应的文档点，锚点缩放的不变量就是这个值前后相等 */
function docPointAt(args: {
  viewport: { width: number; height: number };
  docWidth: number;
  docHeight: number;
  zoom: number;
  panX: number;
  panY: number;
  focus: { x: number; y: number };
}) {
  const origin = documentOrigin(args);
  return {
    x: (args.focus.x - origin.x) / args.zoom,
    y: (args.focus.y - origin.y) / args.zoom,
  };
}

describe('panForFocusZoom', () => {
  const doc = { docWidth: 790, docHeight: 14235 };

  it('未触及边界时，焦点下的文档点缩放后原地不动', () => {
    const focus = { x: 640, y: 420 };
    const base = { viewport: box, ...doc, panX: 0, panY: 0 };
    const before = docPointAt({ ...base, zoom: 1, focus });
    const pan = panForFocusZoom({ ...base, fromZoom: 1, toZoom: 1.12, focus });
    const after = docPointAt({
      viewport: box,
      ...doc,
      panX: pan.x,
      panY: pan.y,
      zoom: 1.12,
      focus,
    });
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('连续多档缩放都保持锚点', () => {
    const focus = { x: 200, y: 150 };
    let zoom = 1;
    let pan = { x: 0, y: 0 };
    const target = docPointAt({
      viewport: box,
      ...doc,
      zoom,
      panX: pan.x,
      panY: pan.y,
      focus,
    });
    for (let i = 0; i < 6; i++) {
      const next = zoom * 1.12;
      pan = panForFocusZoom({
        viewport: box,
        ...doc,
        fromZoom: zoom,
        toZoom: next,
        panX: pan.x,
        panY: pan.y,
        focus,
      });
      zoom = next;
      const now = docPointAt({ viewport: box, ...doc, zoom, panX: pan.x, panY: pan.y, focus });
      // 纵向文档远高于视口，纵向不会被夹；横向 790*zoom 一直窄于 800，会被夹成 0
      expect(now.y).toBeCloseTo(target.y, 4);
    }
  });

  it('缩小到文档比视口小时回到居中', () => {
    const pan = panForFocusZoom({
      viewport: box,
      docWidth: 400,
      docHeight: 300,
      fromZoom: 4,
      toZoom: 0.5,
      panX: 300,
      panY: 200,
      focus: { x: 0, y: 0 },
    });
    expect(pan).toEqual({ x: 0, y: 0 });
  });

  it('结果始终在 pan 上限内', () => {
    const pan = panForFocusZoom({
      viewport: box,
      ...doc,
      fromZoom: 0.08,
      toZoom: 0.09,
      panX: 0,
      panY: 0,
      focus: { x: 799, y: 599 },
    });
    const limitY = panLimit(box.height, doc.docHeight, 0.09);
    expect(Math.abs(pan.y)).toBeLessThanOrEqual(limitY + 1e-6);
    expect(pan.x).toBe(0);
  });

  it('fromZoom 为 0 时不产出 NaN', () => {
    const pan = panForFocusZoom({
      viewport: box,
      ...doc,
      fromZoom: 0,
      toZoom: 1,
      panX: 10,
      panY: 20,
      focus: { x: 100, y: 100 },
    });
    expect(Number.isNaN(pan.x)).toBe(false);
    expect(Number.isNaN(pan.y)).toBe(false);
  });
});
