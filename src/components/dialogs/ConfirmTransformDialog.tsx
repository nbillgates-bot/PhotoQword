/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useEditorStore } from '../../store';
import type { ToolId } from '../../types';
import { useT } from '../../hooks/useT';

/**
 * 自由变换进行中时切工具的确认对话框。
 *
 * 与 PS 一致：变换没确认时切工具，弹框问「要应用变换吗？」，
 * 三个按钮——应用、不应用、取消。
 */
export default function ConfirmTransformDialog() {
  const t = useT();
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const commitTransform = useEditorStore((state) => state.commitTransform);
  const cancelTransform = useEditorStore((state) => state.cancelTransform);
  const setTool = useEditorStore((state) => state.setTool);
  const dialogPayload = useEditorStore((state) => state.dialogPayload as ToolId);

  const handleApply = () => {
    commitTransform();
    /*
     * commitTransform 内部已经调了 setTool(previousTool)，但那是切回变换前的工具。
     * 这里用户点的是新工具（比如移动工具），要切到新工具。加个守卫避免递归。
     */
    if (dialogPayload && dialogPayload !== 'transform') {
      setTool(dialogPayload);
    }
    closeDialog();
  };

  const handleDiscard = () => {
    cancelTransform();
    // cancelTransform 同样会切回 previousTool，这里再切到用户点的新工具
    if (dialogPayload && dialogPayload !== 'transform') {
      setTool(dialogPayload);
    }
    closeDialog();
  };

  const handleCancel = () => {
    // 什么也不做，用户还留在变换工具上
    closeDialog();
  };

  return (
    <Modal
      title={t('confirmTransform.title')}
      width={400}
      onClose={handleCancel}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <Button variant="primary" onClick={handleApply}>
            {t('common.apply')}
          </Button>
          <Button onClick={handleDiscard}>{t('confirmTransform.dont')}</Button>
          <Button onClick={handleCancel}>{t('common.cancel')}</Button>
        </div>
      }
    >
      <div style={{ padding: '1rem 0', lineHeight: '1.6' }}>
        <p style={{ margin: 0, color: 'var(--text-primary)' }}>{t('confirmTransform.body')}</p>
      </div>
    </Modal>
  );
}
