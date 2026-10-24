/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './CanvasArea.module.css';
import type { Rect } from '../../types';

interface LayerEdgesProps {
  /** 图层内容在文档坐标系里的矩形，为 null 时不画 */
  rect: Rect | null;
  zoom: number;
}

/**
 * 图层边缘（PS：视图 > 显示 > 图层边缘）。
 *
 * 画的是当前图层**内容**的外接框，不是画布范围——图层被撑大之后四周是空的，
 * 框在空白上没有意义，PS 显示的也是内容范围。
 *
 * 为什么用绝对定位的 div 而不是画在覆盖层画布上：
 * 覆盖层画布与文档同尺寸，图层被移出画布之后边框落在文档之外，画上去会被裁掉，
 * 而"图层跑到画布外了"恰恰是最需要这个框的时候。stage 没有 overflow: hidden，
 * 所以定位元素可以越出文档范围显示，只被视口裁剪。
 */
export default function LayerEdges({ rect, zoom }: LayerEdgesProps) {
  if (!rect) return null;
  return (
    <div
      className={styles.layerEdges}
      style={{
        left: rect.x * zoom,
        top: rect.y * zoom,
        width: rect.width * zoom,
        height: rect.height * zoom,
      }}
    />
  );
}
