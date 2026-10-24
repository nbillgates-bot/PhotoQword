/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Fragment } from 'react';
import styles from './Dialogs.module.css';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';
import { SHORTCUT_GROUPS } from './shortcutDefs';

/**
 * 快捷键一览。
 *
 * 数据在 shortcutDefs.ts，这里只负责渲染。
 * 加快捷键时改那份数据与词条表，不要动这个组件（CLAUDE.md §1.3）。
 */
export default function ShortcutsDialog() {
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const t = useT();

  return (
    <Modal
      title={t('shortcuts.title')}
      width={620}
      onClose={closeDialog}
      footer={<Button onClick={closeDialog}>{t('common.close')}</Button>}
    >
      {/* 用 Fragment 让标题和行都成为 grid 的直接子项，标题独占一整行 */}
      <div className={styles.shortcutList}>
        {SHORTCUT_GROUPS.map((group) => (
          <Fragment key={group.titleKey}>
            <div className={styles.groupTitle}>{t(group.titleKey)}</div>
            {group.rows.map((row) => (
              // 同一个 labelKey 可能出现两次（剪贴蒙版有键盘和鼠标两种做法），
              // 所以 key 要把右列也带上，否则 React 会警告重复 key
              <div key={`${row.labelKey}|${row.keys ?? row.keysKey}`} className={styles.shortcutRow}>
                <span>{t(row.labelKey)}</span>
                {/* keys 是语言中立的键位组合，keysKey 是要翻译的操作描述 */}
                <span className={styles.keys}>{row.keys ?? t(row.keysKey!)}</span>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </Modal>
  );
}
