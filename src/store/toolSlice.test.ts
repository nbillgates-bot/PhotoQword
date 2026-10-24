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

/**
 * 工具切换的副作用。
 *
 * 这里只测「切工具自动提交裁剪/变换」这个 PS 行为，
 * 不测工具自己的逻辑（那些有专门的测试文件）。
 */

const store = () => useEditorStore.getState();

function newDoc() {
  store().createDoc({ width: 100, height: 100, background: 'white', name: '测试' });
}

beforeEach(() => {
  store().closeDoc();
  // 清理测试之间可能遗留的工具状态
  if (store().transformSession) {
    store().cancelTransform();
  }
  if (store().cropRect) {
    store().cancelCrop();
  }
  if (store().activeDialog) {
    store().closeDialog();
  }
  // 重置工具为默认值
  store().setTool('brush');
});

describe('setTool 自动提交操作', () => {
  it('裁剪框存在时，切工具弹出确认对话框', () => {
    newDoc();
    store().setTool('crop');
    store().setCropRect({ x: 10, y: 10, width: 50, height: 50 });
    expect(store().cropRect).not.toBeNull();

    // 切到移动工具，与 PS 行为一致：弹出确认对话框
    store().setTool('move');
    expect(store().activeDialog).toBe('confirm-crop');
    expect(store().dialogPayload).toBe('move');
    expect(store().activeTool).toBe('crop'); // 工具尚未切换
    expect(store().cropRect).not.toBeNull(); // cropRect 尚未清除

    // 模拟用户选择"裁剪"
    store().commitCrop();
    store().setTool('move');
    expect(store().doc?.width).toBe(50);
    expect(store().doc?.height).toBe(50);
    expect(store().cropRect).toBeNull();
    expect(store().activeTool).toBe('move');
  });

  it('从裁剪切到其他工具也弹出确认对话框', () => {
    newDoc();
    store().setTool('crop');
    store().setCropRect({ x: 10, y: 10, width: 60, height: 60 });
    const rect = store().cropRect;
    expect(rect).not.toBeNull();

    // 切到笔刷，弹出确认对话框
    store().setTool('brush');
    expect(store().activeDialog).toBe('confirm-crop');
    expect(store().dialogPayload).toBe('brush');
    expect(store().activeTool).toBe('crop'); // 工具尚未切换
    expect(store().cropRect).toBe(rect); // cropRect 尚未清除

    // 模拟用户选择"不裁剪"
    store().cancelCrop();
    store().setTool('brush');
    expect(store().cropRect).toBeNull();
    expect(store().doc?.width).toBe(100); // 文档尺寸不变
    expect(store().activeTool).toBe('brush');
  });

  it('自由变换进行中时，切到移动工具应用变换', () => {
    newDoc();
    const layer = store().layers[0];
    const context = ctx2d(layer.canvas);
    context.fillStyle = '#ff0000';
    context.fillRect(20, 20, 40, 40);
    store().bumpRevision();

    // 开启变换的正确方式是调 beginTransform，不是 setTool('transform')
    store().setTool('transform');
    store().beginTransform();
    const session = store().transformSession;
    expect(session).not.toBeNull();

    // 实际改动变换：移动一点
    if (session) {
      store().updateTransform({
        rect: { ...session.state.rect, x: session.state.rect.x + 10 },
        angle: 0,
        skewX: 0,
        skewY: 0,
      });
    }

    // 切到移动工具，会弹出确认对话框
    store().setTool('move');
    expect(store().activeDialog).toBe('confirm-transform');
    expect(store().dialogPayload).toBe('move');
    expect(store().activeTool).toBe('transform'); // 工具尚未切换
    expect(store().transformSession).not.toBeNull(); // session 尚未清除

    // 模拟用户选择"应用"
    store().commitTransform();
    store().setTool('move');
    expect(store().transformSession).toBeNull();
    expect(store().activeTool).toBe('move');
  });

  it('从变换切到其他工具弹出确认对话框', () => {
    newDoc();
    store().setTool('transform');
    store().beginTransform();
    const session = store().transformSession;
    expect(session).not.toBeNull();

    // 实际改动变换：旋转一点
    if (session) {
      store().updateTransform({
        rect: session.state.rect,
        angle: 0.1, // 旋转一点
        skewX: 0,
        skewY: 0,
      });
    }

    // 切到笔刷，会弹出确认对话框
    store().setTool('brush');
    expect(store().activeDialog).toBe('confirm-transform');
    expect(store().dialogPayload).toBe('brush');
    expect(store().activeTool).toBe('transform'); // 工具尚未切换
    expect(store().transformSession).not.toBeNull(); // session 尚未清除

    // 模拟用户选择"不应用"
    store().cancelTransform();
    store().setTool('brush');
    expect(store().transformSession).toBeNull();
    expect(store().activeTool).toBe('brush');
  });

  it('从变换切回变换不触发提交', () => {
    newDoc();
    store().setTool('transform');
    store().beginTransform();
    const session = store().transformSession;
    store().setTool('transform');
    // session 应该还是同一个（引用相等），没有被提交并重开
    expect(store().transformSession).toBe(session);
  });

  it('变换未改动时切工具直接取消，不弹对话框', () => {
    newDoc();
    store().setTool('transform');
    store().beginTransform();
    expect(store().transformSession).not.toBeNull();

    // 没有调用 updateTransform，变换未改动
    // 切到移动工具，应该直接取消并切换，不弹对话框
    store().setTool('move');
    expect(store().activeDialog).toBeNull();
    expect(store().transformSession).toBeNull();
    // cancelTransform 会切回 previousTool，不是 move
    // 所以最终工具不是 move
    expect(store().activeTool).not.toBe('transform');
  });

  it('切到 transform 时记录 previousTool，结束时切回去', () => {
    newDoc();
    store().setTool('brush');
    store().setTool('transform');
    store().beginTransform();
    expect(store().previousTool).toBe('brush');
    store().commitTransform();
    expect(store().activeTool).toBe('brush');
  });

  it('没有裁剪框时切工具正常进行', () => {
    newDoc();
    expect(() => store().setTool('brush')).not.toThrow();
    expect(store().activeTool).toBe('brush');
  });

  it('没有文档时也不报错', () => {
    expect(() => store().setTool('move')).not.toThrow();
  });
});
