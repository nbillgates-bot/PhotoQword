/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useRef } from 'react';
import styles from './colorPicker.module.css';
import { clamp } from '../../engine/canvasUtils';
import { useT } from '../../hooks/useT';

interface SvFieldProps {
  /** 色相 0-359，决定色域面板的底色 */
  hue: number;
  saturation: number;
  value: number;
  onChange: (saturation: number, value: number) => void;
}

/**
 * 饱和度/明度二维取色面板。
 * 横轴饱和度、纵轴明度（上亮下暗），与 PS 一致。
 */
export default function SvField({ hue, saturation, value, onChange }: SvFieldProps) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);

  const pick = (clientX: number, clientY: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    onChange(
      clamp((clientX - box.left) / box.width, 0, 1),
      1 - clamp((clientY - box.top) / box.height, 0, 1),
    );
  };

  /** 键盘微调：方向键每次 1%，Shift 加速到 10% */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    onChange(clamp(saturation + move[0], 0, 1), clamp(value + move[1], 0, 1));
  };

  return (
    <div
      ref={ref}
      className={styles.sv}
      role="slider"
      tabIndex={0}
      aria-label={t('color.svField')}
      aria-valuetext={t('color.svValue', { s: Math.round(saturation * 100), v: Math.round(value * 100) })}
      style={{
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue} 100% 50%))`,
      }}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        // 只在按住时跟随，避免鼠标划过就改色
        if (event.buttons === 1) pick(event.clientX, event.clientY);
      }}
    >
      <span
        className={styles.svCursor}
        style={{ left: `${saturation * 100}%`, top: `${(1 - value) * 100}%` }}
      />
    </div>
  );
}
