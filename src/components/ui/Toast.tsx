/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import styles from './toast.module.css';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';
import { translateNested } from '../../i18n/translate';

const ICONS = {
  info: Info,
  success: CheckCircle2,
  error: AlertCircle,
} as const;

/** 全局提示。自动消失由 uiSlice 负责，这里只管展示 */
export default function Toast() {
  const toast = useEditorStore((state) => state.toast);
  const t = useT();
  if (!toast) return null;

  const Icon = ICONS[toast.kind];

  return (
    <div className={`${styles.toast} ${styles[toast.kind]}`} role="status" aria-live="polite">
      <Icon size={15} />
      {/* message 是词条 key（见 UiSlice.toast），在这里按当前语言渲染。
          paramKeys 里的值本身也是 key，要先翻再填 —— 走同一个两段式函数 */}
      <span>{translateNested(t, toast.message, toast.params, toast.paramKeys)}</span>
    </div>
  );
}
