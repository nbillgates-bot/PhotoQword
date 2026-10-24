/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Dialogs.module.css';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useEditorStore } from '../../store';
import { useT } from '../../hooks/useT';

/** 关于 */
export default function AboutDialog() {
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const t = useT();

  return (
    <Modal
      title={t('about.title')}
      width={380}
      onClose={closeDialog}
      footer={<Button onClick={closeDialog}>{t('common.close')}</Button>}
    >
      <div className={styles.about}>
        <div className={styles.aboutLogo}>Qword PS Online</div>
        <p className={styles.hint}>
          {t('about.description')}
        </p>
        <p className={styles.hint}>{t('about.version')} 1.0.0</p>
      </div>
    </Modal>
  );
}
