/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHookWithValue } from './testHookKit';
import { useWebFontReady } from './useWebFontReady';
import { NORMAL_WEIGHT } from '../engine/fontWeights';
import { useEditorStore } from '../store';

/**
 * 这里只测 hook 自己那点逻辑：订阅、按 family 过滤、退订、已到货就别再等、
 * 以及三个状态各自给什么提示。
 * 真正的下载与通知链路在 engine/webFontLoader.test.ts 里测，
 * 所以这份把整个模块换成替身，免得把网络环境的那套 stub 抄第二遍。
 *
 * hook 不返回值，可观察的效果只有两个：到货时多渲染一次，以及弹 toast。
 */

type Status = 'start' | 'loaded' | 'failed';

const mocks = vi.hoisted(() => ({
  /* 一个家族的每档字重是独立的一个文件，所以已到货的账要按「家族+字重」记 */
  loadedFamilies: new Set<string>(),
  listeners: new Set<(family: string, status: 'start' | 'loaded' | 'failed') => void>(),
  requestSpy: vi.fn(),
  // 这个字面量就是 NORMAL_WEIGHT。vi.mock 的工厂在模块求值前就跑，
  // 引进来的常量那时还没初始化，只能写死
  key: (family: string, weight = 400) => `${family}@${weight}`,
}));

vi.mock('../engine/webFontLoader', () => ({
  isWebFontLoaded: (family: string, weight?: number) =>
    mocks.loadedFamilies.has(mocks.key(family, weight)),
  onWebFontStatus: (listener: (family: string, status: Status) => void) => {
    mocks.listeners.add(listener);
    return () => {
      mocks.listeners.delete(listener);
    };
  },
  requestWebFont: mocks.requestSpy,
}));

const FAMILY = 'Noto Sans SC';

/** 当前那条 toast，没有就是 null */
const currentToast = () => useEditorStore.getState().toast;

/** 挂一个只调这个 hook 的探针，renders.length 就是渲染次数 */
function mount(family = FAMILY, weight = NORMAL_WEIGHT) {
  return renderHookWithValue(() => {
    useWebFontReady(family, weight);
    return null;
  });
}

/** 把某个家族的某一档记成已到货（不发通知） */
function markLoaded(family: string, weight = NORMAL_WEIGHT): void {
  mocks.loadedFamilies.add(mocks.key(family, weight));
}

/** 派发一次状态变化 */
function emit(family: string, status: Status): void {
  act(() => {
    for (const listener of [...mocks.listeners]) listener(family, status);
  });
}

/** 模拟字体到货：先记成已加载，再通知所有订阅方 */
function arrive(family: string, weight = NORMAL_WEIGHT): void {
  markLoaded(family, weight);
  emit(family, 'loaded');
}

beforeEach(() => {
  mocks.loadedFamilies.clear();
  mocks.listeners.clear();
  mocks.requestSpy.mockReset();
  useEditorStore.setState({ toast: null });
});

describe('useWebFontReady', () => {
  it('挂载时订阅并去要这个字体', () => {
    const probe = mount();

    expect(mocks.requestSpy).toHaveBeenCalledWith(FAMILY, NORMAL_WEIGHT);
    expect(mocks.listeners.size).toBe(1);
    probe.unmount();
  });

  it('目标字体到货时重渲染一次', () => {
    const probe = mount();
    const before = probe.renders.length;

    arrive(FAMILY);

    expect(probe.renders.length).toBe(before + 1);
    probe.unmount();
  });

  it('别的字体到货不触发重渲染', () => {
    const probe = mount();
    const before = probe.renders.length;

    arrive('Noto Serif SC');

    // 不过滤的话，一个中文层会被另一个层的字体到货带着白量一遍
    expect(probe.renders.length).toBe(before);
    probe.unmount();
  });

  it('到货两次就重渲染两次', () => {
    const probe = mount();
    const before = probe.renders.length;

    arrive(FAMILY);
    arrive(FAMILY);

    expect(probe.renders.length).toBe(before + 2);
    probe.unmount();
  });

  it('字体已经在手上时不订阅也不再请求', () => {
    markLoaded(FAMILY);

    const probe = mount();

    expect(mocks.requestSpy).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
    probe.unmount();
  });

  it('卸载后摘掉监听器', () => {
    const probe = mount();
    expect(mocks.listeners.size).toBe(1);

    probe.unmount();

    // 留着的话，编辑框关掉之后字体到货还会往已卸载的组件上派发更新
    expect(mocks.listeners.size).toBe(0);
  });

  it('换一个 family 会退掉旧订阅，只留一个', () => {
    const host = renderHookWithValue(() => {
      useWebFontReady(FAMILY);
      return null;
    });
    expect(mocks.listeners.size).toBe(1);
    host.unmount();

    const next = mount('Noto Serif SC');
    expect(mocks.listeners.size).toBe(1);
    expect(mocks.requestSpy).toHaveBeenLastCalledWith('Noto Serif SC', NORMAL_WEIGHT);
    next.unmount();
  });

  /*
   * 字重要一路带到 requestWebFont：不带的话所有层都只会去下常规体，
   * Light 的层拿到常规字面，粗细还是不对，5MB 白下。
   */
  describe('字重', () => {
    it('把这一层要的字重原样递下去', () => {
      const probe = mount(FAMILY, 300);

      expect(mocks.requestSpy).toHaveBeenCalledWith(FAMILY, 300);
      probe.unmount();
    });

    it('同家族别的字重到货，不算这一层的字体到手', () => {
      // 700 在手上不代表 300 也在手上，还得照样订阅、照样去要
      markLoaded(FAMILY, 700);

      const probe = mount(FAMILY, 300);

      expect(mocks.requestSpy).toHaveBeenCalledWith(FAMILY, 300);
      expect(mocks.listeners.size).toBe(1);
      probe.unmount();
    });

    it('这一层要的那档已在手上时就不再要了', () => {
      markLoaded(FAMILY, 300);

      const probe = mount(FAMILY, 300);

      expect(mocks.requestSpy).not.toHaveBeenCalled();
      expect(mocks.listeners.size).toBe(0);
      probe.unmount();
    });

    it('只改字重也要重新订阅并重新请求', () => {
      const host = mount(FAMILY, 300);
      host.unmount();

      const next = mount(FAMILY, 700);

      // 依赖数组漏了 fontWeight 的话，这次请求根本不会发出去
      expect(mocks.requestSpy).toHaveBeenLastCalledWith(FAMILY, 700);
      expect(mocks.listeners.size).toBe(1);
      next.unmount();
    });
  });

  it('先订阅再请求，请求瞬间完成也不会漏掉通知', () => {
    // 这条守的是 useWebFontReady 里那两行的顺序：反过来写就收不到这次通知
    mocks.requestSpy.mockImplementation((family: string, weight: number) => {
      markLoaded(family, weight);
      for (const listener of [...mocks.listeners]) listener(family, 'loaded');
    });

    const probe = mount();

    // 初次渲染 + 到货触发的那次
    expect(probe.renders.length).toBeGreaterThan(1);
    probe.unmount();
  });
});

/*
 * 中文字体动辄几 MB，静默下载会让人以为编辑器卡住了；
 * 而且字到货那一下文字会重新排版、位置微动，事先说一声才不会以为是 bug。
 * 失败更不能不吭声（规约 §7）。
 */
describe('useWebFontReady 的提示', () => {
  it('开始下载时说一声，带上字体名', () => {
    const probe = mount();

    emit(FAMILY, 'start');

    // 字体名现在走 params，不在 message 里（message 是词条 key）
    expect(currentToast()?.message).toMatch(/^toast\.font\./);
    expect(currentToast()?.params).toMatchObject({ family: FAMILY });
    expect(currentToast()?.kind).toBe('info');
    probe.unmount();
  });

  it('到货了给个成功提示', () => {
    const probe = mount();

    arrive(FAMILY);

    // 字体名现在走 params，不在 message 里（message 是词条 key）
    expect(currentToast()?.message).toMatch(/^toast\.font\./);
    expect(currentToast()?.params).toMatchObject({ family: FAMILY });
    expect(currentToast()?.kind).toBe('success');
    probe.unmount();
  });

  it('下载失败要报错，不能静默退回后备字体', () => {
    const probe = mount();

    emit(FAMILY, 'failed');

    expect(currentToast()?.kind).toBe('error');
    // 字体名现在走 params，不在 message 里（message 是词条 key）
    expect(currentToast()?.message).toMatch(/^toast\.font\./);
    expect(currentToast()?.params).toMatchObject({ family: FAMILY });
    probe.unmount();
  });

  it('别的字体的状态一概不提示', () => {
    const probe = mount();

    emit('Noto Serif SC', 'start');
    emit('Noto Serif SC', 'failed');

    expect(currentToast()).toBeNull();
    probe.unmount();
  });

  it('字体已经在手上时一句话都不说', () => {
    markLoaded(FAMILY);

    const probe = mount();

    expect(currentToast()).toBeNull();
    probe.unmount();
  });
});
