/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useGuideDrag } from './useGuideDrag';
import { renderHookWithValue } from './testHookKit';
import { useEditorStore } from '../store';
import type { Point } from '../types';

const store = () => useEditorStore.getState();
type Drag = ReturnType<typeof useGuideDrag>;

/** 固定换算：客户端坐标减去标尺占的 20px 即文档坐标（zoom=1，无平移） */
const toDoc = (clientX: number, clientY: number): Point => ({
  x: clientX - 20,
  y: clientY - 20,
});

/** 造一个够用的 PointerEvent 替身，只带被测代码真正读的字段 */
function pointer(clientX: number, clientY: number, pointerId = 1) {
  return {
    clientX,
    clientY,
    pointerId,
    preventDefault: () => {},
    currentTarget: { setPointerCapture: () => {} },
  } as unknown as React.PointerEvent<HTMLCanvasElement>;
}

function probeDrag() {
  return renderHookWithValue<Drag>(() => useGuideDrag({ toDoc }));
}

beforeEach(() => {
  store().closeDoc();
  store().clearGuides();
  store().createDoc({ name: '测试', width: 200, height: 100, background: 'white' });
});

describe('useGuideDrag 从标尺拖出', () => {
  it('在标尺上按下时不把位置夹到 0，参考线不该贴在文档顶边', () => {
    const probe = probeDrag();
    // clientY=10 落在横标尺上（视口从 20 开始），换算后文档坐标是 -10
    probe.last().startFromRuler(pointer(120, 10), 'h');

    expect(store().guides).toHaveLength(1);
    expect(store().guides[0].position).toBe(-10);
    probe.unmount();
  });

  it('拖进画布后位置跟着光标走', () => {
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(120, 10), 'h');
    probe.last().onPointerMove(pointer(120, 65));

    expect(store().guides[0].position).toBe(45);
    probe.unmount();
  });

  it('拖出文档范围也照样跟随，不再黏在边缘', () => {
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(120, 10), 'h');
    // 文档高 100，拖到 150 已经越过底边
    probe.last().onPointerMove(pointer(120, 170));

    expect(store().guides[0].position).toBe(150);
    probe.unmount();
  });

  it('松手落在文档外就删掉这条参考线', () => {
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(120, 10), 'h');
    probe.last().onPointerUp(pointer(120, 10));

    expect(store().guides).toHaveLength(0);
    probe.unmount();
  });

  it('松手落在文档内就留下', () => {
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(120, 10), 'h');
    probe.last().onPointerMove(pointer(120, 65));
    probe.last().onPointerUp(pointer(120, 65));

    expect(store().guides).toHaveLength(1);
    expect(store().guides[0].position).toBe(45);
    probe.unmount();
  });

  it('从标尺拖出时自动打开参考线显示，否则拖了看不见', () => {
    if (store().showGuides) store().toggleGuides();
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(120, 10), 'v');

    expect(store().showGuides).toBe(true);
    probe.unmount();
  });

  it('竖标尺拖出垂直线，位置按 x 取', () => {
    const probe = probeDrag();
    probe.last().startFromRuler(pointer(90, 60), 'v');

    expect(store().guides[0].orientation).toBe('v');
    expect(store().guides[0].position).toBe(70);
    probe.unmount();
  });
});
