/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef } from 'react';
import styles from './CanvasArea.module.css';
import type { Guide } from '../../types';

interface RulersProps {
  /** 文档原点在视口中的位置 */
  origin: { x: number; y: number };
  zoom: number;
  /** 视口尺寸 */
  size: { width: number; height: number };
  cursor: { x: number; y: number } | null;
  /** 在标尺上按下：拖出一条参考线。横标尺给 'h'，竖标尺给 'v' */
  onGuideDragStart: (event: React.PointerEvent<HTMLCanvasElement>, orientation: 'h' | 'v') => void;
  onGuideDragMove: (event: React.PointerEvent) => void;
  onGuideDragEnd: (event: React.PointerEvent) => void;
  /** 参考线列表 */
  guides: Guide[];
  /** 是否显示参考线 */
  showGuides: boolean;
}

/** PS 默认参考线颜色（青色） */
const GUIDE_COLOR = '#00a0ff';

/** 标尺厚度，横竖一致 */
const RULER_SIZE = 20;

/** 一条参考线的定位样式。水平线横贯画布区，垂直线纵贯画布区，线宽 1px 同 PS */
function guideStyle(
  guide: Guide,
  origin: { x: number; y: number },
  zoom: number,
  size: { width: number; height: number },
): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    background: GUIDE_COLOR,
    pointerEvents: 'none',
    zIndex: 140,
  };
  if (guide.orientation === 'h') {
    return {
      ...base,
      left: RULER_SIZE,
      top: Math.round(guide.position * zoom + origin.y) + RULER_SIZE,
      width: Math.max(0, size.width - RULER_SIZE),
      height: 1,
    };
  }
  return {
    ...base,
    left: Math.round(guide.position * zoom + origin.x) + RULER_SIZE,
    top: RULER_SIZE,
    width: 1,
    height: Math.max(0, size.height - RULER_SIZE),
  };
}

/** 依据缩放挑一个合适的刻度间隔，保证标签不重叠 */
function tickStep(zoom: number): number {
  const candidates = [1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  return candidates.find((step) => step * zoom >= 56) ?? 10000;
}

/** 水平/垂直标尺。用 canvas 绘制，避免大量 DOM 节点 */
export default function Rulers({
  origin,
  zoom,
  size,
  cursor,
  onGuideDragStart,
  onGuideDragMove,
  onGuideDragEnd,
  guides,
  showGuides,
}: RulersProps) {
  const hRef = useRef<HTMLCanvasElement>(null);
  const vRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const dpr = window.devicePixelRatio || 1;
    const step = tickStep(zoom);

    const drawH = () => {
      const canvas = hRef.current;
      if (!canvas) return;
      const width = Math.max(1, size.width - 20);
      canvas.width = width * dpr;
      canvas.height = 20 * dpr;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, width, 20);
      context.font = '9px sans-serif';
      context.fillStyle = '#808080';
      context.strokeStyle = '#606060';
      context.lineWidth = 1;

      const first = Math.floor(-origin.x / zoom / step) * step;
      const last = Math.ceil((width - origin.x) / zoom / step) * step;
      for (let value = first; value <= last; value += step) {
        const x = Math.round(origin.x + value * zoom) + 0.5;
        if (x < 0 || x > width) continue;
        context.beginPath();
        context.moveTo(x, 13);
        context.lineTo(x, 20);
        context.stroke();
        context.fillText(String(value), x + 2, 10);
      }

      // 光标位置指示
      if (cursor) {
        const x = Math.round(origin.x + cursor.x * zoom) + 0.5;
        context.strokeStyle = '#4a9eff';
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, 20);
        context.stroke();
      }
    };

    const drawV = () => {
      const canvas = vRef.current;
      if (!canvas) return;
      const height = Math.max(1, size.height - 20);
      canvas.width = 20 * dpr;
      canvas.height = height * dpr;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(dpr, dpr);
      context.clearRect(0, 0, 20, height);
      context.font = '9px sans-serif';
      context.fillStyle = '#808080';
      context.strokeStyle = '#606060';
      context.lineWidth = 1;

      const first = Math.floor(-origin.y / zoom / step) * step;
      const last = Math.ceil((height - origin.y) / zoom / step) * step;
      for (let value = first; value <= last; value += step) {
        const y = Math.round(origin.y + value * zoom) + 0.5;
        if (y < 0 || y > height) continue;
        context.beginPath();
        context.moveTo(13, y);
        context.lineTo(20, y);
        context.stroke();
        // 竖排标签旋转 90°
        context.save();
        context.translate(9, y + 2);
        context.rotate(-Math.PI / 2);
        context.fillText(String(value), -String(value).length * 5 - 2, 0);
        context.restore();
      }

      if (cursor) {
        const y = Math.round(origin.y + cursor.y * zoom) + 0.5;
        context.strokeStyle = '#4a9eff';
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(20, y);
        context.stroke();
      }
    };

    drawH();
    drawV();
  }, [origin, zoom, size, cursor, guides, showGuides]);

  return (
    <>
      <div className={styles.rulerCorner} />
      {/*
       * 标尺上按下即拖出参考线，光标用 row-resize / col-resize 提示可拖方向。
       * aria-hidden 保留：标尺是纯视觉参照，读屏没有可播报的内容，
       * 拖参考线也有「视图」菜单里的键盘路径兜底。
       */}
      <canvas
        ref={hRef}
        className={styles.rulerH}
        style={{ width: size.width - 20, height: 20 }}
        aria-hidden="true"
        onPointerDown={(event) => onGuideDragStart(event, 'h')}
        onPointerMove={onGuideDragMove}
        onPointerUp={onGuideDragEnd}
        onPointerCancel={onGuideDragEnd}
      />

      <canvas
        ref={vRef}
        className={styles.rulerV}
        style={{ width: 20, height: size.height - 20 }}
        aria-hidden="true"
        onPointerDown={(event) => onGuideDragStart(event, 'v')}
        onPointerMove={onGuideDragMove}
        onPointerUp={onGuideDragEnd}
        onPointerCancel={onGuideDragEnd}
      />

      {/*
       * 参考线只画在标尺围出的画布区内（左上各让开 20px），不覆盖标尺本身。
       * 拖到文档外时坐标会落进标尺区，靠标尺 z-index(150) > 参考线(140)
       * 自然遮住，效果等同 PS 里参考线滑进标尺就消失。
       */}
      {showGuides &&
        guides.map((guide) => (
          <div key={guide.id} style={guideStyle(guide, origin, zoom, size)} aria-hidden="true" />
        ))}
    </>
  );
}