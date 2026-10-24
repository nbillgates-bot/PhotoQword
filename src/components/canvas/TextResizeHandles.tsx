/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { PointerEvent } from 'react';
import styles from './TextEditor.module.css';

/** 8 个方向，顺序与 PS 变换框的手柄一致（四角 + 四边中点） */
const DIRECTIONS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

/** 方向 → 样式类名。原本是 8 段一模一样的 JSX，改成映射表驱动（规约 §1.2） */
const HANDLE_CLASS: Record<(typeof DIRECTIONS)[number], string> = {
  nw: styles.handleNw,
  n: styles.handleN,
  ne: styles.handleNe,
  e: styles.handleE,
  se: styles.handleSe,
  s: styles.handleS,
  sw: styles.handleSw,
  w: styles.handleW,
};

interface TextResizeHandlesProps {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
}

/** 段落文本边界框的 8 个调整手柄 */
export default function TextResizeHandles({ onPointerDown }: TextResizeHandlesProps) {
  return (
    <>
      {DIRECTIONS.map((direction) => (
        <div
          key={direction}
          className={`${styles.handle} ${HANDLE_CLASS[direction]}`}
          data-direction={direction}
          onPointerDown={onPointerDown}
        />
      ))}
    </>
  );
}
