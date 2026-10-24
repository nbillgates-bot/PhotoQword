/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect } from 'react';
import styles from './progress.module.css';
import Button from './Button';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

/**
 * 长任务进度窗。对标 PS 打开大文件时那个小窗：
 * 标题是操作名，中间一行说明加一条进度条，右下角一个「取消」。
 *
 * 与普通对话框的三处不同，都是照 PS 来的：
 * - 没有关闭的叉。任务还在跑，关掉窗口没有意义。
 * - Esc 是取消任务，不是关窗口。
 * - 不能拖动。PS 的进度窗也是钉住的。
 */
export default function ProgressDialog() {
  const progress = useEditorStore((state) => state.progress);
  const cancel = progress?.cancel;
  const t = useT();

  // Esc 取消，与 PS 一致。捕获阶段拦下，避免同时触发别处的 Esc 逻辑
  useEffect(() => {
    if (!cancel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      cancel();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cancel]);

  if (!progress) return null;

  const { titleKey, labelKey, labelParams, ratio } = progress;
  const percent = ratio === null ? null : Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  // 存的是词条 key，在这里按当前语言渲染（与 Toast 同一套做法）
  const title = t(titleKey);
  const label = t(labelKey, labelParams);

  return (
    <div className={styles.backdrop}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>{title}</div>
        <div className={styles.body}>
          <div className={styles.label}>{label}</div>
          {/*
            * 进度未知时用循环动画，此时不给 aria-valuenow——
            * 读屏软件靠它的缺席判断「进度不确定」，给个假数字反而误导。
            */}
          <div
            className={styles.track}
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
          >
            <div
              className={percent === null ? styles.barIndeterminate : styles.bar}
              style={percent === null ? undefined : { width: `${percent}%` }}
            />
          </div>
        </div>
        {cancel ? (
          <div className={styles.footer}>
            <Button onClick={cancel}>{t('common.cancel')}</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
