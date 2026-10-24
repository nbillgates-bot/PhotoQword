/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 视口与文档坐标系的换算。
 *
 * 文档在视口里的摆法是「先居中，再叠 pan 偏移，最后按 zoom 缩放」，
 * 这个居中项很容易在换算时被漏掉——漏了以后缩放到 100% 以上时
 * 算出来的可见区域会整体偏到文档之外，视口裁剪会把所有图层都判成不可见。
 * 所以把它收成纯函数，让两处调用（坐标换算、视口裁剪）共用同一份实现。
 */

export interface ViewportBox {
  width: number;
  height: number;
}

export interface OriginArgs {
  viewport: ViewportBox;
  docWidth: number;
  docHeight: number;
  zoom: number;
  panX: number;
  panY: number;
}

/** 文档左上角在视口里的位置（视口坐标，可为负） */
export function documentOrigin(args: OriginArgs): { x: number; y: number } {
  const { viewport, docWidth, docHeight, zoom, panX, panY } = args;
  return {
    x: (viewport.width - docWidth * zoom) / 2 + panX,
    y: (viewport.height - docHeight * zoom) / 2 + panY,
  };
}

/**
 * pan 的绝对值上限。
 *
 * 与 PS 默认行为一致：文档比视口大时，最多滚到文档边缘与视口边缘对齐，
 * 不允许把内容整块拖出视口（PS 里那叫「过度滚动」，默认关闭）；
 * 文档比视口小时锁死居中，pan 只能是 0。
 */
export function panLimit(viewportLength: number, docLength: number, zoom: number): number {
  const scaled = docLength * zoom;
  return Math.max(0, (scaled - viewportLength) / 2);
}

/**
 * 把 pan 夹回合法范围。
 *
 * 视口尺寸还是 0 时（ResizeObserver 首帧之前）不夹：那时算出来的上限
 * 是「文档的一半」这种假值，夹了会把初始视图推歪。
 */
export function clampPan(args: OriginArgs): { x: number; y: number } {
  const { viewport, docWidth, docHeight, zoom, panX, panY } = args;
  if (viewport.width <= 0 || viewport.height <= 0) return { x: panX, y: panY };
  return {
    x: clampToLimit(panX, panLimit(viewport.width, docWidth, zoom)),
    y: clampToLimit(panY, panLimit(viewport.height, docHeight, zoom)),
  };
}

/**
 * 夹到 ±limit。
 *
 * 末尾加 0 是为了把 -0 归一成 0：上限为 0 时夹负数会得到 -0，
 * 它会一路存进 store，让快照比对和测试断言出现「-0 不等于 0」的噪音。
 * 不用 `|| 0`，那样会把 NaN 也吞成 0，掩盖真正的计算错误。
 */
function clampToLimit(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value)) + 0;
}

/**
 * 视口覆盖到的文档区域（文档坐标）。
 *
 * 返回的矩形不夹到文档范围内：调用方是视口裁剪，只做相交判断，
 * 夹一次反而会把「文档完全在视口外」这种情形压成一个假的相交矩形。
 * zoom 为 0 或负数时退化成整个文档，宁可不裁也不要裁错。
 */
export function visibleDocRect(
  args: OriginArgs,
): { x: number; y: number; width: number; height: number } {
  const { viewport, docWidth, docHeight, zoom } = args;
  if (!(zoom > 0)) return { x: 0, y: 0, width: docWidth, height: docHeight };
  const origin = documentOrigin(args);
  return {
    x: -origin.x / zoom,
    y: -origin.y / zoom,
    width: viewport.width / zoom,
    height: viewport.height / zoom,
  };
}

export interface FocusZoomArgs {
  viewport: ViewportBox;
  docWidth: number;
  docHeight: number;
  /** 缩放前的比例，用来反算光标下的文档点 */
  fromZoom: number;
  /** 缩放后的比例（已夹在 MIN/MAX 之间） */
  toZoom: number;
  panX: number;
  panY: number;
  /** 焦点在视口内的坐标（不是 client 坐标，调用方先减掉视口的 left/top） */
  focus: { x: number; y: number };
}

/**
 * 求「让焦点下的文档点缩放后仍停在焦点处」所需的 pan，结果已夹到合法范围。
 *
 * 这是 documentOrigin 的逆解：origin = (视口 - 文档*zoom)/2 + pan，
 * 而 focus = origin + 文档点*zoom，两式消掉 origin 即得下面的式子。
 * 那个 (视口 - 文档*zoom)/2 的居中项极易漏掉——漏了以后大文档在低缩放下
 * 一次滚轮就能把视图甩出文档之外，表现为「缩放没反应」。
 */
export function panForFocusZoom(args: FocusZoomArgs): { x: number; y: number } {
  const { viewport, docWidth, docHeight, fromZoom, toZoom, panX, panY, focus } = args;
  if (!(fromZoom > 0) || !(toZoom > 0)) return clampPan({ ...args, zoom: fromZoom });
  const before = documentOrigin({ viewport, docWidth, docHeight, zoom: fromZoom, panX, panY });
  const docPoint = { x: (focus.x - before.x) / fromZoom, y: (focus.y - before.y) / fromZoom };
  return clampPan({
    viewport,
    docWidth,
    docHeight,
    zoom: toZoom,
    panX: focus.x - docPoint.x * toZoom - (viewport.width - docWidth * toZoom) / 2,
    panY: focus.y - docPoint.y * toZoom - (viewport.height - docHeight * toZoom) / 2,
  });
}
