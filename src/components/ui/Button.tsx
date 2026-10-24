/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.css';

type Variant = 'default' | 'primary' | 'danger' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const VARIANT_CLASS: Record<Variant, string> = {
  default: '',
  primary: styles.primary,
  danger: styles.danger,
  ghost: styles.ghost,
};

export default function Button({ variant = 'default', className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={[styles.button, VARIANT_CLASS[variant], className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}
