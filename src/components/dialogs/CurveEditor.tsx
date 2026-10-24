/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, useState } from 'react';
import { buildCurveLut, type CurvePoint } from '../../engine/curves';
import {
  CURVE_SIZE,
  addControlPoint,
  hitPoint,
  moveControlPoint,
  removeControlPoint,
  toCurvePoint,
} from '../../engine/curveEditing';
import { ctx2d } from '../../engine/canvasUtils';
import styles from './Dialogs.module.css';
import { useT } from '../../hooks/useT';

interface CurveEditorProps {
  points: CurvePoint[];
  /** 可选的背景直方图，256 项 */
  histogram?: Uint32Array;
  onChange: (points: CurvePoint[]) => void;
}

/** 直方图打底 + 网格 + 对角参考线 + 曲线 + 控制点 */
function draw(
  canvas: HTMLCanvasElement,
  points: CurvePoint[],
  lut: Uint8ClampedArray,
  histogram?: Uint32Array,
) {
  const context = ctx2d(canvas);
  context.clearRect(0, 0, CURVE_SIZE, CURVE_SIZE);

  if (histogram) {
    let peak = 0;
    for (const value of histogram) if (value > peak) peak = value;
    if (peak > 0) {
      context.fillStyle = 'rgba(140, 150, 165, 0.35)';
      for (let i = 0; i < 256; i += 1) {
        const bar = (histogram[i] / peak) * CURVE_SIZE;
        if (bar > 0) context.fillRect(i, CURVE_SIZE - bar, 1, bar);
      }
    }
  }

  context.strokeStyle = 'rgba(128, 128, 128, 0.35)';
  context.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const at = (CURVE_SIZE / 4) * i + 0.5;
    context.beginPath();
    context.moveTo(at, 0);
    context.lineTo(at, CURVE_SIZE);
    context.moveTo(0, at);
    context.lineTo(CURVE_SIZE, at);
    context.stroke();
  }

  // 对角线：恒等参考
  context.strokeStyle = 'rgba(128, 128, 128, 0.6)';
  context.beginPath();
  context.moveTo(0, CURVE_SIZE);
  context.lineTo(CURVE_SIZE, 0);
  context.stroke();

  // 曲线直接画 LUT，保证所见即所得
  context.strokeStyle = '#e8eaed';
  context.lineWidth = 1.5;
  context.beginPath();
  for (let i = 0; i < 256; i += 1) {
    const y = 255 - lut[i];
    if (i === 0) context.moveTo(i, y);
    else context.lineTo(i, y);
  }
  context.stroke();

  context.fillStyle = '#e8eaed';
  context.strokeStyle = '#1a1a1a';
  context.lineWidth = 1;
  for (const point of points) {
    context.beginPath();
    context.arc(point.x, 255 - point.y, 3.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
}

/** 曲线编辑网格：只做渲染和事件绑定，点集运算在 engine/curveEditing */
export default function CurveEditor({ points, histogram, onChange }: CurveEditorProps) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) draw(canvas, points, buildCurveLut(points), histogram);
  }, [points, histogram]);

  /**
   * 用 getBoundingClientRect 而不是 offsetX：offsetX 在 Safari 上
   * 对 canvas 取值不稳，且 CSS 缩放后本来就得自己换算。
   */
  const locate = (event: { clientX: number; clientY: number }, element: HTMLCanvasElement) => {
    const rect = element.getBoundingClientRect();
    const scale = rect.width === 0 ? 1 : CURVE_SIZE / rect.width;
    return toCurvePoint((event.clientX - rect.left) * scale, (event.clientY - rect.top) * scale);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const at = locate(event, event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);

    const hit = hitPoint(points, at);
    if (hit >= 0) {
      setDragIndex(hit);
      return;
    }
    // 空白处按下即加点并进入拖拽，少一次点击
    const result = addControlPoint(points, at);
    setDragIndex(result.index);
    onChange(result.points);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (dragIndex === null) return;
    const result = moveControlPoint(points, dragIndex, locate(event, event.currentTarget));
    setDragIndex(result.index);
    onChange(result.points);
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragIndex(null);
  };

  const onDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const at = locate(event, event.currentTarget);
    onChange(removeControlPoint(points, hitPoint(points, at)));
  };

  return (
    <canvas
      ref={canvasRef}
      width={CURVE_SIZE}
      height={CURVE_SIZE}
      className={styles.curveCanvas}
      role="img"
      aria-label={t('curves.editor')}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onDoubleClick}
    />
  );
}
