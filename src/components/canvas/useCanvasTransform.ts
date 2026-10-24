/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback } from 'react';
import type { Point } from '../../types';
import { documentOrigin } from '../../engine/viewportRect';

interface TransformArgs {
  /** 画布容器（视口）元素 */
  viewport: HTMLElement | null;
  docWidth: number;
  docHeight: number;
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * 视口坐标 <-> 文档坐标 的换算。
 * 文档始终在视口中居中，再叠加 pan 偏移，最后按 zoom 缩放。
 */
export function useCanvasTransform({
  viewport,
  docWidth,
  docHeight,
  zoom,
  panX,
  panY,
}: TransformArgs) {
  /** 文档左上角在视口中的位置 */
  const originOf = useCallback(() => {
    if (!viewport) return { x: 0, y: 0 };
    const box = viewport.getBoundingClientRect();
    return documentOrigin({
      viewport: { width: box.width, height: box.height },
      docWidth,
      docHeight,
      zoom,
      panX,
      panY,
    });
  }, [viewport, docWidth, docHeight, zoom, panX, panY]);

  /** 客户端坐标 -> 文档坐标 */
  const toDoc = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!viewport) return { x: 0, y: 0 };
      const box = viewport.getBoundingClientRect();
      const origin = originOf();
      return {
        x: (clientX - box.left - origin.x) / zoom,
        y: (clientY - box.top - origin.y) / zoom,
      };
    },
    [viewport, originOf, zoom],
  );

  /** 客户端坐标 -> 视口内坐标 */
  const toViewport = useCallback(
    (clientX: number, clientY: number): Point => {
      if (!viewport) return { x: 0, y: 0 };
      const box = viewport.getBoundingClientRect();
      return { x: clientX - box.left, y: clientY - box.top };
    },
    [viewport],
  );

  return { originOf, toDoc, toViewport };
}
