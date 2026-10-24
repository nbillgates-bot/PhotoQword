/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './StatusBar.module.css';
import { useEditorStore } from '../../store';
import { findToolDef } from '../toolbar/toolDefs';
import { useT } from '../../hooks/useT';

/** 底部状态栏：文档信息、光标位置、缩放、当前工具 */
export default function StatusBar() {
  const doc = useEditorStore((state) => state.doc);
  const zoom = useEditorStore((state) => state.zoom);
  const cursorPos = useEditorStore((state) => state.cursorPos);
  const layers = useEditorStore((state) => state.layers);
  const selection = useEditorStore((state) => state.selection);
  const activeTool = useEditorStore((state) => state.activeTool);
  const dirty = useEditorStore((state) => state.dirty);

  const tool = findToolDef(activeTool);
  const t = useT();

  if (!doc) {
    return (
      <div className={styles.statusBar}>
        <span className={styles.item}>{t('status.noDoc')}</span>
        <span className={styles.spacer} />
        <span className={styles.item}>QWORD</span>
      </div>
    );
  }

  return (
    <div className={styles.statusBar}>
      {/* 有未存储的改动时名字后面带星号，与 PS 的标题栏一致 */}
      <span className={styles.item}>
        {doc.name}
        {dirty ? ' *' : ''}
      </span>
      <span className={styles.divider} />
      <span className={styles.item}>
        {doc.width} × {doc.height} px
      </span>
      <span className={styles.divider} />
      <span className={styles.item}>{doc.resolution} DPI</span>
      <span className={styles.divider} />
      <span className={styles.item}>{t('status.layerCount', { count: layers.length })}</span>

      <span className={styles.spacer} />

      {selection && (
        <>
          <span className={styles.item}>
            {t('status.selection', {
              width: Math.round(selection.bounds.width),
              height: Math.round(selection.bounds.height),
            })}
          </span>
          <span className={styles.divider} />
        </>
      )}
      <span className={styles.item}>
        {cursorPos ? `${Math.round(cursorPos.x)}, ${Math.round(cursorPos.y)}` : '—, —'}
      </span>
      <span className={styles.divider} />
      <span className={styles.item}>{tool ? t(tool.label) : activeTool}</span>
      <span className={styles.divider} />
      <span className={styles.item}>{Math.round(zoom * 100)}%</span>
    </div>
  );
}
