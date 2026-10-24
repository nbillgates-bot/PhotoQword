/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { useEffect, useRef } from 'react';
import { useEditorStore } from '../../store';
import { alignShift, fontString } from '../../engine/textRender';
import { pointEditorBox } from '../../engine/textBox';
import { collectTextDiagnostics, logTextDiagnostics } from '../../engine/textDiagnostics';
import { resizeTextBox } from '../../engine/textResize';
import { useWebFontReady } from '../../hooks/useWebFontReady';
import { useTextEditorFocus } from '../../hooks/useTextEditorFocus';
import type { TextData } from '../../types';
import TextResizeHandles from './TextResizeHandles';
import TextColorOverlay from './TextColorOverlay';
import styles from './TextEditor.module.css';

interface TextEditorProps {
  layerId: string;
  data: TextData;
  zoom: number;
  panX: number;
  panY: number;
}

/** 拖拽会话：记录拖拽开始时的状态 */
interface ResizeSession {
  direction: string;
  pointerId: number;
  startPointer: { x: number; y: number };
  originalBounds: { x: number; y: number; width: number; height: number };
}

/**
 * 文字编辑器：叠在 canvas 上的 textarea。
 * 对齐 PS：Esc 取消并还原，Ctrl/Cmd+Enter 提交，点到别处也提交。
 */
export default function TextEditor({ layerId, data, zoom, panX, panY }: TextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const originalContentRef = useRef(data.content);
  const resizeSessionRef = useRef<ResizeSession | null>(null);

  const updateTextDraft = useEditorStore((state) => state.updateTextDraft);
  const exitTextEdit = useEditorStore((state) => state.exitTextEdit);
  const pushHistory = useEditorStore((state) => state.pushHistory);
  const layer = useEditorStore((state) => state.layers.find((item) => item.id === layerId));

  // 聚焦、blur 取舍、上色后复原焦点与选区，都在这个 hook 里
  const { handleBlur, reportSelection } = useTextEditorFocus(
    textareaRef,
    Boolean(originalContentRef.current),
  );

  const isParagraph = data.width !== undefined && data.height !== undefined;

  /*
   * 字体还在下载时先用后备字体的尺寸顶着，到货后这个 hook 触发一次重渲染，
   * 下面的测量跟着重做。少了它，盒子会一直按后备字体的字宽定死，
   * 而 textarea 里的字已经换成真字体了，两者对不上。
   */
  useWebFontReady(data.fontFamily, data.fontWeight);

  /*
   * 点文本的编辑框尺寸。必须自己算，不能交给 textarea 的默认尺寸：
   * width:auto 的 textarea 宽度来自 cols（默认 20 字符），height:auto 来自 rows（默认 2 行）。
   *
   * 宽度不对会毁掉对齐——textAlign 是相对这个盒子生效的，盒子有 20 字符宽时
   * 「居中」是在这 20 字符里居中，而 renderText 是绕着 data.x 居中，两者差着一大截。
   * 高度不对会裁掉内容——overflow 是 hidden，超过 2 行的点文本进编辑就只剩 2 行。
   *
   * 不套 useMemo：测量本身很便宜（建一个 canvas 量几行字），而每次按键 data 都会换新引用，
   * memo 本来也命不中；反倒是「字体到货」这种 data 没变但结果要变的情况会被 memo 卡住。
   */
  const point = isParagraph ? null : pointEditorBox(data);

  /*
   * 诊断日志。只在字体、字号、对齐这些「会让排版整体变样」的字段变化时打，
   * 不跟着每次按键刷屏。进入编辑、字体到货、在选项栏换字体，各会打一条。
   */
  const logKey = `${data.fontFamily}|${data.fontSize}|${data.align}|${data.bold}|${data.italic}`;
  const loggedKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layer) return;
    /*
     * data 和 layer 每次按键都换新引用，effect 因此每键都会跑一遍；
     * 靠这个守卫把日志压到「真正影响排版的字段变了」才打一条。
     * 写成依赖数组里只放 logKey 也能达到同样效果，但那样 data / layer 就成了
     * 没申报的依赖，读的人无从判断它拿到的是不是最新值。
     */
    if (loggedKeyRef.current === logKey) return;
    loggedKeyRef.current = logKey;
    logTextDiagnostics(collectTextDiagnostics(layer, data));
  }, [layer, data, logKey]);

  /*
   * renderText 设了 textAlign = data.align，所以点文本的 data.x 是**落笔点**：
   * 居中时是中线、右对齐时是右边。而 textarea 是按左上角定位的，
   * 盒子左边要往回退一整个位移，行内的 textAlign 才会把字放回 data.x 上。
   *
   * 不退的话，居中的文字一进编辑就整体右移半个行宽——正是「位置变了」的来源。
   * 位移量算的是含 CARET_ROOM 的盒宽，因为 textAlign 也是相对这个盒子生效的。
   */
  const shift = point ? alignShift(data.align, point.width) : 0;

  // 编辑器在视口中的位置。panX/panY 传的是文档原点，不含 data 自身偏移
  const x = (data.x - shift) * zoom + panX;
  const y = data.y * zoom + panY;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        // PS：Esc 放弃本次编辑，内容回到进入编辑前的样子
        updateTextDraft(layerId, { content: originalContentRef.current });
        exitTextEdit();
        return;
      }
      // PS：Ctrl/Cmd+Enter 提交文字（回车本身是换行）
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        exitTextEdit();
      }
    };
    // 捕获阶段接管，避免 Esc / 快捷键被全局监听器先吃掉
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [exitTextEdit, updateTextDraft, layerId]);

  // 手柄按下：开始拖拽调整尺寸
  const handleHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isParagraph) return;
    event.preventDefault();
    event.stopPropagation();

    const direction = event.currentTarget.dataset.direction;
    if (!direction) return;

    resizeSessionRef.current = {
      direction,
      pointerId: event.pointerId,
      startPointer: { x: event.clientX, y: event.clientY },
      originalBounds: {
        x: data.x,
        y: data.y,
        width: data.width!,
        height: data.height!,
      },
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // 拖拽中：实时更新边界框尺寸
  const handlePointerMove = (event: React.PointerEvent) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    const dx = (event.clientX - session.startPointer.x) / zoom;
    const dy = (event.clientY - session.startPointer.y) / zoom;
    updateTextDraft(layerId, resizeTextBox(session.originalBounds, session.direction, dx, dy));
  };

  /*
   * textarea 与彩色叠层共用的排版样式。
   *
   * 必须是同一个对象喂给两边：任何一项对不上（字号、字距、行高、折行规则、
   * 盒子尺寸）两层的字就会错开，看起来像重影。
   *
   * 按「文档字号排版 + transform 缩放」而不是直接用放大后的字号：
   * 字形测量对字号不是严格线性的（hinting），textarea 在 fontSize×zoom 上折行、
   * renderText 在 fontSize 上折行，断点会错开一两个字。让两边都在文档尺寸下
   * 测量，折行结果就天然一致。
   */
  const layout: React.CSSProperties = {
    font: fontString(data),
    textAlign: data.align,
    letterSpacing: `${data.letterSpacing}px`,
    lineHeight: data.lineHeight,
    textDecoration: data.underline ? 'underline' : 'none',
    transform: `scale(${zoom})`,
    transformOrigin: 'top left',
    // 段落文本用边界框尺寸，点文本用实测尺寸（原因见 point 的注释）
    width: `${isParagraph ? data.width! : point!.width}px`,
    height: `${isParagraph ? data.height! : point!.height}px`,
    // 尺寸全部自己算，别让 CSS 的 min-width/min-height 再兜一层把对齐算歪
    minWidth: 0,
    minHeight: 0,
    whiteSpace: isParagraph ? 'pre-wrap' : 'pre',
    overflowWrap: isParagraph ? 'break-word' : 'normal',
    // PS 里超出边界框的文字被裁掉而不是出滚动条；出了滚动条还会占掉折行宽度
    overflow: 'hidden',
  };

  const hasColorRuns = Boolean(data.colorRuns?.length);

  // 松手：结束拖拽并写历史
  const handlePointerUp = (event: React.PointerEvent) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;

    resizeSessionRef.current = null;
    // 只动了这一个图层，点名免得历史去扫全部图层
    pushHistory('action.adjustText', { layerIds: [layerId] });
  };

  return (
    <div
      className={styles.container}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        width: `${(isParagraph ? data.width! : point!.width) * zoom}px`,
        height: `${(isParagraph ? data.height! : point!.height) * zoom}px`,
      }}
      // 拖拽过程的全局监听
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      // 别让画布工具收到这里的指针事件，否则点一下就又新建一个文字层
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {/* 段落文本显示边界框 */}
      {isParagraph && <div className={styles.boundingBox} />}

      {/* 段落文本的 8 个调整手柄 */}
      {isParagraph && <TextResizeHandles onPointerDown={handleHandlePointerDown} />}

      <textarea
        ref={textareaRef}
        className={styles.editor}
        value={data.content}
        onChange={(event) => {
          updateTextDraft(layerId, { content: event.target.value });
          // 内容变了选区也跟着变，改完立刻上报，别等下一次 onSelect
          reportSelection();
        }}
        onSelect={reportSelection}
        onKeyUp={reportSelection}
        onPointerUp={reportSelection}
        onBlur={handleBlur}
        spellCheck={false}
        style={{
          ...layout,
          /*
           * 有字符级颜色时把 textarea 的文字设成透明，真正看到的字由
           * TextColorOverlay 画（textarea 本身没法一段一个颜色）。
           * 光标颜色由 CSS 的 caret-color 单独给，不受这里影响。
           */
          color: hasColorRuns ? 'transparent' : data.color,
        }}
      />

      {/* 彩色叠层压在 textarea 上面，原因见 TextColorOverlay 的注释 */}
      {hasColorRuns ? <TextColorOverlay data={data} layout={layout} /> : null}
    </div>
  );
}
