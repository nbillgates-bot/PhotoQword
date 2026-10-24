/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import NewDocDialog from './NewDocDialog';
import ExportDialog from './ExportDialog';
import ImageSizeDialog from './ImageSizeDialog';
import CanvasSizeDialog from './CanvasSizeDialog';
import FilterDialog from './FilterDialog';
import ShortcutsDialog from './ShortcutsDialog';
import AboutDialog from './AboutDialog';
import CurvesDialog from './CurvesDialog';
import LevelsDialog from './LevelsDialog';
import LayerStyleDialog from './LayerStyleDialog';
import ConfirmTransformDialog from './ConfirmTransformDialog';
import { ConfirmCropDialog } from './ConfirmCropDialog';
import AdjustmentBrightnessContrastDialog from './AdjustmentBrightnessContrastDialog';
import SaveAsDialog from './SaveAsDialog';
import { useEditorStore } from '../../store';
import type { FormatId } from '../../engine/formats/registry';

interface DialogHostProps {
  onExport: (format: 'png' | 'jpeg' | 'webp', quality: number) => void;
  /** 「存储为」降级对话框确认后的落盘回调 */
  onSaveAs: (formatId: FormatId, fileName: string, quality: number) => void;
}

/** 对话框宿主：同一时刻只渲染一个，避免多层遮罩互相抢焦点 */
export default function DialogHost({ onExport, onSaveAs }: DialogHostProps) {
  const activeDialog = useEditorStore((state) => state.activeDialog);

  switch (activeDialog) {
    case 'new':
      return <NewDocDialog />;
    case 'export':
      return <ExportDialog onExport={onExport} />;
    case 'save-as':
      return <SaveAsDialog onSave={onSaveAs} />;
    case 'image-size':
      return <ImageSizeDialog />;
    case 'canvas-size':
      return <CanvasSizeDialog />;
    case 'filter':
      return <FilterDialog />;
    case 'curves':
      return <CurvesDialog />;
    case 'levels':
      return <LevelsDialog />;
    case 'layer-style':
      return <LayerStyleDialog />;
    case 'confirm-transform':
      return <ConfirmTransformDialog />;
    case 'confirm-crop':
      return <ConfirmCropDialog />;
    case 'adjustment-brightness-contrast':
      return <AdjustmentBrightnessContrastDialog />;
    case 'shortcuts':
      return <ShortcutsDialog />;
    case 'about':
      return <AboutDialog />;
    default:
      return null;
  }
}
