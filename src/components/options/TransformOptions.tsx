/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState, useEffect } from 'react';
import { FlipHorizontal, FlipVertical, Check, X } from 'lucide-react';
import styles from './Options.module.css';
import { useEditorStore } from '../../store';
import IconButton from '../ui/IconButton';
import { AspectRatioIcon } from '../ui/AspectRatioIcon';
import { useT } from '../../hooks/useT';

/**
 * 自由变换工具的选项栏。
 * 参考 PS：位置、尺寸、角度、翻转、宽高比锁定。
 */
export default function TransformOptions() {
  const t = useT();
  const session = useEditorStore((state) => state.transformSession);
  const aspectLocked = useEditorStore((state) => state.transformAspectLocked);
  const updateTransform = useEditorStore((state) => state.updateTransform);
  const commitTransform = useEditorStore((state) => state.commitTransform);
  const cancelTransform = useEditorStore((state) => state.cancelTransform);
  const setTransformAspectLocked = useEditorStore((state) => state.setTransformAspectLocked);

  // 本地编辑态，失焦时提交
  const [localX, setLocalX] = useState('0');
  const [localY, setLocalY] = useState('0');
  const [localW, setLocalW] = useState('0');
  const [localH, setLocalH] = useState('0');
  const [localAngle, setLocalAngle] = useState('0');

  // session 变化时同步到本地
  useEffect(() => {
    if (session) {
      setLocalX(Math.round(session.state.rect.x).toString());
      setLocalY(Math.round(session.state.rect.y).toString());
      setLocalW(Math.round(session.state.rect.width).toString());
      setLocalH(Math.round(session.state.rect.height).toString());
      setLocalAngle(Math.round((session.state.angle * 180) / Math.PI).toString());
    }
  }, [session]);

  if (!session) return null;

  const handleXChange = (value: string) => {
    const x = parseFloat(value);
    if (!isNaN(x)) {
      updateTransform({
        ...session.state,
        rect: { ...session.state.rect, x },
      });
    }
  };

  const handleYChange = (value: string) => {
    const y = parseFloat(value);
    if (!isNaN(y)) {
      updateTransform({
        ...session.state,
        rect: { ...session.state.rect, y },
      });
    }
  };

  const handleWChange = (value: string) => {
    const w = parseFloat(value);
    if (!isNaN(w) && w > 0) {
      const aspect = session.state.rect.width / session.state.rect.height;
      updateTransform({
        ...session.state,
        rect: {
          ...session.state.rect,
          width: w,
          height: aspectLocked ? w / aspect : session.state.rect.height,
        },
      });
    }
  };

  const handleHChange = (value: string) => {
    const h = parseFloat(value);
    if (!isNaN(h) && h > 0) {
      const aspect = session.state.rect.width / session.state.rect.height;
      updateTransform({
        ...session.state,
        rect: {
          ...session.state.rect,
          width: aspectLocked ? h * aspect : session.state.rect.width,
          height: h,
        },
      });
    }
  };

  const handleAngleChange = (value: string) => {
    const degrees = parseFloat(value);
    if (!isNaN(degrees)) {
      updateTransform({
        ...session.state,
        angle: (degrees * Math.PI) / 180,
      });
    }
  };

  const handleFlipH = () => {
    updateTransform({
      ...session.state,
      rect: {
        ...session.state.rect,
        width: -session.state.rect.width,
      },
    });
  };

  const handleFlipV = () => {
    updateTransform({
      ...session.state,
      rect: {
        ...session.state.rect,
        height: -session.state.rect.height,
      },
    });
  };

  return (
    <>
      <div className={styles.group}>
        <label className={styles.label}>X:</label>
        <input
          type="number"
          className={styles.input}
          value={localX}
          onChange={(e) => setLocalX(e.target.value)}
          onBlur={(e) => handleXChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleXChange(localX)}
          style={{ width: '60px' }}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>Y:</label>
        <input
          type="number"
          className={styles.input}
          value={localY}
          onChange={(e) => setLocalY(e.target.value)}
          onBlur={(e) => handleYChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleYChange(localY)}
          style={{ width: '60px' }}
        />
      </div>

      <div className={styles.group}>
        <label className={styles.label}>W:</label>
        <input
          type="number"
          className={styles.input}
          value={localW}
          onChange={(e) => setLocalW(e.target.value)}
          onBlur={(e) => handleWChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleWChange(localW)}
          style={{ width: '60px' }}
        />
      </div>

      {/* 保持宽高比按钮放在 W 和 H 之间 */}
      <IconButton
        label={t('transform.keepRatio')}
        onClick={() => setTransformAspectLocked(!aspectLocked)}
        active={aspectLocked}
        style={{ margin: '0 2px' }}
      >
        <AspectRatioIcon size={14} />
      </IconButton>

      <div className={styles.group}>
        <label className={styles.label}>H:</label>
        <input
          type="number"
          className={styles.input}
          value={localH}
          onChange={(e) => setLocalH(e.target.value)}
          onBlur={(e) => handleHChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleHChange(localH)}
          style={{ width: '60px' }}
        />
      </div>

      <div className={styles.separator} />

      <div className={styles.group}>
        <label className={styles.label}>{t('common.angle')}:</label>
        <input
          type="number"
          className={styles.input}
          value={localAngle}
          onChange={(e) => setLocalAngle(e.target.value)}
          onBlur={(e) => handleAngleChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAngleChange(localAngle)}
          style={{ width: '60px' }}
        />
        <span className={styles.unit}>°</span>
      </div>

      <div className={styles.separator} />

      <IconButton label={t('transform.flipH')} onClick={handleFlipH}>
        <FlipHorizontal size={16} />
      </IconButton>
      <IconButton label={t('transform.flipV')} onClick={handleFlipV}>
        <FlipVertical size={16} />
      </IconButton>

      {/* spacer 把应用/取消按钮推到最右侧 */}
      <div className={styles.spacer} />

      {/* 取消在左，应用在右，符合 PS 布局 */}
      <IconButton label={t('transform.cancel')} onClick={cancelTransform}>
        <X size={18} strokeWidth={2.5} />
      </IconButton>
      <IconButton label={t('transform.apply')} onClick={commitTransform} active>
        <Check size={18} strokeWidth={2.5} />
      </IconButton>
    </>
  );
}
