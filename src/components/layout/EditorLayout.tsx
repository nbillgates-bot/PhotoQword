/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useRef } from 'react';
import styles from './EditorLayout.module.css';
import MenuBar from './MenuBar';
import StatusBar from './StatusBar';
import Toolbar from '../toolbar/Toolbar';
import OptionsBar from '../options/OptionsBar';
import CanvasArea from '../canvas/CanvasArea';
import Panels from '../panels/Panels';
import PanelSplitter from '../panels/PanelSplitter';
import DialogHost from '../dialogs/DialogHost';
import Toast from '../ui/Toast';
import ProgressDialog from '../ui/ProgressDialog';
import { useFileIO } from '../../hooks/useFileIO';
import { useShortcuts } from '../../hooks/useShortcuts';
import { useModifierKeys } from '../../hooks/useModifierKeys';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useEditorStore } from '../../store';
import { clampPanelWidth, RAIL_WIDTH } from '../../engine/panelWidth';
import { WIDE_LAYOUT_QUERY } from '../../engine/inputCapability';

/**
 * 编辑器外壳。负责把文件 IO 与快捷键接到各区域，本身不含业务逻辑。
 *
 * **三栏结构对所有设备都一样**：工具栏在左、画布居中、面板在右，与桌面 PS
 * 同构。手机、平板、桌面走的是同一套 DOM 与同一套 grid，区别只有尺寸 ——
 * 命中区、字号、面板宽度由 CSS 按 `pointer: coarse` 与视口宽度调，
 * 结构一个字都不换。
 *
 * 之前这里按视口宽度分支到一套"窄屏专用"布局（底部工具条 + 上拉抽屉），
 * 已经撤掉了：那套东西把工具栏挪到底部，破坏了 PS 的肌肉记忆，实测很难用。
 * Photopea 在手机上也是把三栏压窄，而不是重排 —— 有可对齐的参照物时就该对齐它，
 * 不该自创（规约第零节）。
 */
export default function EditorLayout() {
  const { pickFile, openDroppedFiles, exportImage, save, saveAs, saveWithFormat } = useFileIO();
  const canvasHostRef = useRef<HTMLDivElement>(null);

  // 快捷键里的「适合屏幕」需要画布可视区尺寸，从 DOM 实时读取
  const getViewport = useCallback(() => {
    const box = canvasHostRef.current?.getBoundingClientRect();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
  }, []);

  useShortcuts({ onPickFile: pickFile, onSave: save, onSaveAs: saveAs, getViewport });
  useModifierKeys();

  const panelWidth = useEditorStore((state) => state.panelWidth);
  const viewportWidth = useWindowWidth();
  const isWide = useMediaQuery(WIDE_LAYOUT_QUERY);

  /*
   * 窄屏的面板列**恒为轨宽**，收起与展开都一样。
   *
   * 展开时面板体是浮在画布上的（position: fixed，见 MobilePanels 与
   * narrowBodyWidth），不占栅格宽度。所以窄屏画布始终是 视口-52-44，
   * 开合面板不会让画布改尺寸 —— 也就不会连锁触发 CanvasArea 的
   * ResizeObserver 重新合成（底部抽屉当初浮起来也是这个理由）。
   *
   * 之前是「收起给轨宽，展开走 clamp」：390px 手机上 clamp 给 234，画布被压到
   * 122px，而面板体只拿到 165px —— 两头都不够用，面板里每排按钮都折三四行。
   */
  const railOnly = !isWide;

  /*
   * 夹取要用当前窗口宽度：窗口缩小之后存着的宽度可能已经超过上限，
   * 不重新夹会把画布挤没。
   */
  const columnWidth = railOnly ? RAIL_WIDTH : clampPanelWidth(panelWidth, viewportWidth);

  /*
   * 窄屏没有可拖的宽度（面板体宽度由视口算出来），分隔条连位置都不占。
   * 留着它的话：拖它只会把图标轨旁边的空背景拖宽，那条能拖但拖了没用的缝
   * 比没有更糟。想要更多画布就点收起回图标轨。
   */
  const splitterWidth = railOnly ? 0 : 4;

  return (
    <div
      className={styles.editorLayout}
      style={
        {
          '--panel-width': `${columnWidth}px`,
          '--splitter-width': `${splitterWidth}px`,
        } as React.CSSProperties
      }
    >
      <div className={styles.menuBar}>
        <MenuBar onPickFile={pickFile} onSave={save} onSaveAs={saveAs} />
      </div>
      <div className={styles.optionsBar}>
        <OptionsBar />
      </div>
      <div className={styles.toolbar}>
        <Toolbar />
      </div>
      <div className={styles.canvasArea} ref={canvasHostRef}>
        <CanvasArea onOpenFile={() => pickFile('open')} onDropFiles={openDroppedFiles} />
      </div>
      {/* 收起态没有可调宽度，分隔条不渲染（列宽也已收到 0，见上面 splitterWidth） */}
      {!railOnly && <PanelSplitter />}
      <div className={styles.panels}>
        <Panels />
      </div>
      <div className={styles.statusBar}>
        <StatusBar />
      </div>

      <DialogHost onExport={exportImage} onSaveAs={saveWithFormat} />
      {/* 进度窗放在 Toast 之后：它要盖在所有对话框上面 */}
      <ProgressDialog />
      <Toast />
    </div>
  );
}
