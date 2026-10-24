/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 极简的 hook 测试脚手架。
 *
 * 没引 @testing-library/react：本项目要测的 hook 都只是"注册副作用"，
 * 用 React 自带的 createRoot + act 就够，不值得为此加一个测试依赖。
 *
 * 与 tools/testKit.ts 同理，本文件不含断言、不被应用代码引用，不会进产物。
 */
import { createElement, type FC } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * 挂载一个只调用该 hook 的空组件，返回卸载函数。
 * 卸载会触发 useEffect 的清理，用来验证监听器被摘掉。
 */
export function renderHook(hook: () => void): () => void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const Probe: FC = () => {
    hook();
    return null;
  };
  act(() => {
    root.render(createElement(Probe));
  });
  return () => {
    act(() => {
      root.unmount();
    });
    host.remove();
  };
}

/** 每次渲染的返回值 + 强制重渲染的手段，用来验证引用是否恒定 */
export interface HookProbe<T> {
  /** 按渲染顺序记下的返回值 */
  renders: T[];
  /** 最近一次的返回值 */
  last: () => T;
  /** 再渲染一次（props 没变，纯粹为了看引用有没有变） */
  rerender: () => void;
  unmount: () => void;
}

/** 同上，但会收集 hook 的返回值，并允许手动触发重渲染 */
export function renderHookWithValue<T>(hook: () => T): HookProbe<T> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const renders: T[] = [];
  const Probe: FC = () => {
    renders.push(hook());
    return null;
  };
  const render = () => {
    act(() => {
      root.render(createElement(Probe));
    });
  };
  render();
  return {
    renders,
    last: () => renders[renders.length - 1],
    // 同一个元素类型再 render 一次就是一次普通重渲染，不会重挂载
    rerender: render,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}
