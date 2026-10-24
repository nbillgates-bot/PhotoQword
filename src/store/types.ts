/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import type {
  BlendMode,
  Doc,
  Guide,
  HistoryEntry,
  Layer,
  LayerType,
  Point,
  Rect,
  Selection,
  ShapeData,
  TextData,
  ToolId,
} from '../types';
import type { ToolOptions } from '../types/tools';
import type { TransformState } from '../engine/transformBox';
import type { SelectMode } from '../engine/layerSelection';
import type { LayerFilter } from '../engine/layerFilter';
import type { ThumbSize } from '../engine/thumbSize';
import type { LockKind } from '../engine/layerLock';
import type { TouchModifierKey, TouchModifierState } from '../engine/touchModifiers';
import type { TouchDockSide } from '../engine/touchPrefs';
import type { EffectsSlice } from './effectsSlice';
import type { SaveFileHandle } from '../engine/fileSystemAccess';
import type { Locale } from '../i18n/types';
import type { FormatId } from '../engine/formats/registry';

/**
 * 当前文档存到哪。null 表示还没存过（此时「存储」要退化成「存储为」，与 PS 一致）。
 *
 * handle 是 File System Access API 的文件句柄，有它才能像 PS 那样不弹窗写回原文件。
 * Firefox / Safari 拿不到句柄，此时 handle 为 null 但 fileName 仍然记着，
 * 「存储」退化成按这个名字重新下载一次（见 hooks/useSaveFile.ts 的注释）。
 *
 * formatId 决定编码器：psd/png/jpeg/...。按 PS 的逻辑，存储为时选的格式
 * 会成为文档的新关联格式，之后 Ctrl+S 就按那个格式写回（除非格式不保留图层，
 * 此时 PS 会存一份副本但文档本身仍然关联 PSD）。
 */
export interface SaveTarget {
  handle: SaveFileHandle | null;
  fileName: string;
  formatId: FormatId;
  /** JPEG / WebP / PDF 的质量。PS 也是每个文档记住上次选的值 */
  quality: number;
}

export interface SaveSlice {
  saveTarget: SaveTarget | null;
  setSaveTarget: (target: SaveTarget | null) => void;
  clearSaveTarget: () => void;
  /** 存盘成功后调：记住目标、清脏标记、把文档名同步成文件名 */
  markSaved: (target: SaveTarget) => void;
}

/** 界面语言。不进历史，切换即写 localStorage */
export interface LocaleSlice {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

/**
 * 参考线（Guides）。从标尺拖出的辅助线，用于对齐。
 *
 * 不进历史：现有 HistoryEntry 只记录图层顺序、图层属性与像素增量，
 * 参考线要可撤销得改动历史结构与每一处 pushHistory。
 * PS 的参考线是可以撤销的，这里是已知偏离，待历史结构支持后补上。
 */
export interface GuideSlice {
  guides: Guide[];
  showGuides: boolean;
  /** 返回新参考线的 id，便于新建后立刻拖动它 */
  addGuide: (orientation: 'h' | 'v', position: number) => string;
  moveGuide: (id: string, position: number) => void;
  deleteGuide: (id: string) => void;
  clearGuides: () => void;
  toggleGuides: () => void;
}

/** 一键式颜色调整（无参数、按一下就定案的那些） */
export interface AdjustSlice {
  /** 反相当前编辑目标；选了蒙版就反相蒙版，有选区时只反相选区内 */
  invertActiveLayer: () => void;
}

/** 文档相关状态与操作 */
export interface DocSlice {
  doc: Doc | null;
  /** 任何影响画面的变化都自增（含可见性、不透明度），驱动画布重绘 */
  revision: number;
  /**
   * 只在图层像素或蒙版真的换了以后自增，驱动缩略图重绘。
   *
   * 缩略图是 draw + toDataURL，几十个图层一起重画就是明显的卡顿。
   * 点眼睛、拖不透明度这类不动像素的操作不该触发它。
   */
  pixelRevision: number;
  dirty: boolean;
  bumpRevision: () => void;
  /** 只刷画面不刷缩略图。改可见性/不透明度这类不动像素的操作走这个 */
  bumpVisualRevision: () => void;
  createDoc: (options: {
    name: string;
    width: number;
    height: number;
    background: 'white' | 'transparent' | 'black' | string;
    resolution?: number;
  }) => void;
  openImageFile: (file: File) => Promise<void>;
  placeImageFile: (file: File) => Promise<void>;
  closeDoc: () => void;
  resizeImage: (width: number, height: number, smooth?: boolean) => void;
  resizeCanvasTo: (width: number, height: number, anchor: string) => void;
  /** 把画布扩到装下所有图层内容（PS：图像 > 显示全部） */
  revealAll: () => void;
  cropTo: (rect: Rect) => void;
  rotateDoc: (degrees: 90 | 180 | 270) => void;
  flipDoc: (axis: 'horizontal' | 'vertical') => void;
  renameDoc: (name: string) => void;
}

/** 图层相关状态与操作 */
export interface LayerSlice {
  layers: Layer[];
  activeLayerId: string | null;
  setActiveLayer: (id: string) => void;
  /**
   * 只插入图层，不记历史。
   * 给"新建图层 + 往里画内容"这种复合操作用：形状、文字这类工具需要把两件事
   * 合成一条历史，否则撤销一次只退掉内容、留下一个空图层，与 PS 的行为不符。
   * 调用方自己负责在改完内容后 pushHistory。
   */
  insertLayer: (type?: LayerType, name?: string) => Layer | null;
  /** 新建空图层并记一条历史。菜单、面板按钮走这个 */
  addLayer: (type?: LayerType, name?: string) => Layer | null;
  /** 新建调整图层 */
  addAdjustmentLayer: (
    kind: 'brightness-contrast' | 'levels' | 'curves' | 'hue-saturation',
    params: Record<string, unknown>,
    name?: string,
  ) => Layer | null;
  /** 修改调整图层参数 */
  setAdjustmentParams: (id: string, params: Record<string, unknown>) => void;
  addLayerFromCanvas: (canvas: HTMLCanvasElement, name: string) => Layer | null;
  deleteLayer: (id: string) => void;
  /** 复制图层/组，返回根副本的 id；找不到源图层时返回 null */
  duplicateLayer: (id: string) => string | null;
  reorderLayer: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') => void;
  updateLayer: (id: string, patch: Partial<Omit<Layer, 'id'>>) => void;
  /**
   * 让图层画布长到至少覆盖整个文档，返回长好之后的图层（没变就是原对象）。
   * 任何要在文档坐标系里写像素的操作都必须先调它，否则图层被移出画布后
   * 再编辑会写到错误的位置。不写历史。
   */
  expandLayerForEdit: (id: string) => Layer | null;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlend: (id: string, blendMode: BlendMode) => void;
  mergeDown: (id: string) => void;
  flattenAll: () => void;
  updateTextLayer: (id: string, patch: Partial<TextData>) => void;
  /**
   * 文字编辑中的草稿更新：只改 textData 和图层名，不渲染 canvas、不 bumpRevision。
   *
   * 编辑期间画面上显示的是 textarea，图层本身被 CanvasArea 过滤掉不参与合成，
   * 此时渲染 canvas 纯属浪费，还会在每次按键时触发一轮重合成。
   * 真正落到像素由 exitTextEdit 统一做一次。
   */
  updateTextDraft: (id: string, patch: Partial<TextData>) => void;
  updateShapeLayer: (id: string, patch: Partial<ShapeData>) => void;
  rasterizeLayer: (id: string) => void;
  activeLayer: () => Layer | null;
}

/**
 * 图层组。树结构是「扁平 layers 数组 + parentId」，
 * 这些 action 负责在改动 parentId 的同时把数组顺序也摆对，
 * 保证子图层紧跟在组后面（读取侧不依赖这点，但写入侧维持它，拖拽才不会乱跳）。
 */
export interface GroupSlice {
  /** 新建空组，放在当前图层上方；返回新组 */
  addGroup: (name?: string) => Layer | null;
  /**
   * 把指定图层打成一个新组（PS 的 Ctrl+G）。
   * 组插在这批图层里最上面那个的位置，组的 parentId 跟随它们原来的父级。
   */
  groupLayers: (ids: string[], name?: string) => Layer | null;
  /** 解散组，子图层原地提到组的父级；组自身被删除 */
  ungroup: (id: string) => void;
  /** 折叠/展开组 */
  toggleGroupCollapsed: (id: string) => void;
  /**
   * 把图层移到目标位置。
   * parentId 为 null 表示最外层；index 是在该父级子列表中的插入位置（0 = 最底）。
   * 拒绝把组移进它自己的后代里。
   */
  moveLayerTo: (id: string, parentId: string | null, index: number) => void;
  /**
   * 复制图层/组并把副本落到指定位置，只记一条历史。
   * 对应 PS 里在图层面板按住 Alt 拖动。返回副本的 id。
   */
  copyLayerTo: (id: string, parentId: string | null, index: number) => string | null;
  /** 把组内容合成为一个像素图层，替换掉整个组（PS 的合并组） */
  mergeGroup: (id: string) => void;
}

/**
 * 图层多选与单独显示。
 *
 * activeLayerId 仍然是「当前编辑目标」，绘制工具只认它；
 * selectedLayerIds 是面板上的选中集合，批量操作认它。约定 activeLayerId ∈ 选中集合。
 * 其余 slice 里十几处 set({ activeLayerId }) 不必同步选中集合，
 * 读取一律走 selectedLayers()，由它负责收拢过期数据。
 */
export interface LayerSelectSlice {
  selectedLayerIds: string[];
  /**
   * 单独显示的图层 id。不改图层的 visible，只在合成时过滤
   * （原因见 engine/layerSelection.ts 的 applySolo）。
   */
  soloLayerId: string | null;
  /** 面板点击入口。mode 对应普通点击 / Ctrl+点击 / Shift+点击 */
  selectLayer: (id: string, mode?: SelectMode) => void;
  /** 收拢后的选中图层，保证都还存在且含活动层。批量操作一律用这个 */
  selectedLayers: () => Layer[];
  /** 批量设不透明度，不记历史（连续拖动由调用方在结束时提交） */
  setSelectedOpacity: (opacity: number) => void;
  setSelectedBlend: (blendMode: BlendMode) => void;
  /** 批量设颜色标记，undefined 为清除 */
  setSelectedColor: (color: string | undefined) => void;
  /** 批量删除，一步历史。删完不剩像素图层时整体拒绝 */
  deleteSelectedLayers: () => void;
  /**
   * 正在被拖动的图层 id，没有拖拽时为 null。
   *
   * 放在 store 而不是 LayerList 的局部状态：垃圾桶在 LayerToolbar，
   * 与 LayerList 是兄弟组件，按 §1.3 不能互相 import。
   */
  draggingLayerId: string | null;
  beginLayerDrag: (id: string) => void;
  endLayerDrag: () => void;
  /**
   * 把正在拖的图层交给底部按钮处理。
   * 拖的层在多选集合里就调 batch，否则用它的 id 调 single。
   * 无论哪条路都会先清掉拖拽状态，按钮不会一直亮着。
   */
  dropDraggedLayer: (batch: () => void, single: (id: string) => void) => void;
  /** 拖到垃圾桶上删除（PS 支持） */
  dropLayerToTrash: () => void;
  /** 拖到复制按钮上复制一份（PS 里是拖到「新建图层」按钮上） */
  dropLayerToCopy: () => void;
  duplicateSelectedLayers: () => void;
  /** 把选中的图层打成一组（PS 的 Ctrl+G 在多选下的行为） */
  groupSelectedLayers: () => void;
  /**
   * 创建/释放剪贴蒙版（PS 的 Ctrl+Alt+G）。
   * 按活动层的状态决定整批是创建还是释放，是开关而非逐层取反。
   */
  toggleClipped: () => void;
  /**
   * 只切换指定图层的剪贴状态，不动选中集合。
   * 对应 PS 里 Alt+点击两行之间的分界线——它不改变选中的是哪一层。
   */
  toggleLayerClipped: (id: string) => void;
  /**
   * 切换锁定栏的某个开关，作用于全部选中层。
   * 目标值取活动层的反状态，整批统一，与 PS 一致。
   */
  toggleSelectedLock: (kind: LockKind) => void;
  /** Alt+点眼睛。已经 solo 在这一层就退出，solo 在别层就换过来 */
  toggleSolo: (id: string) => void;
  exitSolo: () => void;
}

/** 图层蒙版 */
export interface MaskSlice {
  /**
   * 给图层加蒙版。
   * reveal 全白（全部显示），hide 全黑（全部隐藏），
   * selection 依当前选区生成（选区内显示），没有选区时退化为 reveal。
   */
  addMask: (id: string, from?: 'reveal' | 'hide' | 'selection') => void;
  deleteMask: (id: string) => void;
  /** 把蒙版效果烙进图层像素后删除蒙版 */
  applyMaskToLayer: (id: string) => void;
  /** 停用/启用蒙版，蒙版本身保留 */
  toggleMaskEnabled: (id: string) => void;
  invertMaskOf: (id: string) => void;
  setMaskSelected: (id: string, selected: boolean) => void;
  /**
   * 当前绘制应该落在哪张画布上：选中蒙版时是蒙版，否则是图层像素。
   * 绘制工具一律通过它取目标，不要直接用 activeLayer().canvas。
   */
  paintTarget: () => HTMLCanvasElement | null;
  /**
   * 绘制目标 + 文档坐标到画布坐标的偏移。
   * 会顺手把图层撑到覆盖整个文档，所以任何真要写像素的工具都走这个，
   * 不要用 paintTarget（它只读取，不保证画布覆盖文档）。
   */
  paintSurface: () => {
    canvas: HTMLCanvasElement;
    offset: Point;
    onMask: boolean;
  } | null;
  isPaintingMask: () => boolean;
}

/** 选区相关 */
export interface SelectionSlice {
  selection: Selection | null;
  setSelection: (selection: Selection | null) => void;
  selectAllPixels: () => void;
  deselect: () => void;
  invertSelectionState: () => void;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  /** 从系统剪贴板粘贴图片 */
  pasteFromSystemClipboard: () => Promise<void>;
  deleteSelectionPixels: () => void;
  /**
   * 通过拷贝的图层（Ctrl+J）：把选区内的像素复制到新图层，源图层不动。
   * 无选区时等价于复制整个图层，与 PS 一致。新层插在源图层正上方。
   */
  layerViaCopy: () => void;
  /** 通过剪切的图层（Ctrl+Shift+J）：把选区内的像素移到新图层，源图层挖空 */
  layerViaCut: () => void;
  clipboard: HTMLCanvasElement | null;
}

/** 历史记录 */
export interface HistorySlice {
  history: HistoryEntry[];
  historyIndex: number;
  /**
   * 在完成一次修改「之后」调用，把新状态压入历史。
   * 文档创建时会自动压入初始快照，因此 history[0] 恒为可回退的起点。
   *
   * hint 是性能提示，不影响正确性以外的语义：只改了某几个图层的像素时
   * 传 `{ layerIds: [...] }`，可以省掉其余图层的整幅 getImageData
   * （4000x3000 一层约 42ms）。不传就全扫，慢但一定对。
   * **传了就必须准**——漏报的图层其像素改动不会进历史，撤销会丢改动。
   */
  pushHistory: (
    label: string,
    hint?: {
      layerIds?: string[];
      labelParams?: Record<string, string | number>;
      labelParamKeys?: Record<string, string>;
    },
  ) => void;
  undo: () => void;
  redo: () => void;
  jumpHistory: (index: number) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

/** 工具与颜色 */
export interface ToolSlice {
  activeTool: ToolId;
  /** 开启自由变换前的工具，变换结束时切回去 */
  previousTool: ToolId;
  toolOptions: ToolOptions;
  foreground: string;
  background: string;
  /** 正在编辑的文字图层 ID，null 表示未在编辑状态 */
  editingTextLayer: string | null;
  /**
   * 文字编辑器里当前的选中范围，坐标同 textarea 的 selectionStart/End。
   * 由 TextEditor 写入，只在编辑期间有值。上色时靠它决定改哪几个字。
   */
  textSelection: { start: number; end: number } | null;
  /**
   * 光标处没选中任何字时点了颜色，记在这里等下次输入用。
   * 对齐 PS：那之后敲进去的字用这个颜色，而不是整层基色。
   */
  pendingTextColor: string | null;
  /**
   * 请求把焦点交还给文字编辑器的计数器。
   *
   * 用计数器而不是布尔量：连续两次点同一个颜色也要各触发一次，
   * 布尔量在第二次时值没变，TextEditor 的 effect 不会重跑。
   */
  textFocusRequest: number;
  /** 记录文字编辑器里的选中范围 */
  setTextSelection: (selection: { start: number; end: number } | null) => void;
  /**
   * 给文字上色的唯一入口，前景色块与文字面板都走它。
   *
   * 三种情形（对齐 PS）：
   * - 编辑中且选了字：只改选中那几个字（写 colorRuns）
   * - 编辑中但只有光标：记成待用色，之后输入的字用它
   * - 没在编辑：改整层基色并清掉所有颜色段
   */
  applyTextColor: (color: string) => void;
  /** 请求文字编辑器重新取回焦点并恢复选区 */
  requestTextFocus: () => void;
  setTool: (tool: ToolId) => void;
  setToolOption: <K extends keyof ToolOptions>(key: K, value: ToolOptions[K]) => void;
  setForeground: (color: string) => void;
  setBackground: (color: string) => void;
  swapColors: () => void;
  resetColors: () => void;
  /** 文字工具拖拽中的矩形框，null 表示未拖拽 */
  textDragRect: Rect | null;
  /** 进入文字编辑模式 */
  enterTextEdit: (layerId: string) => void;
  /** 退出文字编辑模式，提交更改 */
  exitTextEdit: () => void;
  /** 设置文本框拖拽矩形 */
  setTextDragRect: (rect: Rect | null) => void;
}

/** 视图（缩放、平移、辅助显示） */
export interface ViewSlice {
  zoom: number;
  panX: number;
  panY: number;
  showRulers: boolean;
  showGrid: boolean;
  showTransparencyGrid: boolean;
  /** 是否画当前图层的内容边框（PS：视图 > 显示 > 图层边缘） */
  showLayerEdges: boolean;
  cursorPos: { x: number; y: number } | null;
  /**
   * Alt 是否按着。放进 store 是因为光标在渲染期计算，
   * 只有 store 变化才会触发重算——只靠指针事件里的 altKey，
   * 用户按下 Alt 但不动鼠标时光标不会更新。
   */
  altPressed: boolean;
  /**
   * 视口的像素尺寸，由 CanvasArea 的 ResizeObserver 写入。
   *
   * 放进 store 是因为 pan 的合法范围要靠它算，而改 pan 的入口有三处
   * （滚轮、抓手、导航器）。不放这儿的话每处都得自己拿一遍视口尺寸，
   * 边界规则就会各写一份，迟早对不上。首帧是 0×0，此时不夹 pan。
   */
  viewportSize: { width: number; height: number };
  setViewportSize: (size: { width: number; height: number }) => void;
  /** focus 是视口内坐标；给了就以该点为基点缩放（PS 的滚轮缩放行为） */
  setZoom: (zoom: number, focus?: { x: number; y: number }) => void;
  zoomIn: (focus?: { x: number; y: number }) => void;
  zoomOut: (focus?: { x: number; y: number }) => void;
  fitToScreen: (viewport: { width: number; height: number }) => void;
  actualPixels: () => void;
  setPan: (x: number, y: number) => void;
  panBy: (dx: number, dy: number) => void;
  /**
   * 一帧攒下来的视图变化，一次写完。
   *
   * 存在的理由是「一帧一次 set」：滚轮一帧能来十几个事件，逐个调 setZoom /
   * panBy 会触发同样多轮重渲染与合成，而只有最后一轮会上屏。累积由
   * engine/pendingView 负责，这里只管把结果落进 state。
   *
   * zoomFactor 是**相对倍率**（1 = 不变），不是绝对 zoom；平移是视口像素增量。
   */
  nudgeView: (delta: {
    zoomFactor: number;
    panX: number;
    panY: number;
    focus: { x: number; y: number } | null;
  }) => void;
  /**
   * 视图是否正在被连续操作（滚轮缩放、抓手拖动）。
   *
   * 用来把渲染质量分档：交互期间用低质量重采样换跟手，停下来之后再出一张
   * 高质量的（见 engine/viewportRender 的 applyViewTransform）。
   * 一次手势只写两次（起手、落定），不是每帧都写。
   */
  viewInteracting: boolean;
  setViewInteracting: (interacting: boolean) => void;
  toggleRulers: () => void;
  toggleGrid: () => void;
  toggleTransparencyGrid: () => void;
  toggleLayerEdges: () => void;
  setCursorPos: (pos: { x: number; y: number } | null) => void;
  setAltPressed: (pressed: boolean) => void;
}

/** 对话框标识 */
export type DialogId =
  | 'new'
  | 'open'
  | 'export'
  | 'image-size'
  | 'canvas-size'
  | 'adjust'
  | 'filter'
  | 'curves'
  | 'levels'
  | 'about'
  | 'shortcuts'
  | 'color-picker'
  /** 「存储为」的降级对话框，payload 是建议文件名。只在没有系统文件框时用 */
  | 'save-as'
  | 'layer-style'
  | 'adjustment-brightness-contrast'
  /** 变换未确认时切工具的三选一确认框，payload 是要切到的工具 */
  | 'confirm-transform'
  /** 裁剪未确认时切工具的三选一确认框，payload 是要切到的工具 */
  | 'confirm-crop';

/** UI 状态 */
/** 右侧面板标签 */
export type PanelTab = 'layers' | 'properties' | 'adjust' | 'history' | 'navigator';

/**
 * 长任务进度。对应 PS 打开大文件时那个带进度条和「取消」的小窗。
 * cancel 为 undefined 表示这次任务不能取消，此时不显示取消按钮。
 */
export interface ProgressState {
  /**
   * 标题与说明存的都是**词条 key**，不是成品文字（I18N.md §2.2）。
   * 存文字的话切语言时这个窗口不会跟着变 —— 长任务跑着的时候切语言
   * 正是最容易看出来的场合。
   */
  titleKey: string;
  /** 当前在做什么，一句话 */
  labelKey: string;
  /** labelKey 里 {name} 占位符的取值，如解码进度的 {done}/{total} */
  labelParams?: Record<string, string | number>;
  /** 0-1。为 null 表示进度未知，进度条走循环动画 */
  ratio: number | null;
  cancel?: () => void;
}

export interface UiSlice {
  activeDialog: DialogId | null;
  dialogPayload: unknown;
  /**
   * 全局提示。message 存的是词条 key，不是成品文字，
   * 由 Toast 组件按当前语言渲染（与 HistoryEntry.label 同一套做法）。
   */
  toast: {
    id: string;
    message: string;
    params?: Record<string, string | number>;
    /**
     * 值本身还是词条 key 的占位符，渲染时先翻一遍再填进外层模板。
     * 用途是"外层句子 + 内层原因"，例如
     * message='error.doc.cannotCreate' + paramKeys={reason:'error.size.areaTooLarge'}。
     * 与 HistoryEntry.labelParamKeys 同一套做法，理由见 i18n/historyLabel.ts。
     */
    paramKeys?: Record<string, string>;
    kind: 'info' | 'error' | 'success';
  } | null;
  /** 正在进行的长任务，null 表示空闲 */
  progress: ProgressState | null;

  /**
   * 右侧面板布局状态。
   *
   * 桌面端：面板分上下两个区域，历史组在上、图层组在下，中间可拖动分隔条。
   * historyGroupRatio 是历史组占总高度的比例（0.3 = 30%）。
   */
  historyGroupRatio: number;
  /** 历史组当前选中的标签（历史/属性/调整/导航） */
  upperPanelTab: 'history' | 'properties' | 'adjust' | 'navigator';
  /** 图层组当前选中的标签（目前只有图层，为扩展性保留） */
  lowerPanelTab: 'layers';

  /**
   * 窄屏（<820px）面板是不是收起成图标轨。
   *
   * true（默认）: 只显示 44px 宽的图标轨，画布拿到最大宽度
   * false: 图标轨 + 左侧展开的面板体，一次显示一个面板（不是上下分栏）
   *
   * 宽度 ≥820px 时这个字段无效，一律走桌面的上下分栏。
   * 不持久化，每次默认 true —— 手机上画布是稀缺资源，默认让给画布。
   */
  mobileIconMode: boolean;
  /**
   * 窄屏展开态显示哪一个面板。
   *
   * 与桌面的 upperPanelTab / lowerPanelTab 无关：窄屏放不下上下两个组，
   * 五个面板合并成一个区域，靠图标轨切换（规约第零节：窄屏允许重排布局）。
   * 不会是 null —— 收起与展开由 mobileIconMode 表达，这里只管"是哪一个"。
   */
  mobilePanelTab: PanelTab;

  rightPanelTab: PanelTab; // 已废弃，为兼容保留，后续清理
  /**
   * 图层面板的过滤条件。是纯显示状态，不进历史也不进文档，
   * 与 PS 一致：过滤只影响面板显示，不影响图层本身与合成结果。
   */
  layerFilter: LayerFilter;
  /** 图层缩略图尺寸，对应 PS「面板选项」里的无/小/中/大 */
  layerThumbSize: ThumbSize;
  /**
   * 缩略图显示整个文档还是只显示图层内容的外接范围。
   * PS 的「面板选项」里叫「缩览图内容：整个文档 / 图层边界」。
   */
  layerThumbClip: 'document' | 'bounds';
  openDialog: (id: DialogId, payload?: unknown) => void;
  closeDialog: () => void;
  /**
   * message 传词条 key（如 'toast.layerLocked'），占位符取值走 params。
   * paramKeys 里的值本身也是词条 key，用于"外层句子 + 内层原因"（见 toast 字段）。
   */
  showToast: (
    message: string,
    kind?: 'info' | 'error' | 'success',
    params?: Record<string, string | number>,
    paramKeys?: Record<string, string>,
  ) => void;
  /** 开一个长任务进度窗 */
  beginProgress: (state: ProgressState) => void;
  /** 更新进度。只给要改的字段；任务已结束时是空操作，不会把窗口又开回来 */
  updateProgress: (patch: Partial<ProgressState>) => void;
  /** 关掉进度窗。任务结束（成功、失败、取消）都要调 */
  endProgress: () => void;

  /** 设置历史组占面板总高度的比例（0-1）。拖动上下分隔条时调 */
  setHistoryGroupRatio: (ratio: number) => void;
  setUpperPanelTab: (tab: 'history' | 'properties' | 'adjust' | 'navigator') => void;
  setLowerPanelTab: (tab: 'layers') => void;
  /** 窄屏面板收起 ⇄ 展开。收起态只剩图标轨 */
  toggleMobileIconMode: () => void;
  /**
   * 窄屏打开某个面板：选中它并展开。
   *
   * 做成一个 action 而不是「设 tab + 设展开」两次调用：点图标永远是这两件事
   * 一起发生，分成两次会有一帧显示着旧 tab 的展开态。
   */
  openMobilePanel: (tab: PanelTab) => void;

  setRightPanelTab: (tab: PanelTab) => void;
  /** 改过滤条件。只给出要改的字段，其余保持 */
  setLayerFilter: (patch: Partial<LayerFilter>) => void;
  setLayerThumbSize: (size: ThumbSize) => void;
  setLayerThumbClip: (clip: 'document' | 'bounds') => void;

  /**
   * 右侧面板宽度。取值规则与持久化见 engine/panelWidth 与 engine/panelPrefs。
   * 拖过头夹在下限，不折叠 —— 理由见 panelWidth.ts 的头注释。
   */
  panelWidth: number;
  /** 设置宽度。会按当前视口夹取并写入 localStorage */
  setPanelWidth: (width: number, viewportWidth: number) => void;
}

/**
 * 触屏输入（触摸快捷方式控件）。
 *
 * 单独一片而不是塞进 ViewSlice：ViewSlice 管的是「文档怎么显示」，
 * 这里管的是「手指怎么输入」，两回事。状态机在 engine/touchModifiers.ts。
 */
export interface TouchSlice {
  /**
   * Alt / Shift 各自的按下状态（pressed / latched 两位，见 engine/touchModifiers）。
   * 桌面端恒为全空 —— 控件根本不渲染，没人去改它。
   */
  touchModifiers: TouchModifierState;
  /** 手指压上控件：立刻生效 */
  pressTouchModifier: (key: TouchModifierKey) => void;
  /**
   * 松开控件。tapped 表示这次按下够短、算单击（由组件按时间戳判定）：
   * 单击把锁定位取反，按住则松手即失效。
   */
  releaseTouchModifier: (key: TouchModifierKey, tapped: boolean) => void;
  /** 一次操作做完：用掉锁定的键，按住的保留。由 CanvasArea 在抬手后调 */
  consumeTouchModifiers: () => void;
  /** 全部清掉。切工具、窗口失焦时调 */
  clearTouchModifiers: () => void;

  /** 控件停靠在哪一边。持久化见 engine/touchPrefs */
  touchDockSide: TouchDockSide;
  /** 换到另一边（左手用户），并记住 */
  toggleTouchDockSide: () => void;
}


/**
 * 临时绘制缓冲。笔画先以 100% 不透明画在这里，
 * 抬手时再整体按 opacity/合成方式合入图层，
 * 这样同一位置反复涂抹不会越叠越黑。
 */
export interface Overlay {
  canvas: HTMLCanvasElement;
  targetLayerId: string;
  operation: 'source-over' | 'destination-out';
  opacity: number;
  clipToSelection: boolean;
  /** 合入图层像素还是图层蒙版。缺省为像素 */
  target?: 'canvas' | 'mask';
}

export interface OverlaySlice {
  overlay: Overlay | null;
  beginOverlay: (config: Omit<Overlay, 'canvas'>) => HTMLCanvasElement | null;
  commitOverlay: (label: string) => void;
  cancelOverlay: () => void;
}

/**
 * 裁剪会话。与 PS 一致：拖出框后不立即裁，
 * 框留在画布上可反复调整，双击框内或 Enter 才落刀。
 */
export interface CropSlice {
  /** 当前裁剪框，null 表示没有进行中的裁剪 */
  cropRect: Rect | null;
  /** 设置裁剪框，自动归一化并夹在文档范围内 */
  setCropRect: (rect: Rect | null) => void;
  commitCrop: () => void;
  cancelCrop: () => void;
}

/** 自由变换会话（Ctrl+T） */
export interface TransformSession {
  layerId: string;
  /** 开启变换时的图层像素快照，每帧从它重算，避免反复重采样糊掉 */
  origin: HTMLCanvasElement;
  /** 图层蒙版的快照。蒙版与图层一起变换（PS 默认链接），没有蒙版时缺席 */
  originMask?: HTMLCanvasElement;
  /**
   * 取消变换时用来还原蒙版的整张快照。
   *
   * 不能拿 originMask 还原：那一份是按内容裁过的，画回去会把内容外原有的
   * 蒙版像素抹成透明。那些像素虽然盖在透明区上看不出效果，但确实是用户的数据。
   */
  maskBefore?: HTMLCanvasElement;
  /** 变换框的初始矩形（文档坐标），贴着图层内容而不是整张画布 */
  originalRect: Rect;
  /** 当前状态：矩形 + 旋转 + 斜切。矩形是未旋转未斜切的外框 */
  state: TransformState;
  /**
   * 选区变换时：挖空选区后的图层像素（图层局部坐标，与画布同尺寸）。
   *
   * 存在即表示这是「只变换选区内像素」的会话，PS 里有选区时 Ctrl+T 就是这个行为。
   * 每帧先原位画它，再把变换后的 origin 叠上去，所以选区外的背景不会跟着动。
   */
  background?: HTMLCanvasElement;
  /**
   * 选区变换时：开启会话那一刻的整张图层画布快照，取消时用它还原。
   *
   * 不能靠「背景 + 未变换的 origin」重合成来还原：羽化选区提取时按强度拆了 alpha，
   * 合成回去有舍入误差，取消一次羽化边缘就变一点。所以宁可多存一张。
   */
  canvasBefore?: HTMLCanvasElement;
  /** 选区变换时：会话开启时的选区，确认时按同一矩阵变换它，蚂蚁线才跟着结果走 */
  selectionBefore?: Selection;
}

export interface TransformSlice {
  transformSession: TransformSession | null;
  /** 保持宽高比开关，拖拽变换框时是否锁定宽高比 */
  transformAspectLocked: boolean;
  beginTransform: () => void;
  /** 改变换状态并立即重绘预览 */
  updateTransform: (state: TransformState) => void;
  /** 从快照按当前矩形重绘图层。updateTransform 会自动调它 */
  applyTransformPreview: () => void;
  commitTransform: () => void;
  cancelTransform: () => void;
  setTransformAspectLocked: (locked: boolean) => void;
}

export type EditorStore = DocSlice &
  LayerSlice &
  LayerSelectSlice &
  GroupSlice &
  MaskSlice &
  SelectionSlice &
  HistorySlice &
  ToolSlice &
  ViewSlice &
  UiSlice &
  TouchSlice &
  OverlaySlice &
  CropSlice &
  TransformSlice &
  EffectsSlice &
  AdjustSlice &
  LocaleSlice &
  GuideSlice &
  SaveSlice;
