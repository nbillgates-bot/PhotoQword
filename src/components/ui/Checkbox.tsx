/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './ui.module.css';

interface CheckboxProps {
  label: string;
  checked: boolean;
  /**
   * 无可见文字时的无障碍名称。
   * label 为空串的场景（例如列表行里只放一个纯勾选框，名称由旁边的按钮承担）
   * 必须给它，否则读屏软件读不出这个勾选框是干什么的。
   */
  ariaLabel?: string;
  /**
   * 置灰但仍然显示。
   * PS 的选项栏在选项不适用于当前工具时是把控件置灰而不是藏起来，
   * 这样用户扫一眼就知道"这个工具没有这项"，而不是以为自己记错了位置。
   */
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export default function Checkbox({
  label,
  checked,
  ariaLabel,
  disabled,
  onChange,
}: CheckboxProps) {
  return (
    <label className={`${styles.checkbox}${disabled ? ` ${styles.checkboxDisabled}` : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label ? undefined : ariaLabel}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
