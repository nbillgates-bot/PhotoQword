/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEditorStore } from '../../store';
import type { ToolId } from '../../types';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useT } from '../../hooks/useT';

/**
 * 裁剪未确认时切工具的确认对话框。
 * 与 PS 行为一致：用户可选裁剪、不裁剪或取消。
 */
export function ConfirmCropDialog() {
  const activeDialog = useEditorStore((s) => s.activeDialog);
  const dialogPayload = useEditorStore((s) => s.dialogPayload);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const commitCrop = useEditorStore((s) => s.commitCrop);
  const cancelCrop = useEditorStore((s) => s.cancelCrop);
  const setTool = useEditorStore((s) => s.setTool);
  const t = useT();

  if (activeDialog !== 'confirm-crop') return null;

  function handleApply() {
    commitCrop();
    closeDialog();
    if (typeof dialogPayload === 'string') {
      setTool(dialogPayload as ToolId);
    }
  }

  function handleDontApply() {
    cancelCrop();
    closeDialog();
    if (typeof dialogPayload === 'string') {
      setTool(dialogPayload as ToolId);
    }
  }

  function handleCancel() {
    closeDialog();
  }

  return (
    <Modal
      title={t('confirmCrop.title')}
      width={400}
      onClose={handleCancel}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button onClick={handleApply} variant="primary">
            {t('tool.crop')}
          </Button>
          <Button onClick={handleDontApply}>{t('confirmCrop.dont')}</Button>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
        </div>
      }
    >
      <div style={{ padding: '1rem 0', lineHeight: '1.6' }}>
        <p style={{ margin: 0, color: 'var(--text-primary)' }}>{t('confirmCrop.body')}</p>
      </div>
    </Modal>
  );
}
