/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { Settings2 } from 'lucide-react';
import styles from './Panels.module.css';
import Button from '../ui/Button';
import TextProperties from './TextProperties';
import ShapeProperties from './ShapeProperties';
import { useEditorStore } from '../../store';
import { contentRect } from '../../engine/layerBounds';
import { useT } from '../../hooks/useT';

/**
 * 属性面板：按当前图层类型分派到对应编辑器。
 * 这里只做分派，具体表单在 TextProperties / ShapeProperties 里，避免堆成一个巨型组件。
 */
export default function PropertiesPanel() {
  const t = useT();
  const layers = useEditorStore((state) => state.layers);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const updateTextLayer = useEditorStore((state) => state.updateTextLayer);
  const updateShapeLayer = useEditorStore((state) => state.updateShapeLayer);
  const rasterizeLayer = useEditorStore((state) => state.rasterizeLayer);
  const pushHistory = useEditorStore((state) => state.pushHistory);

  const layer = layers.find((item) => item.id === activeLayerId) ?? null;

  if (!layer) {
    return (
      <div className={styles.empty}>
        <Settings2 size={20} />
        <span>{t('panel.pickLayer')}</span>
      </div>
    );
  }

  if (layer.type === 'text' && layer.textData) {
    return (
      <>
        <TextProperties
          layer={layer}
          data={layer.textData}
          onChange={(patch) => updateTextLayer(layer.id, patch)}
          // 只重渲了这一个图层，点名免得历史去扫全部图层
          onCommit={(label) => pushHistory(label, { layerIds: [layer.id] })}
        />
        <div className={styles.adjustBody}>
          <Button onClick={() => rasterizeLayer(layer.id)}>{t('panel.rasterizeToPixels')}</Button>
        </div>
      </>
    );
  }

  if (layer.type === 'shape' && layer.shapeData) {
    return (
      <>
        <ShapeProperties
          data={layer.shapeData}
          onChange={(patch) => updateShapeLayer(layer.id, patch)}
          onCommit={(label) => pushHistory(label, { layerIds: [layer.id] })}
        />
        <div className={styles.adjustBody}>
          <Button onClick={() => rasterizeLayer(layer.id)}>{t('panel.rasterizeToPixels')}</Button>
        </div>
      </>
    );
  }

  /*
   * 显示的是内容范围，不是画布尺寸。画布会因为绘制而被撑大（四周留空），
   * 拿画布宽高当"图层尺寸"给出的是一个用户看不到对应关系的数字。
   */
  const content = contentRect(layer);

  return (
    <div className={styles.adjustBody}>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('layerTip.nameField')}</span>
        <span>{layer.name}</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('common.mode')}</span>
        <span>{t('layerType.raster')}</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('props.position')}</span>
        <span>{content ? `${content.x}, ${content.y}` : '—'}</span>
      </div>
      <div className={styles.infoRow}>
        <span className={styles.infoLabel}>{t('nav.size')}</span>
        <span>{content ? `${content.width} × ${content.height}` : t('props.emptyLayer')}</span>
      </div>
      <p className={styles.hint}>{t('props.rasterHint')}</p>
    </div>
  );
}
