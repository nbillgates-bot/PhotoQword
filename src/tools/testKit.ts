/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 工具层测试的公共脚手架。
 *
 * 每个 ToolHandler 都是"指针事件 → store 操作"的状态机，测起来需要的东西完全一样：
 * 造指针、造上下文、走一遍按下-移动-抬起。这些在各个测试文件里重复了六遍以上，
 * 所以抽到这里（规约 1.1：重复出现两次就提取）。
 *
 * 放在 src 下而不是单独的 test 目录，是为了跟"测试文件与被测文件同目录"的约定一致。
 * 本文件不含断言，也不 import vitest，所以不会被打包进产物——应用代码不引用它。
 */
import type { ToolContext, ToolHandler, ToolPointer } from './types';
import { useEditorStore } from '../store';
import { createToolContext } from './toolContext';

/** 每次现取，避免拿到过期的 store 快照 */
export const store = () => useEditorStore.getState();

/** 造一个指针事件，默认落在 (4,4)。修饰键通过第三个参数覆盖 */
export function pointer(x = 4, y = 4, keys: Partial<ToolPointer> = {}): ToolPointer {
  return {
    point: { x, y },
    screen: { x, y },
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
    pressure: 1,
    button: 0,
    ...keys,
  };
}

/** 工具上下文。store 用 getter，保证工具每次读到的都是最新状态 */
/**
 * 工具上下文。刻意复用生产的 createToolContext，不在这里另造一个。
 * 之前测试侧自己写取值器、生产侧传快照，导致「写完再读拿到旧值」这类 bug
 * 在浏览器里必现却测不出来。
 */
export function context(): ToolContext {
  return createToolContext(() => {});
}

/** 走完一次完整拖拽：按下、移动、抬起 */
export function drag(tool: ToolHandler, from: ToolPointer, to: ToolPointer): void {
  const ctx = context();
  tool.onPointerDown?.(from, ctx);
  tool.onPointerMove?.(to, ctx);
  tool.onPointerUp?.(to, ctx);
}

/** 原地单击：按下与抬起同一点，不产生位移 */
export function click(tool: ToolHandler, at: ToolPointer): void {
  const ctx = context();
  tool.onPointerDown?.(at, ctx);
  tool.onPointerUp?.(at, ctx);
}

/** 建一个 16×16 白底文档，返回底图图层 id */
export function newDoc(width = 16, height = 16): string {
  store().createDoc({ name: '测试', width, height, background: 'white' });
  return store().layers[0].id;
}

/**
 * 像素读取helper下沉到 engine/testUtils.ts 了，这里再导出保持调用点不变。
 * 原因：engine/ 的测试也要用，但不能反向依赖本文件（它 import 了 store）。
 */
export { pixelAt, hasNaN } from '../engine/testUtils';

/** 复位：关掉文档并清掉工具的模块级草稿状态 */
export function reset(...tools: ToolHandler[]): void {
  const ctx = context();
  tools.forEach((tool) => tool.onDeactivate?.(ctx));
  store().closeDoc();
}
