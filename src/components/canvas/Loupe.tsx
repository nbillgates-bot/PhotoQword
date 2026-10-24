/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef } from 'react';
import styles from './CanvasArea.module.css';
import type { Point } from '../../types';
import { LOUPE_SIZE, loupePlacement, loupeSourceRect } from '../../engine/loupe';

interface LoupeProps {
  /** 指尖位置（视口 CSS 坐标）。由 CanvasArea 换算好传进来 */
  center: Point;
  /** 主画布：已经合成好的文档内容 */
  mainCanvas: HTMLCanvasElement | null;
  /** 覆盖层：选区蚂蚁线、变换框、参考线 */
  overlayCanvas: HTMLCanvasElement | null;
  /** 视口尺寸（CSS 像素），用来把放大镜夹在视口内 */
  viewport: { width: number; height: number };
}

/** 中心十字线的臂长（CSS 像素） */
const CROSS_ARM = 8;

/**
 * 放大镜：指尖下方那一块的放大图。
 *
 * **为什么要它**：手指会把自己要对准的地方整个盖住，而拖变换手柄、拖选区边、
 * 吸管取色这几件事的成败都在一两个像素上。取自 PS on iPad。
 * **什么时候出现**由 tools/loupeDefs.ts 定，这里只管「给一个中心点，画出来」。
 *
 * 像素直接从主画布和覆盖层上取（TODO 的要求：复用已合成的结果，不重新合成）。
 * 两层都取同一块源矩形再叠起来 —— 只取主画布的话，拖选区边时最该看清的那条
 * 蚂蚁线恰恰看不见，它画在覆盖层上。
 */
export default function Loupe({ center, mainCanvas, overlayCanvas, viewport }: LoupeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /*
   * 刻意不写依赖数组。
   *
   * 两个源画布是可变引用，React 看不见它们的像素变化（同 CLAUDE.md 2.2 那条），
   * 所以能依赖的只有「父组件又渲染了一次」这个事实。拖动中每个 pointermove
   * 都会更新 store 里的 cursorPos，父组件必然重渲染，频率足够跟手。
   *
   * 画在 rAF 里而不是同步画：子组件的 effect 跑在父组件的 effect **之前**，
   * 而主画布和覆盖层是在 CanvasArea 自己的 effect 里重画的。同步画会取到
   * 上一帧的内容，放大镜比手指慢一帧。rAF 排到本帧绘制之后，两层都已是最新的。
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mainCanvas) return;
    const handle = requestAnimationFrame(() => {
      paintLoupe({ canvas, mainCanvas, overlayCanvas, center });
    });
    return () => cancelAnimationFrame(handle);
  });

  const position = loupePlacement({ center, viewport });

  return (
    <canvas
      ref={canvasRef}
      className={styles.loupe}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${LOUPE_SIZE}px`,
        height: `${LOUPE_SIZE}px`,
      }}
      // 纯视觉辅助，读屏软件念它没有意义
      aria-hidden="true"
    />
  );
}

/** 把两层源画布的同一块区域放大画进放大镜，再压一个十字线 */
function paintLoupe(args: {
  canvas: HTMLCanvasElement;
  mainCanvas: HTMLCanvasElement;
  overlayCanvas: HTMLCanvasElement | null;
  center: Point;
}): void {
  const { canvas, mainCanvas, overlayCanvas, center } = args;
  const context = canvas.getContext('2d');
  if (!context) return;

  const dpr = window.devicePixelRatio || 1;
  // 背衬也乘 dpr，2x 屏上才是锐利的；赋值前先比一次，赋值会清空画布
  const backing = Math.round(LOUPE_SIZE * dpr);
  if (canvas.width !== backing || canvas.height !== backing) {
    canvas.width = backing;
    canvas.height = backing;
  }

  const source = loupeSourceRect({ center, dpr });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, backing, backing);
  /*
   * 关掉插值：放大镜的用处是「看清是哪几个像素」，平滑之后边界糊成一片，
   * 恰好毁掉它唯一的价值。与主画布 300% 以上关插值同一个道理。
   */
  context.imageSmoothingEnabled = false;

  for (const layer of [mainCanvas, overlayCanvas]) {
    if (!layer) continue;
    context.drawImage(
      layer,
      source.x,
      source.y,
      source.width,
      source.height,
      0,
      0,
      backing,
      backing,
    );
  }

  const middle = backing / 2;
  const arm = CROSS_ARM * dpr;
  context.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  context.lineWidth = Math.max(1, dpr);
  context.beginPath();
  context.moveTo(middle - arm, middle);
  context.lineTo(middle + arm, middle);
  context.moveTo(middle, middle - arm);
  context.lineTo(middle, middle + arm);
  context.stroke();
}
