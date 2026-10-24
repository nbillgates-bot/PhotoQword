/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '../store';
import { renderHookWithValue } from './testHookKit';
import { useViewFrame } from './useViewFrame';

/**
 * useViewFrame 的契约：事件只往里攒，一帧只写 store 一次；
 * 落点必须与逐个提交一致，交互标志起手置位、停手复位。
 *
 * rAF 手动驱动（同 frameQueue.test：jsdom 自带的按真实时间回调，测不稳），
 * 定时器交给 vi 的假时钟，但只假造 setTimeout / clearTimeout——
 * 全量假造会连 React 调度器一起换掉，act 里的更新就 flush 不出来了。
 */
let frames: FrameRequestCallback[] = [];

/** 跑一帧：把排着的回调全执行掉 */
function tick(): void {
  const pending = frames;
  frames = [];
  for (const callback of pending) callback(0);
}

const store = () => useEditorStore.getState();

/** 挂上 hook，返回它的两个提交口 */
function mount() {
  return renderHookWithValue(() => useViewFrame());
}

beforeEach(() => {
  frames = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    frames.splice(handle - 1, 1);
  });

  store().closeDoc();
  store().createDoc({ name: '测试', width: 800, height: 600, background: 'white' });
  store().setViewportSize({ width: 400, height: 300 });
  store().setZoom(1);
  store().setPan(0, 0);
  store().setViewInteracting(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useViewFrame 的帧合并', () => {
  it('提交之后不立即改视图，要等到下一帧', () => {
    const probe = mount();
    const before = store().zoom;

    probe.last().zoomBy(2, null);

    expect(store().zoom).toBe(before);
    tick();
    expect(store().zoom).toBeCloseTo(before * 2, 6);
    probe.unmount();
  });

  it('一帧内多次滚轮只申请一次 rAF', () => {
    const probe = mount();

    probe.last().zoomBy(1.1, { x: 10, y: 10 });
    probe.last().zoomBy(1.1, { x: 10, y: 10 });
    probe.last().zoomBy(1.1, { x: 10, y: 10 });

    // 逐个排帧的话这里是 3，一帧就要合成三次
    expect(frames).toHaveLength(1);
    probe.unmount();
  });

  it('同帧的多次缩放按累乘落地', () => {
    const probe = mount();
    const before = store().zoom;

    probe.last().zoomBy(1.2, null);
    probe.last().zoomBy(1.5, null);
    tick();

    expect(store().zoom).toBeCloseTo(before * 1.2 * 1.5, 6);
    probe.unmount();
  });

  it('同帧的多次平移按累加落地', () => {
    const probe = mount();
    store().setZoom(4); // 放大到有活动范围，pan 才不会被夹住
    store().setPan(0, 0);

    probe.last().panBy(-10, -5);
    probe.last().panBy(-20, -15);
    tick();

    expect(store().panX).toBeCloseTo(-30, 6);
    expect(store().panY).toBeCloseTo(-20, 6);
    probe.unmount();
  });

  it('帧跑完后再提交会排新的一帧', () => {
    const probe = mount();

    probe.last().panBy(-5, 0);
    tick();
    expect(frames).toHaveLength(0);

    probe.last().panBy(-5, 0);
    expect(frames).toHaveLength(1);
    probe.unmount();
  });

  it('没有累积量时那一帧不写 store', () => {
    const probe = mount();
    // 倍率 1、位移 0 是空变化，flush 应该直接返回
    probe.last().zoomBy(1, null);
    const snapshot = useEditorStore.getState();

    tick();

    expect(useEditorStore.getState()).toBe(snapshot);
    probe.unmount();
  });

  it('非法倍率与非法位移被丢掉，不会污染视图', () => {
    const probe = mount();
    const before = { zoom: store().zoom, panX: store().panX, panY: store().panY };

    probe.last().zoomBy(Number.NaN, null);
    probe.last().zoomBy(0, null);
    probe.last().panBy(Number.NaN, 0);
    tick();

    expect(store().zoom).toBe(before.zoom);
    expect(Number.isNaN(store().panX)).toBe(false);
    expect(store().panX).toBe(before.panX);
    expect(store().panY).toBe(before.panY);
    probe.unmount();
  });

  it('两个提交口的引用跨重渲染保持不变', () => {
    const probe = mount();
    const first = probe.last();

    probe.rerender();

    // 变了的话 CanvasArea 里挂它的 useEffect 会每次重渲染都重绑监听器
    expect(probe.last().zoomBy).toBe(first.zoomBy);
    expect(probe.last().panBy).toBe(first.panBy);
    probe.unmount();
  });
});

/*
 * 交互标志是渲染质量分档的开关（见 engine/viewportRender）。
 * 一次手势只该翻两次：起手 true、停手 false。中途误判成停手会插进一次
 * 高质量重绘，比不分档更卡。
 */
describe('useViewFrame 的交互标志', () => {
  it('第一次提交就置位，不用等到帧跑完', () => {
    const probe = mount();

    probe.last().panBy(-1, 0);

    expect(store().viewInteracting).toBe(true);
    probe.unmount();
  });

  it('停手一段时间后复位', () => {
    const probe = mount();
    probe.last().panBy(-1, 0);

    vi.advanceTimersByTime(500);

    expect(store().viewInteracting).toBe(false);
    probe.unmount();
  });

  it('事件持续到来时不会中途复位', () => {
    const probe = mount();

    // 每 40ms 来一次，模拟触控板的自然间隔
    for (let i = 0; i < 6; i += 1) {
      probe.last().panBy(-1, 0);
      vi.advanceTimersByTime(40);
      tick();
      expect(store().viewInteracting).toBe(true);
    }

    probe.unmount();
  });

  it('缩放与平移共用同一个落定判定', () => {
    const probe = mount();

    probe.last().zoomBy(1.1, null);
    vi.advanceTimersByTime(60);
    probe.last().panBy(-3, 0);
    vi.advanceTimersByTime(60);
    // 后一次事件把倒计时推后了，这时还不该复位
    expect(store().viewInteracting).toBe(true);

    vi.advanceTimersByTime(500);
    expect(store().viewInteracting).toBe(false);
    probe.unmount();
  });
});

describe('useViewFrame 的卸载清理', () => {
  it('卸载后那一帧不再写 store', () => {
    const probe = mount();
    probe.last().panBy(-10, 0);
    const before = { panX: store().panX, panY: store().panY };

    probe.unmount();
    tick();

    // 没取消的话会对着已卸载的组件提交一次视图变化
    expect(store().panX).toBe(before.panX);
    expect(store().panY).toBe(before.panY);
  });

  it('卸载后落定定时器不再改交互标志', () => {
    const probe = mount();
    probe.last().panBy(-10, 0);
    expect(store().viewInteracting).toBe(true);

    probe.unmount();
    useEditorStore.setState({ viewInteracting: true });
    vi.advanceTimersByTime(500);

    // 定时器没清的话这里会被复位成 false
    expect(store().viewInteracting).toBe(true);
  });
});
