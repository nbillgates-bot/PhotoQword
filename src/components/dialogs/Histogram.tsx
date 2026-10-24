/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef } from 'react';
import { ctx2d } from '../../engine/canvasUtils';
import styles from './Dialogs.module.css';
import { useT } from '../../hooks/useT';

interface HistogramProps {
  /** 256 项计数 */
  data: Uint32Array;
  height?: number;
}

/**
 * 色阶/曲线用的直方图底图。
 * 纵轴按最大计数归一化，不做对数压缩——PS 默认也是线性，
 * 需要看清暗部细节时用户自己会去挪黑场。
 */
export default function Histogram({ data, height = 80 }: HistogramProps) {
  const t = useT();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = ctx2d(canvas);
    const { width } = canvas;
    context.clearRect(0, 0, width, height);

    let peak = 0;
    for (const value of data) if (value > peak) peak = value;
    if (peak === 0) return; // 全透明图没有可画的柱子

    context.fillStyle = 'rgba(140, 150, 165, 0.85)';
    const step = width / 256;
    for (let i = 0; i < 256; i += 1) {
      const bar = (data[i] / peak) * height;
      if (bar <= 0) continue;
      context.fillRect(i * step, height - bar, Math.max(step, 1), bar);
    }
  }, [data, height]);

  return (
    <canvas
      ref={ref}
      width={256}
      height={height}
      className={styles.histogram}
      role="img"
      aria-label={t('levels.histogram')}
    />
  );
}
