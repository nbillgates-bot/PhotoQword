/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** 无障碍名称。图标按钮没有可见文本，必须提供 */
  label: string;
  children: ReactNode;
}

export default function IconButton({
  active = false,
  label,
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={[styles.iconButton, active ? styles.iconButtonActive : '', className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
