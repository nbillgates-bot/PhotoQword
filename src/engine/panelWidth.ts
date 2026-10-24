/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 右侧面板宽度的取值规则。
 *
 * 纯逻辑，不碰 DOM 也不碰 store：拖动时每帧都要算一次，边界最容易写错，
 * 单独测才靠得住。
 *
 * 行为对齐 Photopea：拖分隔条改宽度，拖过头就夹在下限，**不折叠成图标栏**。
 * PS 桌面版有「折叠为图标」那一档，但收成一条图标之后要先认图标再点开才能用，
 * 比直接留一条窄面板更慢；Photopea 只保留拖拽，实际更顺手。这里取后者。
 * 想彻底腾出空间用「窗口」菜单整块隐藏面板，那是另一条路径。
 */

/**
 * 宽度下限（桌面档）。这个值已大幅放宽 —— 用户要求"去掉拖动限制"。
 *
 * 现在下限是 44px（图标轨宽度），可以拖到接近完全收起。再小就看不见面板了，
 * 需要提供别的入口（菜单或快捷键）才能重新打开，那不如留个图标轨。
 */
export const MIN_PANEL_WIDTH = 44;


/**
 * 上限的绝对值约束已移除。用户要求"不限制"，现在唯一约束是：
 * 面板最宽 = 视口宽度 - 工具栏(52) - 分隔条(4) - 画布至少留(100)。
 *
 * 100px 是技术最小值：画布再窄就完全看不清了。如果用户真要把面板拖到
 * 占满整个窗口，他会发现画布只剩 100px 不可用，然后自己拖回来。
 */
const CANVAS_MIN_WIDTH = 100;

/**
 * 窄屏图标轨的宽度。与 --touch-target 同值，两处要一致。
 *
 * 图标轨是固定宽度的，不参与拖动 —— 收起态下 EditorLayout 直接把面板列
 * 设成这个值，不走 clampPanelWidth。之前收起态仍按 clamp 的结果给列宽（390px
 * 手机上是 234），图标轨只用掉 44，剩下 190 是一片空背景，画布反而被压到 98。
 */
export const RAIL_WIDTH = 44;

/** 左侧工具栏的宽度，与 EditorLayout 栅格第一列同值 */
const TOOLBAR_WIDTH = 52;

/**
 * 窄屏面板体的宽度上下限。
 *
 * 上限 360：再宽在 819px 的平板上就成了半屏浮层，没意义。
 * 下限 160：低于这个宽度里面的行会折得认不出内容。
 */
const NARROW_BODY_MAX_WIDTH = 360;
const NARROW_BODY_MIN_WIDTH = 160;

/**
 * 窄屏展开态下面板体该有多宽。
 *
 * 窄屏的面板体是**浮在画布上**的（position: fixed），不占栅格宽度，所以这个
 * 值与 clampPanelWidth 那套「给画布留 100px」的约束无关：画布恒为
 * 视口 - 52 - 轨宽，开合面板不会让画布重排，也就不会连锁触发
 * CanvasArea 的 ResizeObserver 重新合成。
 *
 * 为什么非要浮起来加宽：在流的时候面板体只有 165px，装不下面板里**任何**
 * 一排按钮 —— 底部操作条 11 颗、锁定栏 4 颗、过滤栏 4 颗，触屏下每颗 32px。
 * 于是每排折成三四行，头尾控件吃掉 753px，图层列表只剩下限那 200px。
 * 而在流里加宽的代价是画布被压到 40px，两头都不能要。
 *
 * 左边留出工具栏宽度：不留的话展开着面板就换不了工具。
 */
export function narrowBodyWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return NARROW_BODY_MIN_WIDTH;
  const besideToolbar = viewportWidth - RAIL_WIDTH - TOOLBAR_WIDTH;
  const wanted = Math.min(
    NARROW_BODY_MAX_WIDTH,
    Math.max(NARROW_BODY_MIN_WIDTH, besideToolbar),
  );
  // 极窄视口上「露出工具栏」让位给「别盖住图标轨」：轨被盖住就再也收不起来
  return Math.max(1, Math.min(wanted, viewportWidth - RAIL_WIDTH));
}

/*
 * 这里曾经有一个 minPanelWidth(viewportWidth)：窄屏返回「轨宽 + 120」，
 * 防止出现「展开着但面板体宽度是 0」的一条空带。
 *
 * 窄屏面板体改成浮层（narrowBodyWidth）之后那个情形不存在了 —— 窄屏的面板列
 * 恒为轨宽，不用 panelWidth，也没有分隔条可拖。留着它就是个保护不了任何东西
 * 的假下限，而且会让「手机上访问一次就把存着的桌面宽度改小」这件事更难看懂。
 * 下限重新变回常量 MIN_PANEL_WIDTH。
 */

/** 默认宽度。与改造前写死在 CSS 里的那个值一致，保持手感不变 */
export const DEFAULT_PANEL_WIDTH = 288;

/**
 * 没存过偏好时该用多宽。
 *
 * 这里曾经按 820 分档，窄屏给 210 —— 因为那时面板体在文档流里，288 会把画布
 * 压到 100px。现在窄屏的面板体是浮层，宽度由 narrowBodyWidth 单独决定，
 * panelWidth 在窄屏根本用不上，所以不再分档：这个值只服务宽屏。
 *
 * 顺带修掉一个副作用：分档时手机上打开一次会把 panelWidth 写成 210，
 * 转到横屏（≥820）就变成 210 宽的面板，而用户在桌面上其实存的是别的值。
 */
export function defaultPanelWidth(): number {
  return DEFAULT_PANEL_WIDTH;
}

/**
 * 当前视口下的宽度上限。
 *
 * 用户要求"去掉限制"。现在唯一约束是给画布留最少可用空间：
 * maxPanelWidth = viewportWidth - 工具栏(52) - 分隔条(4) - 画布最小(100)
 *                = viewportWidth - 156
 *
 * 在 390px 手机上，上限是 234，画布还剩 100；桌面 1440px 上限是 1284。
 * 用户如果真拖到这么宽发现不好用，自己会拖回来。
 */
export function maxPanelWidth(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return MIN_PANEL_WIDTH;
  const max = viewportWidth - 52 - 4 - CANVAS_MIN_WIDTH;
  // 上限不能小于下限，否则区间反过来
  return Math.max(MIN_PANEL_WIDTH, max);
}

/**
 * 把宽度夹进合法区间。
 *
 * 非有限值退回默认宽度：NaN 传进 grid-template-columns 会让整列塌掉，
 * 而 NaN 的来源（读坏的存档、算错的指针位置）不该由布局层去猜。
 *
 * 上限仍随视口走：窗口缩小之后存着的宽度可能已经超过上限，不重新夹会把画布挤没。
 */
export function clampPanelWidth(width: number, viewportWidth: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANEL_WIDTH;
  return Math.max(MIN_PANEL_WIDTH, Math.min(maxPanelWidth(viewportWidth), Math.round(width)));
}
