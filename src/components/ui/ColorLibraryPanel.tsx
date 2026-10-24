/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useState } from 'react';
import styles from './colorPicker.module.css';
import Select from './Select';
import SwatchImport from './SwatchImport';
import { COLOR_LIBRARIES, libraryById, type ColorSwatch } from '../../engine/colorLibraries';
import { loadCustomLibraries, type CustomLibrary } from '../../engine/customLibraries';
import { useT } from '../../hooks/useT';

interface ColorLibraryPanelProps {
  /** 当前颜色，用来给对应色块画选中态 */
  value: string;
  onPick: (hex: string) => void;
}

const LIBRARY_IDS = Object.keys(COLOR_LIBRARIES);

/**
 * 颜色库面板：选一本色库，点色块取色。
 *
 * 对齐 PS 的「颜色库」：PS 里点拾色器上的「颜色库」按钮会整个换成色库视图，
 * 顶部一个色库下拉，下面是色块列表，再点「拾色器」按钮换回来。这里照这个做。
 *
 * 内置的都是可自由分发的色库（Web 安全色、CSS 命名色、Material Design）。
 * 潘通等专有色库不能内置，原因见 engine/colorLibraries.ts 的说明。
 */
export default function ColorLibraryPanel({ value, onPick }: ColorLibraryPanelProps) {
  const t = useT();
  const [libraryId, setLibraryId] = useState(LIBRARY_IDS[0]);
  // 只在挂载时读一次 localStorage，之后由导入/删除的回调增量更新
  const [custom, setCustom] = useState<CustomLibrary[]>(loadCustomLibraries);

  const currentCustom = custom.find((item) => item.id === libraryId);
  const library = currentCustom ?? libraryById(libraryId);

  // 色库名可能是词条 key（内置的）也可能是品牌名 / 用户文件名，按前缀区分
  const nameOf = (name: string) => (name.startsWith('colorLib.') ? t(name) : name);

  const options = [
    ...LIBRARY_IDS.map((id) => ({ value: id, label: nameOf(COLOR_LIBRARIES[id].name) })),
    ...custom.map((item) => ({ value: item.id, label: item.name })),
  ];

  // rows 按色相分行，colors 是平铺 —— 统一成二维数组交给同一个渲染器（规约 §1.2）
  const rows: ColorSwatch[][] = library?.rows ?? (library?.colors ? [library.colors] : []);

  const handleImported = (imported: CustomLibrary) => {
    setCustom((previous) => [...previous.filter((item) => item.id !== imported.id), imported]);
    // 导完直接切到这本，省得用户还得自己在下拉里找
    setLibraryId(imported.id);
  };

  const handleRemoved = (id: string) => {
    setCustom((previous) => previous.filter((item) => item.id !== id));
    // 删掉的正是当前选中的，退回第一本内置色库，否则面板会空着
    if (id === libraryId) setLibraryId(LIBRARY_IDS[0]);
  };

  return (
    <div className={styles.library}>
      <Select
        label={t('colorLib.book')}
        value={libraryId}
        options={options}
        onChange={setLibraryId}
      />

      <SwatchImport
        current={currentCustom}
        onImported={handleImported}
        onRemoved={handleRemoved}
      />

      {/*
        没有导入过任何色库时说明一句潘通为什么不在里面。
        不说的话用户只会觉得「功能缺了」——PS 里那一长串专业色库确实是用户的预期。
      */}
      {custom.length === 0 ? <p className={styles.libraryHint}>{t('swatch.hint')}</p> : null}

      <div className={styles.libraryRows}>
        {rows.map((row, index) => (
          <div key={index} className={styles.libraryRow}>
            {row.map((swatch, position) => {
              const selected = swatch.hex.toLowerCase() === value.toLowerCase();
              return (
                <button
                  key={`${swatch.hex}-${position}`}
                  type="button"
                  className={`${styles.libSwatch} ${selected ? styles.libSwatchOn : ''}`}
                  style={{ background: swatch.hex }}
                  // 有名字的报名字，没名字的报色值，读屏才不会念出一片「按钮」
                  title={swatch.name ? `${swatch.name} ${swatch.hex}` : swatch.hex}
                  aria-label={swatch.name ? `${swatch.name} ${swatch.hex}` : swatch.hex}
                  aria-pressed={selected}
                  onClick={() => onPick(swatch.hex)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
