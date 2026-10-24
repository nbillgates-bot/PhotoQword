/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { describe, expect, it } from 'vitest';
import { cursorHintFor, dragTransform, type TransformDragArgs } from './transformDrag';
import {
  createTransformState,
  docToLocal,
  localToDoc,
  type BoxHandle,
  type TransformState,
} from './transformBox';
import { applyMatrix } from './matrix';

const RECT = { x: 100, y: 50, width: 200, height: 100 };
const base = (): TransformState => createTransformState({ ...RECT });

/** 造一次拖拽：默认无修饰键，从 anchor 拖到 current */
function drag(over: Partial<TransformDragArgs> & { handle: BoxHandle }): TransformState {
  return dragTransform({
    start: base(),
    anchor: { x: 0, y: 0 },
    current: { x: 0, y: 0 },
    shift: false,
    alt: false,
    ctrl: false,
    ...over,
  });
}

describe('平移', () => {
  it('拖框内按位移平移', () => {
    const next = drag({
      handle: 'inside',
      anchor: { x: 200, y: 100 },
      current: { x: 230, y: 80 },
    });
    expect(next.rect.x).toBe(130);
    expect(next.rect.y).toBe(30);
  });

  it('平移不改尺寸也不改角度', () => {
    const next = drag({
      handle: 'inside',
      anchor: { x: 0, y: 0 },
      current: { x: 50, y: 50 },
    });
    expect(next.rect.width).toBe(200);
    expect(next.rect.height).toBe(100);
    expect(next.angle).toBe(0);
  });

  it('handle 为 null 时原样返回', () => {
    const start = base();
    expect(dragTransform({
      start,
      anchor: { x: 0, y: 0 },
      current: { x: 99, y: 99 },
      handle: null,
      shift: false,
      alt: false,
      ctrl: false,
    })).toBe(start);
  });
});

describe('旋转', () => {
  const center = { x: 200, y: 100 };

  it('绕中心转 90°', () => {
    // 从正右方拖到正下方
    const next = drag({
      handle: 'rotate',
      anchor: { x: center.x + 50, y: center.y },
      current: { x: center.x, y: center.y + 50 },
    });
    expect(next.angle).toBeCloseTo(Math.PI / 2, 6);
  });

  it('反向拖得到负角', () => {
    const next = drag({
      handle: 'rotate',
      anchor: { x: center.x + 50, y: center.y },
      current: { x: center.x, y: center.y - 50 },
    });
    expect(next.angle).toBeCloseTo(-Math.PI / 2, 6);
  });

  it('从已有角度继续累加', () => {
    const start = { ...base(), angle: Math.PI / 2 };
    const next = dragTransform({
      start,
      anchor: { x: center.x + 50, y: center.y },
      current: { x: center.x, y: center.y + 50 },
      handle: 'rotate',
      shift: false,
      alt: false,
      ctrl: false,
    });
    expect(next.angle).toBeCloseTo(Math.PI, 6);
  });

  it('抓在框上任何位置都不突跳：原地按下不改角度', () => {
    const at = { x: center.x + 80, y: center.y + 30 };
    const next = drag({ handle: 'rotate', anchor: at, current: at });
    expect(next.angle).toBeCloseTo(0, 9);
  });

  it('Shift 吸附到 15° 的整数倍', () => {
    // 拖出约 20°，应吸到 15°
    const angle = (20 * Math.PI) / 180;
    const next = drag({
      handle: 'rotate',
      shift: true,
      anchor: { x: center.x + 100, y: center.y },
      current: {
        x: center.x + 100 * Math.cos(angle),
        y: center.y + 100 * Math.sin(angle),
      },
    });
    expect((next.angle * 180) / Math.PI).toBeCloseTo(15, 6);
  });

  it('Shift 吸附到 0 也成立', () => {
    const angle = (4 * Math.PI) / 180;
    const next = drag({
      handle: 'rotate',
      shift: true,
      anchor: { x: center.x + 100, y: center.y },
      current: {
        x: center.x + 100 * Math.cos(angle),
        y: center.y + 100 * Math.sin(angle),
      },
    });
    expect(next.angle).toBeCloseTo(0, 9);
  });

  it('旋转不改矩形', () => {
    const next = drag({
      handle: 'rotate',
      anchor: { x: center.x + 50, y: center.y },
      current: { x: center.x, y: center.y + 50 },
    });
    expect(next.rect).toEqual(RECT);
  });

  it('指针落在中心时不产生 NaN', () => {
    const next = drag({ handle: 'rotate', anchor: center, current: center });
    expect(Number.isNaN(next.angle)).toBe(false);
  });
});

describe('缩放', () => {
  it('拖右边缘加宽，左边留在原地', () => {
    const next = drag({
      handle: 'e',
      anchor: { x: 300, y: 100 },
      current: { x: 340, y: 100 },
    });
    expect(next.rect.width).toBeCloseTo(240, 6);
    expect(next.rect.x).toBeCloseTo(100, 6);
  });

  it('拖左边缘加宽，右边留在原地', () => {
    const next = drag({
      handle: 'w',
      anchor: { x: 100, y: 100 },
      current: { x: 60, y: 100 },
    });
    expect(next.rect.width).toBeCloseTo(240, 6);
    expect(next.rect.x + next.rect.width).toBeCloseTo(300, 6);
  });

  it('拖下边缘加高，上边留在原地', () => {
    const next = drag({
      handle: 's',
      anchor: { x: 200, y: 150 },
      current: { x: 200, y: 180 },
    });
    expect(next.rect.height).toBeCloseTo(130, 6);
    expect(next.rect.y).toBeCloseTo(50, 6);
  });

  it('拖角同时改宽高，对角留在原地', () => {
    const next = drag({
      handle: 'se',
      anchor: { x: 300, y: 150 },
      current: { x: 320, y: 170 },
    });
    expect(next.rect.width).toBeCloseTo(220, 6);
    expect(next.rect.height).toBeCloseTo(120, 6);
    expect(next.rect.x).toBeCloseTo(100, 6);
    expect(next.rect.y).toBeCloseTo(50, 6);
  });

  it('边中点只改一个维度', () => {
    const next = drag({
      handle: 'e',
      anchor: { x: 300, y: 100 },
      current: { x: 340, y: 200 },
    });
    expect(next.rect.height).toBeCloseTo(100, 6);
  });

  it('Shift 拖角保持长宽比', () => {
    const next = drag({
      handle: 'se',
      shift: true,
      anchor: { x: 300, y: 150 },
      current: { x: 340, y: 152 },
    });
    // 原比例 2:1，宽加 40 则高应加 20
    expect(next.rect.width / next.rect.height).toBeCloseTo(2, 6);
  });

  it('Alt 从中心缩放，中心不动', () => {
    const next = drag({
      handle: 'e',
      alt: true,
      anchor: { x: 300, y: 100 },
      current: { x: 320, y: 100 },
    });
    expect(next.rect.width).toBeCloseTo(240, 6);
    expect(next.rect.x + next.rect.width / 2).toBeCloseTo(200, 6);
  });

  it('拖过对边产生负宽度（镜像），不被夹成 0', () => {
    const next = drag({
      handle: 'e',
      anchor: { x: 300, y: 100 },
      current: { x: 50, y: 100 },
    });
    expect(next.rect.width).toBeLessThan(0);
  });

  it('旋转 90° 后拖 e 沿框自己的轴长，不沿屏幕水平', () => {
    // 转 90° 后框的局部 +x 在屏幕上朝下，所以要往下拖才变宽
    const start = { ...base(), angle: Math.PI / 2 };
    const next = dragTransform({
      start,
      anchor: { x: 200, y: 200 },
      current: { x: 200, y: 240 },
      handle: 'e',
      shift: false,
      alt: false,
      ctrl: false,
    });
    expect(next.rect.width).toBeCloseTo(240, 6);
    expect(next.rect.height).toBeCloseTo(100, 6);
  });

  it('旋转后往屏幕水平方向拖 e 几乎不改宽度', () => {
    const start = { ...base(), angle: Math.PI / 2 };
    const next = dragTransform({
      start,
      anchor: { x: 200, y: 200 },
      current: { x: 240, y: 200 },
      handle: 'e',
      shift: false,
      alt: false,
      ctrl: false,
    });
    expect(next.rect.width).toBeCloseTo(200, 6);
  });

  it('旋转后缩放保持未被拖的那条边不动', () => {
    const start = { ...base(), angle: 0.6 };
    const next = dragTransform({
      start,
      anchor: { x: 200, y: 100 },
      current: { x: 260, y: 130 },
      handle: 'e',
      shift: false,
      alt: false,
      ctrl: false,
    });
    // 角度不变，宽度变了，高度没变
    expect(next.angle).toBeCloseTo(0.6, 9);
    expect(next.rect.height).toBeCloseTo(100, 6);
    expect(next.rect.width).not.toBeCloseTo(200, 3);
  });

  it('缩放结果不含 NaN', () => {
    const next = drag({
      handle: 'nw',
      anchor: { x: 100, y: 50 },
      current: { x: 305, y: 155 },
    });
    expect(Number.isNaN(next.rect.width)).toBe(false);
    expect(Number.isNaN(next.rect.x)).toBe(false);
  });

  it('高度为 0 时 Shift 等比不产生除零', () => {
    const flat = createTransformState({ x: 0, y: 0, width: 100, height: 0 });
    const next = dragTransform({
      start: flat,
      anchor: { x: 100, y: 0 },
      current: { x: 140, y: 20 },
      handle: 'se',
      shift: true,
      alt: false,
      ctrl: false,
    });
    expect(Number.isNaN(next.rect.width)).toBe(false);
    expect(Number.isNaN(next.rect.height)).toBe(false);
  });
});

describe('斜切（按住 Ctrl 拖边中点）', () => {
  it('推顶边往右产生水平斜切', () => {
    const next = drag({
      handle: 'n',
      ctrl: true,
      anchor: { x: 200, y: 50 },
      current: { x: 250, y: 50 },
    });
    expect(next.skewX).not.toBeCloseTo(0, 6);
    expect(next.skewY).toBeCloseTo(0, 9);
  });

  it('顶边和底边往同一方向推得到相反的斜切', () => {
    const top = drag({
      handle: 'n',
      ctrl: true,
      anchor: { x: 200, y: 50 },
      current: { x: 250, y: 50 },
    });
    const bottom = drag({
      handle: 's',
      ctrl: true,
      anchor: { x: 200, y: 150 },
      current: { x: 250, y: 150 },
    });
    expect(Math.sign(top.skewX)).toBe(-Math.sign(bottom.skewX));
  });

  it('推右边往下产生垂直斜切', () => {
    const next = drag({
      handle: 'e',
      ctrl: true,
      anchor: { x: 300, y: 100 },
      current: { x: 300, y: 140 },
    });
    expect(next.skewY).not.toBeCloseTo(0, 6);
    expect(next.skewX).toBeCloseTo(0, 9);
  });

  it('斜切角由位移与半边长的比值决定', () => {
    // 半高 50，横移 50 应得到 45°
    const next = drag({
      handle: 's',
      ctrl: true,
      anchor: { x: 200, y: 150 },
      current: { x: 250, y: 150 },
    });
    expect(Math.abs(next.skewX)).toBeCloseTo(Math.PI / 4, 6);
  });

  it('斜切不改矩形尺寸', () => {
    const next = drag({
      handle: 'n',
      ctrl: true,
      anchor: { x: 200, y: 50 },
      current: { x: 260, y: 90 },
    });
    expect(next.rect.width).toBe(200);
    expect(next.rect.height).toBe(100);
  });

  it('从已有斜切继续累加', () => {
    const start = { ...base(), skewX: 0.2 };
    const next = dragTransform({
      start,
      anchor: { x: 200, y: 150 },
      current: { x: 250, y: 150 },
      handle: 's',
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(next.skewX).toBeCloseTo(0.2 + Math.PI / 4, 6);
  });

  it('Ctrl 拖角不做斜切（扭曲本次不支持）', () => {
    const start = base();
    const next = dragTransform({
      start,
      anchor: { x: 300, y: 150 },
      current: { x: 340, y: 170 },
      handle: 'se',
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(next).toBe(start);
  });

  it('高度为 0 时拖横边不产生除零', () => {
    const flat = createTransformState({ x: 0, y: 0, width: 100, height: 0 });
    const next = dragTransform({
      start: flat,
      anchor: { x: 50, y: 0 },
      current: { x: 90, y: 0 },
      handle: 'n',
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(next).toBe(flat);
  });

  it.each([
    ['n' as BoxHandle, { x: 200, y: 50 }, 50],
    ['s' as BoxHandle, { x: 200, y: 150 }, 50],
    ['n' as BoxHandle, { x: 200, y: 50 }, -30],
  ])('拖 %s 边时这条边跟着指针走，位移量对得上', (handle, anchor, dx) => {
    const start = base();
    const next = dragTransform({
      start,
      anchor,
      current: { x: anchor.x + dx, y: anchor.y },
      handle,
      shift: false,
      alt: false,
      ctrl: true,
    });
    // 被拖的边中点在斜切后的实际位置，应该正好落在指针处
    const before = applyMatrix(docToLocal(start)!, anchor);
    const moved = applyMatrix(localToDoc(next), before);
    expect(moved.x - anchor.x).toBeCloseTo(dx, 6);
    expect(moved.y).toBeCloseTo(anchor.y, 6);
  });

  it('拖右边往下时这条边跟着指针走', () => {
    const start = base();
    const anchor = { x: 300, y: 100 };
    const next = dragTransform({
      start,
      anchor,
      current: { x: anchor.x, y: anchor.y + 40 },
      handle: 'e',
      shift: false,
      alt: false,
      ctrl: true,
    });
    const moved = applyMatrix(localToDoc(next), applyMatrix(docToLocal(start)!, anchor));
    expect(moved.y - anchor.y).toBeCloseTo(40, 6);
    expect(moved.x).toBeCloseTo(anchor.x, 6);
  });

  it('斜切结果不含 NaN', () => {
    const next = drag({
      handle: 'n',
      ctrl: true,
      anchor: { x: 200, y: 50 },
      current: { x: 9999, y: 50 },
    });
    expect(Number.isNaN(next.skewX)).toBe(false);
  });
});

describe('cursorHintFor', () => {
  const flat = () => base();

  /*
   * RECT 是 100,50,200×100，所以中心在 (200,100)。
   * 下面的点都相对这个中心取方向，y 轴向下（正 y 是南）。
   */
  const CENTER = { x: 200, y: 100 };

  it('旋转区按指针相对中心的方向给出 8 个光标', () => {
    const state = flat();
    const at = (dx: number, dy: number) =>
      cursorHintFor('rotate', state, false, { x: CENTER.x + dx, y: CENTER.y + dy });

    expect(at(30, 0)).toBe('rotate-e');
    expect(at(20, 20)).toBe('rotate-se');
    expect(at(0, 30)).toBe('rotate-s');
    expect(at(-20, 20)).toBe('rotate-sw');
    expect(at(-30, 0)).toBe('rotate-w');
    expect(at(-20, -20)).toBe('rotate-nw');
    expect(at(0, -30)).toBe('rotate-n');
    expect(at(20, -20)).toBe('rotate-ne');
  });

  it('八个方向互不相同，没有两个区域共用同一个光标', () => {
    const state = flat();
    const dirs: Array<[number, number]> = [
      [30, 0], [20, 20], [0, 30], [-20, 20],
      [-30, 0], [-20, -20], [0, -30], [20, -20],
    ];
    const hints = dirs.map(([dx, dy]) =>
      cursorHintFor('rotate', state, false, { x: CENTER.x + dx, y: CENTER.y + dy }),
    );
    expect(new Set(hints).size).toBe(8);
  });

  it('扇区边界附近就近取档，不会落到 undefined', () => {
    const state = flat();
    // 22.5° 是 e 与 se 的分界，两边各取一点都必须是有效值
    for (const deg of [22, 23, 67, 68, 112, 113, 157, 158, 202, 248, 292, 338]) {
      const rad = (deg * Math.PI) / 180;
      const hint = cursorHintFor('rotate', state, false, {
        x: CENTER.x + Math.cos(rad) * 30,
        y: CENTER.y + Math.sin(rad) * 30,
      });
      expect(hint).toMatch(/^rotate-(n|ne|e|se|s|sw|w|nw)$/);
    }
  });

  it('旋转光标只看方向，不受框的宽高比影响', () => {
    // 与缩放箭头不同：旋转是绕中心转，扁框的正上方也还是"北"
    const wide = { ...flat(), rect: { x: 0, y: 0, width: 400, height: 20 } };
    const center = { x: 200, y: 10 };
    expect(cursorHintFor('rotate', wide, false, { x: center.x, y: center.y - 30 })).toBe(
      'rotate-n',
    );
  });

  it('旋转时不传 point 退化成朝北，不会是 undefined', () => {
    expect(cursorHintFor('rotate', flat(), false)).toBe('rotate-n');
  });

  it('指针正好落在框中心时给确定的回退方向', () => {
    expect(cursorHintFor('rotate', flat(), false, CENTER)).toBe('rotate-e');
  });

  it('框内用移动光标', () => {
    expect(cursorHintFor('inside', flat(), false)).toBe('move');
  });

  it('没命中时不给方向', () => {
    expect(cursorHintFor(null, flat(), false)).toBe('none');
  });

  it('未旋转时四角用对角箭头', () => {
    expect(cursorHintFor('nw', flat(), false)).toBe('nwse');
    expect(cursorHintFor('ne', flat(), false)).toBe('nesw');
    expect(cursorHintFor('se', flat(), false)).toBe('nwse');
    expect(cursorHintFor('sw', flat(), false)).toBe('nesw');
  });

  it('未旋转时横边竖边各有方向', () => {
    expect(cursorHintFor('n', flat(), false)).toBe('ns');
    expect(cursorHintFor('s', flat(), false)).toBe('ns');
    expect(cursorHintFor('e', flat(), false)).toBe('ew');
    expect(cursorHintFor('w', flat(), false)).toBe('ew');
  });

  it('框转 90° 后上边跑到侧面，箭头也跟着转', () => {
    // 这是修的正主：转过之后还给 ns-resize 就是骗人，箭头方向差 90°
    const turned = { ...flat(), angle: Math.PI / 2 };
    expect(cursorHintFor('n', turned, false)).toBe('ew');
    expect(cursorHintFor('e', turned, false)).toBe('ns');
  });

  it('转 45° 时上边的箭头变成对角', () => {
    const turned = { ...flat(), angle: Math.PI / 4 };
    expect(cursorHintFor('n', turned, false)).toBe('nesw');
  });

  it('角的方向按实际对角线算，不是固定 45°', () => {
    // 400×20 的扁框，nw 对角线几乎水平（-177°），箭头应当是横向；
    // 若用 ±1 的单位法向就会算成 -135° 的斜箭头，与用户看到的框对不上
    const flatWide = { ...flat(), rect: { x: 0, y: 0, width: 400, height: 20 } };
    expect(cursorHintFor('nw', flatWide, false)).toBe('ew');
    // 20×400 的竖框反过来，对角线几乎垂直
    const flatTall = { ...flat(), rect: { x: 0, y: 0, width: 20, height: 400 } };
    expect(cursorHintFor('nw', flatTall, false)).toBe('ns');
  });

  it('转 180° 后箭头与不转时相同，因为双向箭头本身对称', () => {
    const turned = { ...flat(), angle: Math.PI };
    expect(cursorHintFor('n', turned, false)).toBe('ns');
    expect(cursorHintFor('nw', turned, false)).toBe('nwse');
  });

  it('转一整圈回到原样', () => {
    const turned = { ...flat(), angle: Math.PI * 2 };
    expect(cursorHintFor('e', turned, false)).toBe('ew');
  });

  it('负角度与正角度对称', () => {
    expect(cursorHintFor('n', { ...flat(), angle: -Math.PI / 2 }, false)).toBe('ew');
  });

  it('镜像翻转不改变箭头方向，双向箭头没有指向之分', () => {
    const mirrored = { ...flat(), rect: { ...RECT, width: -200 } };
    expect(cursorHintFor('e', mirrored, false)).toBe('ew');
    expect(cursorHintFor('n', mirrored, false)).toBe('ns');
  });

  it('零宽高不产生 NaN 也不崩', () => {
    const degenerate = { ...flat(), rect: { x: 0, y: 0, width: 0, height: 0 } };
    // 法向仍然有方向（sign(0||1)=1），所以给得出箭头，关键是别抛也别是 undefined
    expect(['ns', 'ew', 'nwse', 'nesw', 'none']).toContain(
      cursorHintFor('n', degenerate, false),
    );
  });

  it('斜切状态下仍给出有效箭头', () => {
    const skewed = { ...flat(), skewX: Math.PI / 6 };
    expect(['ns', 'ew', 'nwse', 'nesw']).toContain(cursorHintFor('n', skewed, false));
  });

  it('按住 Ctrl 时方向转 90°，提示这是斜切', () => {
    expect(cursorHintFor('n', flat(), true)).toBe('ew');
    expect(cursorHintFor('e', flat(), true)).toBe('ns');
  });
});
