/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 保持宽高比图标，精确模仿 PS 的样式。
 * 链条图标，横向布局，表示宽度和高度锁定。
 */
export function AspectRatioIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 左侧链环 */}
      <path
        d="M 3 5 L 3 11 A 2 2 0 0 0 5 13 L 6 13 L 6 11 L 5 11 A 0.5 0.5 0 0 1 4.5 10.5 L 4.5 5.5 A 0.5 0.5 0 0 1 5 5 L 6 5 L 6 3 L 5 3 A 2 2 0 0 0 3 5 Z"
        fill="currentColor"
      />
      {/* 右侧链环 */}
      <path
        d="M 13 5 L 13 11 A 2 2 0 0 1 11 13 L 10 13 L 10 11 L 11 11 A 0.5 0.5 0 0 0 11.5 10.5 L 11.5 5.5 A 0.5 0.5 0 0 0 11 5 L 10 5 L 10 3 L 11 3 A 2 2 0 0 1 13 5 Z"
        fill="currentColor"
      />
      {/* 中间横条 */}
      <rect x="6" y="7" width="4" height="2" fill="currentColor" rx="0.5" />
    </svg>
  );
}
