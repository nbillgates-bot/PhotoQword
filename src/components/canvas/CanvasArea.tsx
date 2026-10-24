/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './CanvasArea.module.css';
import { useEditorStore } from '../../store';
import { useCanvasTransform } from './useCanvasTransform';
import { paintOverlay } from './overlayPainter';

import { getTool } from '../../tools/registry';
import { createToolContext } from '../../tools/toolContext';
import { applySolo } from '../../engine/layerSelection';
import { effectiveVisible } from '../../engine/layerTree';
import { wheelDelta } from '../../engine/wheelDelta';
import { viewportContextFor } from '../../engine/viewRenderer';
import { counters, prepareViewportCanvas } from '../../engine/viewportRender';
import { createViewCache, invalidateViewCache, renderCached } from '../../engine/viewCache';
import { overlayPreviewLayers } from '../../engine/overlayPreview';
import { contentRect } from '../../engine/layerBounds';
import type { Point, Rect } from '../../types';
import LayerEdges from './LayerEdges';
import { ringForTool } from '../../tools/brushCursorDefs';
import Rulers from './Rulers';
import ZoomBar from './ZoomBar';
import EmptyState from './EmptyState';
import TextEditor from './TextEditor';
import type { ToolPointer } from '../../tools/types';
import ContextMenu from '../ui/ContextMenu';
import { pickVisibleLayersAt } from '../../engine/layerPick';
import { canvasMenuItems } from './canvasMenuDefs';
import { useGuideDrag } from '../../hooks/useGuideDrag';
import { useViewFrame } from '../../hooks/useViewFrame';
import { useTouchGestures } from '../../hooks/useTouchGestures';
import { guideAtPoint } from '../../engine/guides';
import { mergeModifiers } from '../../engine/touchModifiers';
import { effectivePressure } from '../../engine/pointerPressure';
import { needsLoupe } from '../../tools/loupeDefs';
import TouchShortcut from './TouchShortcut';
import Loupe from './Loupe';
import { useT } from '../../hooks/useT';

interface CanvasAreaProps {
  onOpenFile: () => void;
  /** 拖进来的文件。打开还是置入由 useFileIO 决定 */
  onDropFiles: (files: FileList) => void;
}

/**
 * 一格滚轮的缩放倍率。
 *
 * PS 的滚轮缩放是连续的，不吸附到档位（吸附是 Ctrl +/- 按钮的行为），
 * 所以这里用固定倍率累乘。1.12 是试出来的手感：太小要滚很多下，
 * 太大一格就跳过一个量级。
 */
const ZOOM_FACTOR = 1.12;

export default function CanvasArea({ onOpenFile, onDropFiles }: CanvasAreaProps) {
  const doc = useEditorStore((state) => state.doc);
  const layers = useEditorStore((state) => state.layers);
  const soloLayerId = useEditorStore((state) => state.soloLayerId);
  const revision = useEditorStore((state) => state.revision);
  const overlay = useEditorStore((state) => state.overlay);
  const selection = useEditorStore((state) => state.selection);
  const activeTool = useEditorStore((state) => state.activeTool);
  const toolOptions = useEditorStore((state) => state.toolOptions);
  const foreground = useEditorStore((state) => state.foreground);
  const background = useEditorStore((state) => state.background);
  const zoom = useEditorStore((state) => state.zoom);
  const panX = useEditorStore((state) => state.panX);
  const panY = useEditorStore((state) => state.panY);
  const viewInteracting = useEditorStore((state) => state.viewInteracting);
  const showRulers = useEditorStore((state) => state.showRulers);
  const showGrid = useEditorStore((state) => state.showGrid);
  const showTransparencyGrid = useEditorStore((state) => state.showTransparencyGrid);
  const showLayerEdges = useEditorStore((state) => state.showLayerEdges);
  const activeLayerId = useEditorStore((state) => state.activeLayerId);
  const cursorPos = useEditorStore((state) => state.cursorPos);
  const setCursorPos = useEditorStore((state) => state.setCursorPos);
  const fitToScreen = useEditorStore((state) => state.fitToScreen);
  const cropRect = useEditorStore((state) => state.cropRect);
  const transformSession = useEditorStore((state) => state.transformSession);
  const editingTextLayer = useEditorStore((state) => state.editingTextLayer);
  const textDragRect = useEditorStore((state) => state.textDragRect);
  const guides = useEditorStore((state) => state.guides);
  const showGuides = useEditorStore((state) => state.showGuides);
  const t = useT();


  const viewportRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragOver, setDragOver] = useState(false);
  const [overlayTick, setOverlayTick] = useState(0);
  // 画布右键菜单：hits 是光标下命中的图层，右键那一刻算好并冻住
  const [canvasMenu, setCanvasMenu] = useState<{
    x: number;
    y: number;
    hits: ReturnType<typeof pickVisibleLayersAt>;
  } | null>(null);
  const shiftRef = useRef(false);
  const spaceRef = useRef(false);
  const drawingRef = useRef(false);
  /*
   * 这次拖动要不要放大镜。在 down 时定下来，整个拖动期间不变 ——
   * 与 draggingToolRef 同一个道理：中途换工具会让状态错乱。
   * 用 state 而不是 ref：放大镜的出现与消失要驱动渲染。
   */
  const [loupeOn, setLoupeOn] = useState(false);

  const docWidth = doc?.width ?? 1;
  const docHeight = doc?.height ?? 1;
  const { originOf, toDoc, toViewport } = useCanvasTransform({
    viewport: viewportRef.current,
    docWidth,
    docHeight,
    zoom,
    panX,
    panY,
  });

  const guideDrag = useGuideDrag({ toDoc });

  /*
   * 滚轮/平移不直接写 store，先攒到下一帧。
   *
   * 触控板一次滑动能报上百个 wheel，逐个写 store 就是一帧里合成好几遍、
   * 只有最后一遍上屏。合并之后事件多密都只提交一次。
   */
  const viewFrame = useViewFrame();

  /*
   * 当前图层内容的外接框。contentRect 要全幅扫一遍 alpha，是这个组件里
   * 少有的真·昂贵计算，所以放进 rAF 让出主线程，不占渲染路径；
   * 画布是可变引用，React 看不见它变，靠 revision 触发重算。
   * 组没有自己的像素（画布是 1×1 占位），不画框。
   */
  const [layerEdgeRect, setLayerEdgeRect] = useState<Rect | null>(null);
  const edgeLayer = layers.find((item) => item.id === activeLayerId) ?? null;
  useEffect(() => {
    if (!showLayerEdges || !doc || !edgeLayer || edgeLayer.type === 'group') {
      setLayerEdgeRect(null);
      return;
    }
    // rAF 会把同一帧内被顶替的计算取消掉，所以连续拖动最多一帧扫一次
    const handle = requestAnimationFrame(() => setLayerEdgeRect(contentRect(edgeLayer)));
    return () => cancelAnimationFrame(handle);
  }, [showLayerEdges, doc, edgeLayer, revision]);

  /** 观察视口尺寸，供标尺与"适应窗口"使用 */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0].contentRect;
      const size = { width: box.width, height: box.height };
      setViewportSize(size);
      // store 也要有一份：pan 的合法范围靠它算
      useEditorStore.getState().setViewportSize(size);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * 合成结果缓存。平移只补新露出的边条，缩放先拉伸顶上（见 engine/viewCache）。
   * 放在 ref 里而不是模块级单例：单例会在多文档之间串味。
   */
  const viewCacheRef = useRef(createViewCache());

  /** 文档关掉或换了就把缓存清掉，别让上一个文档的画面留在里面 */
  useEffect(() => {
    invalidateViewCache(viewCacheRef.current);
  }, [doc?.id]);

  /** 合成图层到主画布。overlay 存在时插在活动图层之上参与显示 */
  useEffect(() => {
    const canvas = mainRef.current;
    if (!canvas || !doc || viewportSize.width === 0) return;

    // 单独显示只在渲染前过滤，不动图层状态（原因见 applySolo 的注释）
    let shown = applySolo(layers, soloLayerId);
    // 过滤掉被父组隐藏的图层：组 visible=false 时子树都不显示
    shown = shown.filter((layer) => effectiveVisible(layers, layer.id));
    // 编辑文字时隐藏正在编辑的图层，避免 textarea 和 canvas 重叠显示
    if (editingTextLayer) {
      shown = shown.filter((layer) => layer.id !== editingTextLayer);
    }
    // 描边期间把缓冲合进目标图层，让预览与抬手后的结果一致
    if (overlay) shown = overlayPreviewLayers(shown, overlay, selection);

    /*
     * 直接渲染，不防抖。
     *
     * 之前这里挂了 150ms 防抖，是因为一次合成要 400~1400ms，不推迟就每次
     * 滚轮都卡住。改成视口渲染之后一次合成只有几毫秒，防抖反而成了唯一的
     * 延迟来源——缩放、拖图层都会先僵住 150ms 再动，手感比慢更糟。
     */
    const t0 = performance.now();
    const view = viewportContextFor({
      docWidth: doc.width,
      docHeight: doc.height,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      zoom,
      panX,
      panY,
      // 手势中降一档插值质量；停手后这个值翻回 false，会再渲染一遍收敛到高质量
      interacting: viewInteracting,
    });
    const result = renderCached({
      cache: viewCacheRef.current,
      canvas,
      layers: shown,
      view,
      /*
       * 内容身份 = 这个 effect 的依赖表**减去** zoom/panX/panY/viewportSize。
       *
       * 那张表就是「什么时候必须重合成」的既有契约，减掉的几项正是要让缓存
       * 吸收的（视口尺寸由缓存自己按画布尺寸判失效）。**改依赖表就要改这里**，
       * 少列一项就会拿旧画面顶着真实变化。
       *
       * viewInteracting 在里面：停手那一下身份就变，于是必然走一次全量重合成，
       * 把手势中拉伸出来的降质画面换成精确结果。
       */
      contentKey: [
        doc,
        layers,
        revision,
        overlay,
        overlayTick,
        selection,
        soloLayerId,
        editingTextLayer,
        viewInteracting,
      ],
      interacting: viewInteracting,
    });
    const totalMs = performance.now() - t0;
    if (totalMs > 16) {
      console.log(
        `[render] ${totalMs.toFixed(1)}ms  ${result.plan}  ` +
          `画 ${result.painted} 裁 ${result.culled}  ` +
          `画布 ${view.viewWidth}×${view.viewHeight}  scale=${view.scale.toFixed(3)}  ` +
          `重画 ${(result.repaintedPixels / 1e6).toFixed(2)}M  ` +
          `缓冲 ${counters.buffers}张/${(counters.bufferPixels / 1e6).toFixed(1)}M` +
          `(可读 ${counters.readableBuffers})  ` +
          `读回 ${(counters.readbackPixels / 1e6).toFixed(1)}M`,
      );
    }
  }, [
    doc,
    layers,
    revision,
    overlay,
    overlayTick,
    selection,
    soloLayerId,
    zoom,
    panX,
    panY,
    viewportSize,
    editingTextLayer,
    viewInteracting,
  ]);

  /** 绘制覆盖层（选区蚂蚁线、工具预览） */
  useEffect(() => {
    const canvas = overlayRef.current;
    if (!canvas || !doc || viewportSize.width === 0) return;
    // 与主画布共用同一套变换，两层才对得齐
    const view = viewportContextFor({
      docWidth: doc.width,
      docHeight: doc.height,
      viewportWidth: viewportSize.width,
      viewportHeight: viewportSize.height,
      zoom,
      panX,
      panY,
    });
    const context = prepareViewportCanvas(canvas, view);
    paintOverlay({
      context,
      width: doc.width,
      height: doc.height,
      zoom,
      tool: activeTool,
      selection,
      toolOptions,
      foreground,
      background,
      shiftKey: shiftRef.current,
      docId: doc.id,
      cropRect,
      transformState: transformSession?.state ?? null,
      cursorPos,
      guides,
      showGuides,
    });
    // cursorPos 进依赖：笔刷环要跟手，指针每动一下都得重画覆盖层
  }, [
    doc,
    zoom,
    panX,
    panY,
    viewportSize,
    activeTool,
    selection,
    toolOptions,
    foreground,
    background,
    overlayTick,
    cropRect,
    transformSession,
    cursorPos,
    guides,
    showGuides,
  ]);

  const requestOverlayRepaint = useCallback(() => setOverlayTick((tick) => tick + 1), []);

  /**
   * 组装工具事件参数。
   *
   * 修饰键要把触摸快捷方式控件的状态并进来，工具层因此不需要知道这一位
   * 是键盘按的还是屏幕上按的（见 engine/touchModifiers 的 mergeModifiers）。
   * 用 getState() 现取而不是订阅：这里要的是**事件发生那一刻**的值，
   * 而且订阅会让 makePointer 的引用每次变化，白拖累一串 useCallback。
   */
  const makePointer = useCallback(
    (event: React.PointerEvent): ToolPointer => {
      const keys = mergeModifiers(event, useEditorStore.getState().touchModifiers);
      return {
        point: toDoc(event.clientX, event.clientY),
        screen: toViewport(event.clientX, event.clientY),
        shiftKey: keys.shiftKey,
        altKey: keys.altKey,
        ctrlKey: event.ctrlKey || event.metaKey,
        pressure: effectivePressure(event.pointerType, event.pressure),
        button: event.button,
      };
    },
    [toDoc, toViewport],
  );

  /** 空格键临时切抓手 */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftRef.current = true;
      if (event.code === 'Space' && !spaceRef.current) {
        spaceRef.current = true;
        requestOverlayRepaint();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') shiftRef.current = false;
      if (event.code === 'Space') {
        spaceRef.current = false;
        requestOverlayRepaint();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [requestOverlayRepaint]);

  /**
   * 本次拖拽实际使用的工具。必须在 down 时锁定，
   * 否则拖拽中途按下空格会把事件转给另一个工具，造成状态错乱。
   */
  const draggingToolRef = useRef<ReturnType<typeof getTool> | null>(null);

  const toolCtx = useCallback(
    () => createToolContext(requestOverlayRepaint),
    [requestOverlayRepaint],
  );

  /**
   * 在指定客户端坐标弹出画布上下文菜单。
   *
   * 右键与触屏长按共用它：两者是同一个语义的两种输入（见 docs/TODO_MOBILE.md），
   * 分别实现一遍就会渐渐长歪。
   */
  const openCanvasMenu = useCallback(
    (clientX: number, clientY: number) => {
      if (!doc) return;
      const hits = pickVisibleLayersAt(layers, toDoc(clientX, clientY));
      setCanvasMenu({ x: clientX, y: clientY, hits });
    },
    [doc, layers, toDoc],
  );

  /**
   * 作废进行中的那一笔。第二根手指落下或长按出菜单时调用。
   *
   * 走工具自己的 onDeactivate：草稿状态在各工具的模块级变量里，
   * 只有它知道该丢什么。**只在真的正在拖的时候调**——否则会连带取消
   * 已经确立的裁剪框（cropTool.onDeactivate 里有 cancelCrop）。
   */
  const abortStroke = useCallback(() => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setLoupeOn(false);
    const tool = draggingToolRef.current;
    draggingToolRef.current = null;
    tool?.onDeactivate?.(toolCtx());
  }, [toolCtx]);

  /*
   * 触屏手势层。只吃 pointerType === 'touch'，鼠标与手写笔一律交回原路径，
   * 所以桌面端行为一字未改（规约第零节）。
   */
  const gestures = useTouchGestures({
    toViewport,
    onLongPress: useCallback(
      (point: Point) => {
        // 长按出菜单前先把那一笔作废：桌面上右键也不会留下笔画
        abortStroke();
        const box = viewportRef.current?.getBoundingClientRect();
        if (!box) return;
        openCanvasMenu(box.left + point.x, box.top + point.y);
      },
      [abortStroke, openCanvasMenu],
    ),
    onAbortStroke: abortStroke,
  });

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!doc || event.button === 2) return;
    // 手势层接管（第二根手指落下）时不再交给工具
    if (gestures.onPointerDown(event)) return;
    // 空格或中键拖拽 = 平移视图
    const useHand = spaceRef.current || event.button === 1;
    /*
     * 移动工具下压住参考线就改为拖参考线，与 PS 一致。
     * 只在移动工具下接管：否则拿画笔在参考线附近落笔会被吞掉。
     */
    if (!useHand && activeTool === 'move' && guideDrag.startFromCanvas(event)) return;
    const tool = getTool(useHand ? 'hand' : activeTool);
    event.currentTarget.setPointerCapture(event.pointerId);
    draggingToolRef.current = tool;
    drawingRef.current = true;
    /*
     * 落笔时就要把光标位置记下来。
     *
     * 之前只有 onPointerMove 写它，鼠标上看不出问题（进画布必然先划过一路
     * mousemove），但手指是「凭空出现」的：不写这一下，任何依赖 cursorPos 的
     * 东西（放大镜、笔刷环）都要等用户先拖动一段才出现。
     */
    const point = toDoc(event.clientX, event.clientY);
    setCursorPos({ x: point.x, y: point.y });
    // 抓手不需要放大镜：平移看的是整幅画面，不是某个像素
    if (!useHand && needsLoupe(activeTool, event.pointerType)) setLoupeOn(true);
    tool.onPointerDown?.(makePointer(event), toolCtx());
  };

  /** 双击。裁剪与自由变换靠它确认 */
  const handleDoubleClick = (event: React.MouseEvent) => {
    if (!doc) return;
    const point = toDoc(event.clientX, event.clientY);
    const keys = mergeModifiers(event, useEditorStore.getState().touchModifiers);
    const pointer: ToolPointer = {
      point,
      screen: { x: event.clientX, y: event.clientY },
      shiftKey: keys.shiftKey,
      altKey: keys.altKey,
      ctrlKey: event.ctrlKey || event.metaKey,
      pressure: 1,
      button: event.button,
    };
    getTool(activeTool).onDoubleClick?.(pointer, toolCtx());
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!doc) return;
    // 多指手势期间不更新光标位置：第二根手指会把笔刷环甩到别处
    if (gestures.onPointerMove(event)) return;
    const point = toDoc(event.clientX, event.clientY);
    setCursorPos({ x: point.x, y: point.y });
    if (guideDrag.onPointerMove(event)) return;
    if (!drawingRef.current) return;
    draggingToolRef.current?.onPointerMove?.(makePointer(event), toolCtx());
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (gestures.onPointerUp(event)) return;
    if (guideDrag.onPointerUp(event)) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const tool = draggingToolRef.current;
    draggingToolRef.current = null;
    tool?.onPointerUp?.(makePointer(event), toolCtx());
    setLoupeOn(false);
    /*
     * 一次操作做完，用掉「单击锁定」的修饰键。
     *
     * 必须在工具处理完之后 —— 提前清掉的话这一笔就不带修饰键了。
     * 按住不放的那一档不会被清（见 consumeLatched）。
     */
    useEditorStore.getState().consumeTouchModifiers();
  };

  /**
   * 指针被系统取消（来电、被系统手势接管）。
   *
   * 与抬手分开处理：手势层要区分「正常抬手」和「被打断」——只有前者
   * 才可能是双指单击。其余善后与抬手相同。
   */
  const handlePointerCancel = (event: React.PointerEvent) => {
    if (gestures.onPointerCancel(event)) return;
    if (guideDrag.onPointerUp(event)) return;
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const tool = draggingToolRef.current;
    draggingToolRef.current = null;
    tool?.onPointerUp?.(makePointer(event), toolCtx());
    setLoupeOn(false);
    useEditorStore.getState().consumeTouchModifiers();
  };

  /** 切换工具时让上一个工具清理未提交状态 */
  const prevToolRef = useRef(activeTool);
  useEffect(() => {
    if (prevToolRef.current !== activeTool) {
      getTool(prevToolRef.current).onDeactivate?.(toolCtx());
      prevToolRef.current = activeTool;
      requestOverlayRepaint();
    }
  }, [activeTool, toolCtx, requestOverlayRepaint]);

  /**
   * 滚轮：Alt 或 Ctrl 缩放（以光标为焦点），Shift 横向平移，否则纵向平移。
   *
   * Alt 是为了对齐 PS——PS 里 Alt+滚轮就是缩放。同时保留 Ctrl，
   * 因为浏览器里 Ctrl+滚轮是约定俗成的页面缩放手势，用户会习惯性去按，
   * 而我们已经 preventDefault 掉了浏览器自身的缩放，必须自己接住。
   */
  const handleWheel = (event: React.WheelEvent) => {
    if (!doc) return;
    /*
     * 这里不调 preventDefault：React 的 onWheel 是委托到 root 上的被动监听器，
     * 调了不生效还会刷一屏 "Unable to preventDefault inside passive event
     * listener" 警告。默认行为由下面那个 { passive: false } 的原生监听器挡掉。
     */
    const { x: dx, y: dy } = wheelDelta(event);
    if (event.altKey || event.ctrlKey || event.metaKey) {
      const box = viewportRef.current?.getBoundingClientRect();
      if (!box) return;
      /*
       * 缩放方向取 dy||dx：按住 Alt 时部分浏览器会把纵向滚轮改报成
       * 横向（deltaY 恒为 0），只看 deltaY 会永远算成缩小。
       */
      const scroll = dy || dx;
      if (scroll === 0) return;
      const factor = scroll < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      // 焦点用视口内坐标，nudgeView 内部反算它对应的文档点并锚住
      viewFrame.zoomBy(factor, { x: event.clientX - box.left, y: event.clientY - box.top });
      return;
    }
    // Shift+滚轮横向滚动，与 PS 一致。pan 的边界由 store 统一夹
    if (event.shiftKey) viewFrame.panBy(-(dy || dx), 0);
    else viewFrame.panBy(-dx, -dy);
  };

  /** 原生 wheel 需要非 passive 才能 preventDefault */
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const block = (event: WheelEvent) => event.preventDefault();
    element.addEventListener('wheel', block, { passive: false });
    return () => element.removeEventListener('wheel', block);
  }, []);

  /**
   * 画布右键：识别光标下的图层并弹菜单。
   *
   * 排序和可见性判断都在 pickVisibleLayersAt 里，与 PS 一致：
   * 菜单第一项就是视觉上盖在最上面、用户实际点到的那一层。
   */
  const handleContextMenu = (event: React.MouseEvent) => {
    /*
     * preventDefault 对触屏同样要紧：长按时部分浏览器（Android Chrome）
     * 会自己派发 contextmenu 并弹出系统的文本选择菜单，把我们的菜单盖住。
     * 配合 CSS 的 -webkit-touch-callout: none 才能在 iOS 上一并挡住。
     */
    event.preventDefault();
    openCanvasMenu(event.clientX, event.clientY);
  };

  const handleFit = useCallback(() => {
    fitToScreen(viewportSize);
  }, [fitToScreen, viewportSize]);

  /** 首次打开文档时自动适应窗口 */
  const fittedDocRef = useRef<string | null>(null);
  useEffect(() => {
    if (!doc || viewportSize.width === 0) return;
    if (fittedDocRef.current === doc.id) return;
    fittedDocRef.current = doc.id;
    // 图片比视口大时才缩放，小图保持 100%
    if (doc.width > viewportSize.width - 48 || doc.height > viewportSize.height - 48) {
      fitToScreen(viewportSize);
    }
  }, [doc, viewportSize, fitToScreen]);

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    // 打开/置入的分派与错误提示都在 useFileIO 里，组件只把文件递过去
    onDropFiles(event.dataTransfer.files);
  };

  const origin = originOf();
  const cursorStyle = (() => {
    // 空格临时切抓手：走抓手自己的光标函数，这样拖拽中也能显示握紧的手。
    // 之前写死 'grab'，按住空格拖动时手一直是张开的
    if (spaceRef.current) {
      const handCursor = getTool('hand').cursor;
      return typeof handCursor === 'function' ? handCursor(toolCtx()) : 'grab';
    }
    /*
     * 笔刷环由覆盖层画，这时把系统光标藏掉，否则十字叠在环中心显得脏。
     * 只在环真的画出来时才藏——笔刷缩得太小时 brushRingFor 返回 null，
     * 那时候必须留住十字，不然指针就凭空消失了。
     */
    if (cursorPos && ringForTool(activeTool, toolOptions, zoom)) return 'none';

    /*
     * 移动工具悬在参考线上时给出可拖光标，提示这条线能拖动。
     * 方向与标尺一致：水平线上下拖（row-resize），垂直线左右拖（col-resize）。
     */
    if (activeTool === 'move' && showGuides && cursorPos) {
      const hovered = guideAtPoint(guides, cursorPos, zoom);
      if (hovered) return hovered.orientation === 'h' ? 'row-resize' : 'col-resize';
    }

    const cursor = getTool(activeTool).cursor;
    // 函数形式的光标依赖 store（如变换框的悬停位置），每次渲染重算。
    // cursorPos 是 store 字段，移动指针本身就会触发渲染，所以能跟手。
    if (typeof cursor === 'function') return cursor(toolCtx());
    return typeof cursor === 'string' ? cursor : 'default';
  })();

  /*
   * 标尺铺在整个画布区上，而视口被标尺挤掉了 20px。
   * Rulers 内部会再减 20，所以这里补回来，二者原点才对得上。
   */
  const rulerSize = { width: viewportSize.width + 20, height: viewportSize.height + 20 };

  /** 文档在视口里占的那块矩形。棋盘、网格、图层边缘框都按它定位 */
  const stageBox = {
    width: docWidth * zoom,
    height: docHeight * zoom,
    left: origin.x,
    top: origin.y,
  };

  return (
    <div
      className={`${styles.canvasArea} ${dragOver ? styles.dropActive : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {doc && showRulers ? (
        <Rulers
          origin={origin}
          zoom={zoom}
          size={rulerSize}
          cursor={cursorPos}
          onGuideDragStart={guideDrag.startFromRuler}
          onGuideDragMove={guideDrag.onPointerMove}
          onGuideDragEnd={guideDrag.onPointerUp}
          guides={guides}
          showGuides={showGuides}
        />
      ) : null}

      <div
        ref={viewportRef}
        className={`${styles.viewport} ${doc && showRulers ? styles.viewportWithRulers : ''}`}
        style={{ cursor: cursorStyle }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={() => setCursorPos(null)}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      >
        {doc ? (
          <>
            {/*
              * 文档底衬：只放垫底的棋盘和那圈投影。
              * 像素内容不在这里——主画布是视口尺寸的，独立铺在视口上，
              * 靠 canvas 内部的变换矩阵定位（见 engine/viewportRender.ts）。
              */}
            <div className={styles.stage} style={stageBox}>
              {showTransparencyGrid ? <div className={styles.checker} /> : null}
            </div>

            <canvas ref={mainRef} className={styles.mainCanvas} />
            <canvas ref={overlayRef} className={styles.overlayCanvas} />

            {/* 文档前衬：要盖在像素之上的 CSS 装饰 */}
            <div className={styles.stageFront} style={stageBox}>
              <LayerEdges rect={layerEdgeRect} zoom={zoom} />
              {showGrid ? (
                <div
                  key={`grid-${doc.width}-${doc.height}`}
                  className={styles.grid}
                  style={{
                    backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
                    backgroundPosition: '0 0',
                  }}
                />
              ) : null}
              {/* 文字工具拖拽矩形框预览 */}
              {textDragRect ? (
                <div
                  style={{
                    position: 'absolute',
                    left: textDragRect.x * zoom,
                    top: textDragRect.y * zoom,
                    width: textDragRect.width * zoom,
                    height: textDragRect.height * zoom,
                    border: '2px dashed #4a9eff',
                    background: 'rgba(74, 158, 255, 0.05)',
                    pointerEvents: 'none',
                  }}
                />
              ) : null}
            </div>
          </>
        ) : null}

        {/*
          * 放大镜。只在触屏拖动精度敏感的工具时出现（见 tools/loupeDefs.ts），
          * 位置用视口坐标，所以必须放在 viewport 这个定位父级里面。
          */}
        {doc && loupeOn && cursorPos ? (
          <Loupe
            center={{ x: cursorPos.x * zoom + origin.x, y: cursorPos.y * zoom + origin.y }}
            mainCanvas={mainRef.current}
            overlayCanvas={overlayRef.current}
            viewport={viewportSize}
          />
        ) : null}

        {/* 文字编辑器：叠加在 stage 之上，absolute 定位相对于 viewport */}
        {doc && editingTextLayer ? (() => {
          const layer = layers.find((l) => l.id === editingTextLayer);
          if (layer?.type === 'text' && layer.textData) {
            const origin = originOf();
            return (
              <TextEditor
                layerId={layer.id}
                data={layer.textData}
                zoom={zoom}
                panX={origin.x}
                panY={origin.y}
              />
            );
          }
          return null;
        })() : null}
      </div>

      {!doc ? <EmptyState onOpenFile={onOpenFile} dragOver={dragOver} /> : null}
      {doc ? <ZoomBar onFit={handleFit} /> : null}
      {/* 触摸快捷方式（屏幕上的 Alt/Shift）。只在粗指针设备上渲染，判定在组件内 */}
      {doc ? <TouchShortcut /> : null}

      {/*
       * 菜单项用 getState() 现取而不是订阅：它要读十几个 action，
       * 订阅等于每次改动都重建菜单，而菜单只在弹出那一刻需要一份快照。
       */}
      {canvasMenu ? (
        <ContextMenu
          items={canvasMenuItems(useEditorStore.getState(), canvasMenu.hits, t)}
          x={canvasMenu.x}
          y={canvasMenu.y}
          onClose={() => setCanvasMenu(null)}
        />
      ) : null}
    </div>
  );
}
