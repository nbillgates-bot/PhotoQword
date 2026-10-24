/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import styles from './Panels.module.css';
import type { Layer } from '../../types';
import { THUMB_BOX } from '../../engine/thumbSize';
import { useEditorStore } from '../../store';
import { useInView } from '../../hooks/useInView';
import { useT } from '../../hooks/useT';
import { useThumbnail } from '../../hooks/useThumbnail';

interface LayerThumbsProps {
  layer: Layer;
  /** store 的 pixelRevision。故意不用 revision：点眼睛不该重画所有缩略图 */
  pixelRevision: number;
  onSelectPixels: () => void;
  onSelectMask: () => void;
  onToggleMask: () => void;
}

/**
 * 图层缩略图 + 蒙版缩略图。
 * 点击各自的缩略图切换绘制目标，Shift+点击蒙版停用/启用，与 PS 一致。
 * 当前编辑目标带高亮描边，这是 PS 里判断"我在画哪张"的唯一视觉线索。
 */
export default function LayerThumbs({
  layer,
  pixelRevision,
  onSelectPixels,
  onSelectMask,
  onToggleMask,
}: LayerThumbsProps) {
  const t = useT();
  const size = useEditorStore((state) => state.layerThumbSize);
  const clip = useEditorStore((state) => state.layerThumbClip);
  const doc = useEditorStore((state) => state.doc);
  const box = THUMB_BOX[size];
  // 滚出面板可视区的行不出图，几百个图层时首屏只需算十几张（见 useInView）
  const { ref, inView } = useInView<HTMLDivElement>();

  const pixels = useThumbnail({
    id: layer.id,
    source: layer.canvas,
    revision: pixelRevision,
    box,
    clip,
    placement: {
      x: layer.bounds.x,
      y: layer.bounds.y,
      docWidth: doc?.width ?? 0,
      docHeight: doc?.height ?? 0,
    },
    inView,
  });
  // 蒙版缩略图恒按整幅出图：它就是一张覆盖全文档的灰度图，裁了看不出对应关系
  const mask = useThumbnail({
    id: `${layer.id}-mask`,
    source: layer.mask,
    revision: pixelRevision,
    box,
    clip: 'full',
    inView,
  });
  const onMask = Boolean(layer.maskSelected && layer.mask);
  const maskOff = layer.mask && layer.maskEnabled === false;

  // 「无」这一档 PS 直接不画缩略图，行只剩名字
  if (box === 0) return null;

  const thumbStyle = { width: `${box}px`, height: `${box}px` };

  return (
    <div className={styles.thumbGroup} ref={ref}>
      <button
        type="button"
        className={`${styles.thumbButton} ${layer.mask && !onMask ? styles.thumbTarget : ''}`}
        aria-label={t('thumb.editPixels')}
        aria-pressed={Boolean(layer.mask) && !onMask}
        title={t('thumb.editPixels')}
        onClick={(event) => {
          event.stopPropagation();
          onSelectPixels();
        }}
      >
        {pixels ? (
          <img src={pixels} alt="" className={styles.thumb} style={thumbStyle} />
        ) : (
          <span className={styles.thumb} style={thumbStyle} />
        )}
      </button>

      {layer.mask && (
        <button
          type="button"
          className={`${styles.thumbButton} ${onMask ? styles.thumbTarget : ''} ${
            maskOff ? styles.thumbDisabled : ''
          }`}
          aria-label={t(maskOff ? 'thumb.enableMask' : 'thumb.editMask')}
          aria-pressed={onMask}
          title={t('thumb.maskHint')}
          /*
           * PS 双击蒙版缩略图开的是「属性」面板，不是图层样式。
           * 属性面板还没做，所以这里先拦住冒泡，宁可什么都不发生，
           * 也不能双击蒙版弹出图层样式——那是错的目标。
           */
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            if (event.shiftKey) onToggleMask();
            else onSelectMask();
          }}
        >
          {mask ? (
            <img
              src={mask}
              alt=""
              className={`${styles.thumb} ${styles.maskThumb}`}
              style={thumbStyle}
            />
          ) : (
            <span className={styles.thumb} style={thumbStyle} />
          )}
        </button>
      )}
    </div>
  );
}
