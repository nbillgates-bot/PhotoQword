/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 自定义光标。
 *
 * CSS 没有吸管、油漆桶这类光标关键字，而 PS 的这些工具都有专属指针形状，
 * 只用 crosshair 会让用户分不清当前拿的是哪个工具。所以用内联 SVG 的
 * data URI 自己画。
 *
 * 三条注意：
 * - 必须给 SVG 显式的 width/height，Safari 缺了尺寸会整个忽略这个光标。
 * - 必须带一个关键字兜底（`, crosshair`），这是 CSS 规范要求的，
 *   也保证 data URI 万一被 CSP 拦掉时还有可用光标。
 * - 尺寸压在 24px 内：各浏览器对光标图像有上限，超了会静默不显示。
 */

/** 把 SVG 源码包成可用的 cursor 值。hotspot 是热点坐标，fallback 是兜底关键字 */
function svgCursor(svg: string, hotX: number, hotY: number, fallback: string): string {
  // 只编码必须转义的字符，保持 data URI 可读，也避免 base64 让体积膨胀
  const encoded = svg
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/"/g, "'")
    .replace(/[<>#%{}|\\^[\]`]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `url("data:image/svg+xml,${encoded}") ${hotX} ${hotY}, ${fallback}`;
}

/** 描边统一：黑线白底，保证在任何画面上都看得清 */
const OUTLINE = 'fill="#ffffff" stroke="#000000" stroke-width="1.5"';

/** 吸管：热点在管尖（左下） */
const EYEDROPPER = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
     <path ${OUTLINE} d="M3 21 L3 17 L14 6 L18 10 L7 21 Z"/>
     <path ${OUTLINE} d="M13 5 L19 11 L21.5 8.5 L15.5 2.5 Z"/>
   </svg>`,
  2,
  22,
  'crosshair',
);

/** 油漆桶：热点在倾倒口（左下） */
const BUCKET = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
     <path ${OUTLINE} d="M4 13 L11 6 L19 14 L12 21 Z"/>
     <path ${OUTLINE} d="M11 6 L8 3"/>
     <path ${OUTLINE} d="M19 15 C21 17 22 18 22 19.5 A1.6 1.6 0 0 1 18.8 19.5 C18.8 18 19 17 19 15 Z"/>
   </svg>`,
  3,
  21,
  'crosshair',
);

/** 仿制图章：热点在章底中心 */
const STAMP = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
     <path ${OUTLINE} d="M6 21 L18 21 L18 18 L6 18 Z"/>
     <path ${OUTLINE} d="M8 18 L8 14 L16 14 L16 18 Z"/>
     <path ${OUTLINE} d="M9.5 14 L9.5 6 A2.5 2.5 0 0 1 14.5 6 L14.5 14 Z"/>
   </svg>`,
  12,
  21,
  'crosshair',
);

/**
 * 旋转：弯曲的双向箭头。
 *
 * 旋转光标要根据指针落在框的哪个区域——四角+四边各给一个方向，
 * 让用户看清这个位置转起来是顺时针还是逆时针。PS 也是这样：
 * 在顶边外侧的旋转图标是水平弧，左上角外侧是斜向弧。
 *
 * 一共 8 个方向（N/NE/E/SE/S/SW/W/NW），基准朝向是"北方"（弧开口向上），
 * 其余 7 个用 SVG transform 旋转 45° 的倍数生成。热点在中心，
 * 这样旋转后 12,12 还指着同一处。
 */

/** 把 SVG glyph 绕中心旋转 degrees 度，包进 <g> 里 */
function rotateGlyph(path: string, degrees: number): string {
  if (degrees === 0) return path;
  return `<g transform="rotate(${degrees} 12 12)">${path}</g>`;
}

/*
 * 基准图标（朝北）：一条从 -145° 扫到 -35° 的圆环带，两端各一个箭头。
 *
 * 几何按中心 (12,12) 算：带宽在半径 5.0～7.8 之间，箭头底边沿半径方向
 * 从 r=3.2 铺到 r=9.6（6.4 宽，是带宽的两倍多），尖端沿切线外伸 5.5。
 * 箭头必须明显比带宽，否则缩到 24px 就只剩一道月牙，看不出是箭头。
 *
 * 写成一条闭合路径而不是两条：两条路径在接缝处会各描一次边，
 * 中间出现一道多余的黑线。整条闭合后描边只走外轮廓。
 */
const ROTATE_BASE_PATH = `
  <path fill="#ffffff" stroke="#000000" stroke-width="1.2" stroke-linejoin="round"
    d="M 9.38 10.17 L 3.61 12.84 L 4.14 6.49 L 5.61 7.53
       A 7.8 7.8 0 0 1 18.39 7.53 L 19.86 6.49 L 20.4 12.84 L 14.62 10.17
       L 16.1 9.13 A 5 5 0 0 0 7.9 9.13 Z"/>
`.trim();

/** 八方向旋转光标，按罗盘命名：N=正北（基准），E=正东，以此类推 */
const ROTATE_DIRECTIONS: Array<{ key: string; deg: number }> = [
  { key: 'n', deg: 0 },
  { key: 'ne', deg: 45 },
  { key: 'e', deg: 90 },
  { key: 'se', deg: 135 },
  { key: 's', deg: 180 },
  { key: 'sw', deg: 225 },
  { key: 'w', deg: 270 },
  { key: 'nw', deg: 315 },
];

const ROTATE_CURSORS = Object.fromEntries(
  ROTATE_DIRECTIONS.map(({ key, deg }) => [
    `rotate-${key}`,
    svgCursor(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
         ${rotateGlyph(ROTATE_BASE_PATH, deg)}
       </svg>`,
      12,
      12,
      'crosshair',
    ),
  ]),
);

/**
 * 线条型图标的描边包装。
 *
 * 上面 OUTLINE 那套（白底黑边）只适合闭合的实心形状，套索这种线稿用不了：
 * 填白会把绳圈内部糊成一块。所以改成描两遍——先粗白线当外发光，
 * 再在上面压一遍细黑线。这样在深色和浅色画面上都看得清。
 */
function strokeGlyph(paths: string): string {
  const halo = `fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"`;
  const ink = `fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
  return `<g ${halo}>${paths}</g><g ${ink}>${paths}</g>`;
}

/*
 * 套索的绳圈字形，与工具栏用的 lucide `Lasso` 图标同一套几何。
 *
 * 光标和工具栏按钮长得一样，用户才能把"手里这个"和"刚点的那个"对上。
 * 形状是：一个大椭圆绳圈，左下角一个绳结小圆，再往下拖一截绳尾。
 */
const LASSO_GLYPH = `
  <path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8-4.48 8-10 8a12 12 0 0 1-1.5-.09"/>
  <path d="M7 16.93c.96.43 1.96.74 2.99.91"/>
  <circle cx="5" cy="16" r="2"/>
  <path d="M7 22a5 5 0 0 1-2-4"/>
`.trim();

/**
 * 套索。热点在绳尾末端（左下），与 PS 一致——
 * 落笔点是绳子的尖，不是图标的中心，否则画出来的选区会整体偏移。
 */
const LASSO = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
     ${strokeGlyph(LASSO_GLYPH)}
   </svg>`,
  6,
  22,
  'crosshair',
);

/**
 * 多边形套索：同样的绳圈，绳尾换成折线。
 *
 * PS 里这两个工具的光标就是靠尾巴区分的——自由套索是弧线，
 * 多边形套索是带拐角的折线，对应"点一下走一段直线"的行为。
 */
const POLYGON_LASSO = svgCursor(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
     ${strokeGlyph(`
       <path d="M3.34 14A6.8 6.8 0 0 1 2 10c0-4.42 4.48-8 10-8s10 3.58 10 8-4.48 8-10 8a12 12 0 0 1-1.5-.09"/>
       <path d="M7 16.93c.96.43 1.96.74 2.99.91"/>
       <circle cx="5" cy="16" r="2"/>
       <path d="M5 18 L9 21 L5 23"/>
     `)}
   </svg>`,
  6,
  22,
  'crosshair',
);

export const CURSORS = {
  eyedropper: EYEDROPPER,
  bucket: BUCKET,
  stamp: STAMP,
  lasso: LASSO,
  'polygon-lasso': POLYGON_LASSO,
  'rotate-n': ROTATE_CURSORS['rotate-n'],
  'rotate-ne': ROTATE_CURSORS['rotate-ne'],
  'rotate-e': ROTATE_CURSORS['rotate-e'],
  'rotate-se': ROTATE_CURSORS['rotate-se'],
  'rotate-s': ROTATE_CURSORS['rotate-s'],
  'rotate-sw': ROTATE_CURSORS['rotate-sw'],
  'rotate-w': ROTATE_CURSORS['rotate-w'],
  'rotate-nw': ROTATE_CURSORS['rotate-nw'],
} as const;
