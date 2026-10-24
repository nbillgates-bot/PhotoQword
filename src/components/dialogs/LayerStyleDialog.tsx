/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useRef, useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Checkbox from '../ui/Checkbox';
import EffectFields from './EffectFields';
import styles from './Dialogs.module.css';
import { useEditorStore } from '../../store';
import type { LayerEffects } from '../../types';
import { DEFAULT_EFFECTS } from '../../types';
import { EFFECT_DEFS, effectDefOf, type EffectKind } from './effectDefs';
import { useT } from '../../hooks/useT';

/** 打开时该定位到哪一项：第一个已启用的效果，没有就列表第一项 */
function firstEnabled(effects: LayerEffects | undefined): EffectKind {
  const hit = EFFECT_DEFS.find((entry) => effects?.[entry.kind]?.enabled);
  return (hit ?? EFFECT_DEFS[0]).kind;
}

/**
 * 图层样式对话框，对齐 PS 的「图层样式」。
 *
 * 左侧效果列表带勾选框，右侧是选中效果的参数。
 * 效果状态的唯一来源是 store（改动直接写进去，画布实时预览），
 * 这里只存「打开时的快照」用于取消还原，以及当前选中哪一项。
 */
export default function LayerStyleDialog() {
  const closeDialog = useEditorStore((state) => state.closeDialog);
  const activeLayer = useEditorStore((state) => state.activeLayer());
  const setLayerEffects = useEditorStore((state) => state.setLayerEffects);
  const toggleEffect = useEditorStore((state) => state.toggleEffect);
  const updateEffect = useEditorStore((state) => state.updateEffect);
  const pushHistory = useEditorStore((state) => state.pushHistory);
  const t = useT();

  // 打开时的快照。用 ref 是因为它必须在整个对话框生命周期里保持不变
  const originalRef = useRef<LayerEffects | undefined>(activeLayer?.effects);
  // 打开时定位到第一个已启用的效果；都没启用就落在列表第一项
  const [selected, setSelected] = useState<EffectKind>(() => firstEnabled(activeLayer?.effects));

  if (!activeLayer) {
    return (
      <Modal title={t('menu.layer.style')} width={360} onClose={closeDialog}>
        <p className={styles.hint}>{t('panel.pickLayer')}</p>
      </Modal>
    );
  }

  const layerId = activeLayer.id;
  const effects = activeLayer.effects ?? {};
  const def = effectDefOf(selected);
  // 没配置过的效果显示默认值：PS 的参数面板对未勾选的效果也是可编辑的
  const current = effects[selected] ?? DEFAULT_EFFECTS[selected];

  /**
   * 点效果名：选中它并启用。
   * PS 就是这个行为——点着名字翻参数会顺带把效果打开，
   * 想只看不启用得点完再取消勾选。已启用的不要因为再点一下被关掉。
   */
  const pick = (kind: EffectKind) => {
    setSelected(kind);
    if (!effects[kind]?.enabled) toggleEffect(layerId, kind, true);
  };

  const confirm = () => {
    // 效果只改非像素属性，历史里的 meta 会自动带上，一层都不用扫
    pushHistory('action.layerStyle', { layerIds: [] });
    closeDialog();
  };

  const cancel = () => {
    setLayerEffects(layerId, originalRef.current);
    closeDialog();
  };

  return (
    <Modal
      title={t('menu.layer.style')}
      width={620}
      onClose={cancel}
      footer={
        <>
          <Button variant="primary" onClick={confirm}>
            {t('common.ok')}
          </Button>
          <Button onClick={cancel}>{t('common.cancel')}</Button>
        </>
      }
    >
      <div className={styles.layerStyleBody}>
        <div className={styles.effectList} role="radiogroup" aria-label={t('effect.groupLabel')}>
          {EFFECT_DEFS.map((entry) => (
            <div
              key={entry.kind}
              className={`${styles.effectRow} ${
                selected === entry.kind ? styles.effectRowActive : ''
              }`}
            >
              {/*
                * 勾选框只管启用，效果名负责切换参数页——与 PS 的左侧列表一致。
                * 勾选框不带可见文字（名字由旁边的按钮显示），所以要给 ariaLabel。
                */}
              <Checkbox
                label=""
                ariaLabel={t('effect.enable', { name: t(entry.labelKey) })}
                checked={Boolean(effects[entry.kind]?.enabled)}
                onChange={(checked) => {
                  toggleEffect(layerId, entry.kind, checked);
                  // 勾上时顺手切到它的参数页，省一次点击
                  if (checked) setSelected(entry.kind);
                }}
              />
              {/* flex:1 撑满整行，所以点勾选框以外的任何位置都命中这里 */}
              <button
                type="button"
                className={styles.effectName}
                role="radio"
                aria-checked={selected === entry.kind}
                onClick={() => pick(entry.kind)}
              >
                {t(entry.labelKey)}
              </button>
            </div>
          ))}
        </div>

        <div className={styles.effectParams}>
          <h3 className={styles.effectTitle}>{t(def.labelKey)}</h3>
          {/*
            * 参数区始终可编辑，与 PS 一致：未勾选的效果也能先把参数调好再勾上。
            * 改参数不会顺带启用（由 updateEffect 保证），所以这里不用管 enabled。
            */}
          <EffectFields
            fields={def.fields}
            values={current as unknown as Record<string, unknown>}
            onChange={(key, value) => updateEffect(layerId, selected, { [key]: value })}
          />
          {effects[selected]?.enabled ? null : (
            <p className={styles.effectHint}>{t('effect.notEnabledHint')}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
