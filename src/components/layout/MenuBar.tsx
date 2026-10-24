/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Download, Redo2, Undo2 } from 'lucide-react';
import styles from './MenuBar.module.css';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import { MENUS, menuItemLabel, type MenuItemDef } from './menuDefs';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

interface MenuBarProps {
  onPickFile: (mode: 'open' | 'place') => void;
  onSave: () => void;
  onSaveAs: () => void;
}

/**
 * 顶部菜单栏。菜单结构在 menuDefs 里，这里只负责交互：
 * 点击展开、悬停切换、点击外部或 Esc 关闭。
 */
export default function MenuBar({ onPickFile, onSave, onSaveAs }: MenuBarProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // 订阅整个 store，菜单项的 disabled/checked 需要最新状态
  const store = useEditorStore();
  const undo = store.undo;
  const redo = store.redo;
  const t = useT();

  useEffect(() => {
    if (!openId) return;
    const onDown = (event: MouseEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenId(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openId]);

  const runItem = (item: MenuItemDef) => {
    if (item.divider || !item.run) return;
    if (item.disabled?.(store)) return;
    item.run({ store, pickFile: onPickFile, save: onSave, saveAs: onSaveAs });
    setOpenId(null);
  };

  return (
    <div className={styles.menuBar} ref={barRef}>
      <div className={styles.logo}>QWORD</div>

      <nav className={styles.menuItems} aria-label={t('common.mainMenu')}>
        {MENUS.map((menu) => (
          <div key={menu.id} className={styles.menuRoot}>
            <button
              type="button"
              className={`${styles.menuItem} ${openId === menu.id ? styles.menuItemOpen : ''}`}
              aria-haspopup="menu"
              aria-expanded={openId === menu.id}
              onClick={() => setOpenId(openId === menu.id ? null : menu.id)}
              onMouseEnter={() => openId && setOpenId(menu.id)}
            >
              {t(menu.label)}
            </button>

            {openId === menu.id && (
              <div className={styles.dropdown} role="menu" aria-label={t(menu.label)}>
                {menu.items.map((item) =>
                  item.divider ? (
                    <div key={item.id} className={styles.menuDivider} role="separator" />
                  ) : (
                    <button
                      type="button"
                      key={item.id}
                      role="menuitem"
                      className={styles.dropdownItem}
                      disabled={item.disabled?.(store) ?? false}
                      onClick={() => runItem(item)}
                    >
                      <span className={styles.checkSlot}>
                        {item.checked?.(store) && <Check size={12} />}
                      </span>
                      <span className={styles.itemLabel}>{t(menuItemLabel(item, store))}</span>
                      {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className={styles.actions}>
        <IconButton label={t('common.undo')} disabled={!store.canUndo()} onClick={undo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label={t('common.redo')} disabled={!store.canRedo()} onClick={redo}>
          <Redo2 size={15} />
        </IconButton>
        <Button
          variant="primary"
          disabled={!store.doc}
          onClick={() => store.openDialog('export')}
        >
          <Download size={14} />
          {t('common.export')}
        </Button>
      </div>
    </div>
  );
}
