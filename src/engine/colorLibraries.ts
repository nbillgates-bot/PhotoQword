/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
/**
 * 颜色库清单。
 *
 * 只登记可自由分发的色库（公有领域 / 开源许可）。
 * 专有色库（潘通等）不能内置——要用的话用户自己买正版文件导入（.ase / .aco 格式）。
 *
 * 参考 webFontSources 的模式：加色库只改数据不改逻辑（规约 §1.3）。
 */

export interface ColorSwatch {
  /** 十六进制颜色值，带 # 号 */
  hex: string;
  /** 颜色名（可选）。CSS 命名色有、材料设计可以按 hue-shade 推，Web 安全色用不到 */
  name?: string;
}

export interface ColorLibrary {
  id: string;
  /** 显示名，要翻译的话调用方自己加 t() */
  name: string;
  /** 色块按行分组（Material Design 按色相分 10 行，Tailwind 类似），没有就单行摊平 */
  rows?: ColorSwatch[][];
  /** 没 rows 时平铺用这个 */
  colors?: ColorSwatch[];
}

/**
 * Web 安全色（216 色）。
 *
 * 6×6×6 RGB 立方：每通道取 00/33/66/99/CC/FF，任意浏览器都不会抖动。
 * 现在已经 2026 年了，8bit 色彩早成历史，这张表更多是个参照物，
 * 但它干净、覆盖广、数量适中，仍然值得放进来。
 */
const WEB_SAFE_COLORS: ColorSwatch[] = (() => {
  const result: ColorSwatch[] = [];
  const steps = [0x00, 0x33, 0x66, 0x99, 0xcc, 0xff];
  for (const r of steps) {
    for (const g of steps) {
      for (const b of steps) {
        const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        result.push({ hex });
      }
    }
  }
  return result;
})();

/**
 * CSS 命名颜色（147 个，按色相粗分 8 档）。
 *
 * W3C 标准，所有浏览器支持。按色相归类，每行一组，便于快速定位。
 * 来源：CSS Color Module Level 4 的 named colors 清单。
 */
const CSS_NAMED: ColorLibrary = {
  id: 'css-named',
  name: 'colorLib.cssNamed',
  rows: [
    // 红色系
    [
      { hex: '#f08080', name: 'lightcoral' },
      { hex: '#cd5c5c', name: 'indianred' },
      { hex: '#dc143c', name: 'crimson' },
      { hex: '#ff0000', name: 'red' },
      { hex: '#b22222', name: 'firebrick' },
      { hex: '#8b0000', name: 'darkred' },
      { hex: '#ffa07a', name: 'lightsalmon' },
      { hex: '#fa8072', name: 'salmon' },
      { hex: '#e9967a', name: 'darksalmon' },
      { hex: '#ff6347', name: 'tomato' },
      { hex: '#ff4500', name: 'orangered' },
      { hex: '#ff7f50', name: 'coral' },
    ],
    // 橙/黄色系
    [
      { hex: '#ffa500', name: 'orange' },
      { hex: '#ff8c00', name: 'darkorange' },
      { hex: '#ffd700', name: 'gold' },
      { hex: '#ffff00', name: 'yellow' },
      { hex: '#ffffe0', name: 'lightyellow' },
      { hex: '#fffacd', name: 'lemonchiffon' },
      { hex: '#fafad2', name: 'lightgoldenrodyellow' },
      { hex: '#ffefd5', name: 'papayawhip' },
      { hex: '#ffe4b5', name: 'moccasin' },
      { hex: '#ffdab9', name: 'peachpuff' },
      { hex: '#eee8aa', name: 'palegoldenrod' },
      { hex: '#f0e68c', name: 'khaki' },
      { hex: '#bdb76b', name: 'darkkhaki' },
    ],
    // 绿色系
    [
      { hex: '#adff2f', name: 'greenyellow' },
      { hex: '#7fff00', name: 'chartreuse' },
      { hex: '#7cfc00', name: 'lawngreen' },
      { hex: '#00ff00', name: 'lime' },
      { hex: '#32cd32', name: 'limegreen' },
      { hex: '#98fb98', name: 'palegreen' },
      { hex: '#90ee90', name: 'lightgreen' },
      { hex: '#00fa9a', name: 'mediumspringgreen' },
      { hex: '#00ff7f', name: 'springgreen' },
      { hex: '#3cb371', name: 'mediumseagreen' },
      { hex: '#2e8b57', name: 'seagreen' },
      { hex: '#228b22', name: 'forestgreen' },
      { hex: '#008000', name: 'green' },
      { hex: '#006400', name: 'darkgreen' },
      { hex: '#9acd32', name: 'yellowgreen' },
      { hex: '#6b8e23', name: 'olivedrab' },
      { hex: '#808000', name: 'olive' },
      { hex: '#556b2f', name: 'darkolivegreen' },
      { hex: '#66cdaa', name: 'mediumaquamarine' },
      { hex: '#8fbc8f', name: 'darkseagreen' },
      { hex: '#20b2aa', name: 'lightseagreen' },
      { hex: '#008b8b', name: 'darkcyan' },
      { hex: '#008080', name: 'teal' },
    ],
    // 青/蓝色系
    [
      { hex: '#00ffff', name: 'cyan' },
      { hex: '#00ffff', name: 'aqua' },
      { hex: '#e0ffff', name: 'lightcyan' },
      { hex: '#afeeee', name: 'paleturquoise' },
      { hex: '#7fffd4', name: 'aquamarine' },
      { hex: '#40e0d0', name: 'turquoise' },
      { hex: '#48d1cc', name: 'mediumturquoise' },
      { hex: '#00ced1', name: 'darkturquoise' },
      { hex: '#5f9ea0', name: 'cadetblue' },
      { hex: '#4682b4', name: 'steelblue' },
      { hex: '#b0c4de', name: 'lightsteelblue' },
      { hex: '#b0e0e6', name: 'powderblue' },
      { hex: '#add8e6', name: 'lightblue' },
      { hex: '#87ceeb', name: 'skyblue' },
      { hex: '#87cefa', name: 'lightskyblue' },
      { hex: '#00bfff', name: 'deepskyblue' },
      { hex: '#1e90ff', name: 'dodgerblue' },
      { hex: '#6495ed', name: 'cornflowerblue' },
      { hex: '#4169e1', name: 'royalblue' },
      { hex: '#0000ff', name: 'blue' },
      { hex: '#0000cd', name: 'mediumblue' },
      { hex: '#00008b', name: 'darkblue' },
      { hex: '#000080', name: 'navy' },
      { hex: '#191970', name: 'midnightblue' },
    ],
    // 紫/粉色系
    [
      { hex: '#e6e6fa', name: 'lavender' },
      { hex: '#d8bfd8', name: 'thistle' },
      { hex: '#dda0dd', name: 'plum' },
      { hex: '#ee82ee', name: 'violet' },
      { hex: '#da70d6', name: 'orchid' },
      { hex: '#ff00ff', name: 'magenta' },
      { hex: '#ba55d3', name: 'mediumorchid' },
      { hex: '#9370db', name: 'mediumpurple' },
      { hex: '#8a2be2', name: 'blueviolet' },
      { hex: '#9400d3', name: 'darkviolet' },
      { hex: '#9932cc', name: 'darkorchid' },
      { hex: '#8b008b', name: 'darkmagenta' },
      { hex: '#800080', name: 'purple' },
      { hex: '#4b0082', name: 'indigo' },
      { hex: '#6a5acd', name: 'slateblue' },
      { hex: '#483d8b', name: 'darkslateblue' },
      { hex: '#7b68ee', name: 'mediumslateblue' },
      { hex: '#ff1493', name: 'deeppink' },
      { hex: '#ff69b4', name: 'hotpink' },
      { hex: '#ffb6c1', name: 'lightpink' },
      { hex: '#ffc0cb', name: 'pink' },
      { hex: '#db7093', name: 'palevioletred' },
      { hex: '#c71585', name: 'mediumvioletred' },
    ],
    // 棕色系
    [
      { hex: '#fff5ee', name: 'seashell' },
      { hex: '#f5f5dc', name: 'beige' },
      { hex: '#ffe4c4', name: 'bisque' },
      { hex: '#ffdead', name: 'navajowhite' },
      { hex: '#f5deb3', name: 'wheat' },
      { hex: '#deb887', name: 'burlywood' },
      { hex: '#d2b48c', name: 'tan' },
      { hex: '#bc8f8f', name: 'rosybrown' },
      { hex: '#f4a460', name: 'sandybrown' },
      { hex: '#daa520', name: 'goldenrod' },
      { hex: '#b8860b', name: 'darkgoldenrod' },
      { hex: '#cd853f', name: 'peru' },
      { hex: '#d2691e', name: 'chocolate' },
      { hex: '#8b4513', name: 'saddlebrown' },
      { hex: '#a0522d', name: 'sienna' },
      { hex: '#a52a2a', name: 'brown' },
      { hex: '#800000', name: 'maroon' },
    ],
    // 灰/白/黑
    [
      { hex: '#ffffff', name: 'white' },
      { hex: '#fffafa', name: 'snow' },
      { hex: '#f0fff0', name: 'honeydew' },
      { hex: '#f5fffa', name: 'mintcream' },
      { hex: '#f0ffff', name: 'azure' },
      { hex: '#f0f8ff', name: 'aliceblue' },
      { hex: '#f8f8ff', name: 'ghostwhite' },
      { hex: '#f5f5f5', name: 'whitesmoke' },
      { hex: '#fff0f5', name: 'lavenderblush' },
      { hex: '#fdf5e6', name: 'oldlace' },
      { hex: '#faf0e6', name: 'linen' },
      { hex: '#faebd7', name: 'antiquewhite' },
      { hex: '#ffefd5', name: 'papayawhip' },
      { hex: '#ffebcd', name: 'blanchedalmond' },
      { hex: '#ffe4e1', name: 'mistyrose' },
      { hex: '#dcdcdc', name: 'gainsboro' },
      { hex: '#d3d3d3', name: 'lightgray' },
      { hex: '#c0c0c0', name: 'silver' },
      { hex: '#a9a9a9', name: 'darkgray' },
      { hex: '#808080', name: 'gray' },
      { hex: '#696969', name: 'dimgray' },
      { hex: '#778899', name: 'lightslategray' },
      { hex: '#708090', name: 'slategray' },
      { hex: '#2f4f4f', name: 'darkslategray' },
      { hex: '#000000', name: 'black' },
    ],
  ],
};

/**
 * Material Design 调色板（2014 版）。
 *
 * Google 开源（Apache 2.0），10 色相 × 10 明度（50/100/200…900），加灰阶，共约 200 色。
 * 每行一个色相，从浅到深，拾取时能直观看出明度关系。
 */
const MATERIAL_DESIGN: ColorLibrary = {
  id: 'material',
  name: 'Material Design',
  rows: [
    // Red
    [
      { hex: '#ffebee', name: 'red-50' },
      { hex: '#ffcdd2', name: 'red-100' },
      { hex: '#ef9a9a', name: 'red-200' },
      { hex: '#e57373', name: 'red-300' },
      { hex: '#ef5350', name: 'red-400' },
      { hex: '#f44336', name: 'red-500' },
      { hex: '#e53935', name: 'red-600' },
      { hex: '#d32f2f', name: 'red-700' },
      { hex: '#c62828', name: 'red-800' },
      { hex: '#b71c1c', name: 'red-900' },
    ],
    // Pink
    [
      { hex: '#fce4ec', name: 'pink-50' },
      { hex: '#f8bbd0', name: 'pink-100' },
      { hex: '#f48fb1', name: 'pink-200' },
      { hex: '#f06292', name: 'pink-300' },
      { hex: '#ec407a', name: 'pink-400' },
      { hex: '#e91e63', name: 'pink-500' },
      { hex: '#d81b60', name: 'pink-600' },
      { hex: '#c2185b', name: 'pink-700' },
      { hex: '#ad1457', name: 'pink-800' },
      { hex: '#880e4f', name: 'pink-900' },
    ],
    // Purple
    [
      { hex: '#f3e5f5', name: 'purple-50' },
      { hex: '#e1bee7', name: 'purple-100' },
      { hex: '#ce93d8', name: 'purple-200' },
      { hex: '#ba68c8', name: 'purple-300' },
      { hex: '#ab47bc', name: 'purple-400' },
      { hex: '#9c27b0', name: 'purple-500' },
      { hex: '#8e24aa', name: 'purple-600' },
      { hex: '#7b1fa2', name: 'purple-700' },
      { hex: '#6a1b9a', name: 'purple-800' },
      { hex: '#4a148c', name: 'purple-900' },
    ],
    // Deep Purple
    [
      { hex: '#ede7f6', name: 'deep-purple-50' },
      { hex: '#d1c4e9', name: 'deep-purple-100' },
      { hex: '#b39ddb', name: 'deep-purple-200' },
      { hex: '#9575cd', name: 'deep-purple-300' },
      { hex: '#7e57c2', name: 'deep-purple-400' },
      { hex: '#673ab7', name: 'deep-purple-500' },
      { hex: '#5e35b1', name: 'deep-purple-600' },
      { hex: '#512da8', name: 'deep-purple-700' },
      { hex: '#4527a0', name: 'deep-purple-800' },
      { hex: '#311b92', name: 'deep-purple-900' },
    ],
    // Indigo
    [
      { hex: '#e8eaf6', name: 'indigo-50' },
      { hex: '#c5cae9', name: 'indigo-100' },
      { hex: '#9fa8da', name: 'indigo-200' },
      { hex: '#7986cb', name: 'indigo-300' },
      { hex: '#5c6bc0', name: 'indigo-400' },
      { hex: '#3f51b5', name: 'indigo-500' },
      { hex: '#3949ab', name: 'indigo-600' },
      { hex: '#303f9f', name: 'indigo-700' },
      { hex: '#283593', name: 'indigo-800' },
      { hex: '#1a237e', name: 'indigo-900' },
    ],
    // Blue
    [
      { hex: '#e3f2fd', name: 'blue-50' },
      { hex: '#bbdefb', name: 'blue-100' },
      { hex: '#90caf9', name: 'blue-200' },
      { hex: '#64b5f6', name: 'blue-300' },
      { hex: '#42a5f5', name: 'blue-400' },
      { hex: '#2196f3', name: 'blue-500' },
      { hex: '#1e88e5', name: 'blue-600' },
      { hex: '#1976d2', name: 'blue-700' },
      { hex: '#1565c0', name: 'blue-800' },
      { hex: '#0d47a1', name: 'blue-900' },
    ],
    // Light Blue
    [
      { hex: '#e1f5fe', name: 'light-blue-50' },
      { hex: '#b3e5fc', name: 'light-blue-100' },
      { hex: '#81d4fa', name: 'light-blue-200' },
      { hex: '#4fc3f7', name: 'light-blue-300' },
      { hex: '#29b6f6', name: 'light-blue-400' },
      { hex: '#03a9f4', name: 'light-blue-500' },
      { hex: '#039be5', name: 'light-blue-600' },
      { hex: '#0288d1', name: 'light-blue-700' },
      { hex: '#0277bd', name: 'light-blue-800' },
      { hex: '#01579b', name: 'light-blue-900' },
    ],
    // Cyan
    [
      { hex: '#e0f7fa', name: 'cyan-50' },
      { hex: '#b2ebf2', name: 'cyan-100' },
      { hex: '#80deea', name: 'cyan-200' },
      { hex: '#4dd0e1', name: 'cyan-300' },
      { hex: '#26c6da', name: 'cyan-400' },
      { hex: '#00bcd4', name: 'cyan-500' },
      { hex: '#00acc1', name: 'cyan-600' },
      { hex: '#0097a7', name: 'cyan-700' },
      { hex: '#00838f', name: 'cyan-800' },
      { hex: '#006064', name: 'cyan-900' },
    ],
    // Teal
    [
      { hex: '#e0f2f1', name: 'teal-50' },
      { hex: '#b2dfdb', name: 'teal-100' },
      { hex: '#80cbc4', name: 'teal-200' },
      { hex: '#4db6ac', name: 'teal-300' },
      { hex: '#26a69a', name: 'teal-400' },
      { hex: '#009688', name: 'teal-500' },
      { hex: '#00897b', name: 'teal-600' },
      { hex: '#00796b', name: 'teal-700' },
      { hex: '#00695c', name: 'teal-800' },
      { hex: '#004d40', name: 'teal-900' },
    ],
    // Green
    [
      { hex: '#e8f5e9', name: 'green-50' },
      { hex: '#c8e6c9', name: 'green-100' },
      { hex: '#a5d6a7', name: 'green-200' },
      { hex: '#81c784', name: 'green-300' },
      { hex: '#66bb6a', name: 'green-400' },
      { hex: '#4caf50', name: 'green-500' },
      { hex: '#43a047', name: 'green-600' },
      { hex: '#388e3c', name: 'green-700' },
      { hex: '#2e7d32', name: 'green-800' },
      { hex: '#1b5e20', name: 'green-900' },
    ],
    // Light Green
    [
      { hex: '#f1f8e9', name: 'light-green-50' },
      { hex: '#dcedc8', name: 'light-green-100' },
      { hex: '#c5e1a5', name: 'light-green-200' },
      { hex: '#aed581', name: 'light-green-300' },
      { hex: '#9ccc65', name: 'light-green-400' },
      { hex: '#8bc34a', name: 'light-green-500' },
      { hex: '#7cb342', name: 'light-green-600' },
      { hex: '#689f38', name: 'light-green-700' },
      { hex: '#558b2f', name: 'light-green-800' },
      { hex: '#33691e', name: 'light-green-900' },
    ],
    // Lime
    [
      { hex: '#f9fbe7', name: 'lime-50' },
      { hex: '#f0f4c3', name: 'lime-100' },
      { hex: '#e6ee9c', name: 'lime-200' },
      { hex: '#dce775', name: 'lime-300' },
      { hex: '#d4e157', name: 'lime-400' },
      { hex: '#cddc39', name: 'lime-500' },
      { hex: '#c0ca33', name: 'lime-600' },
      { hex: '#afb42b', name: 'lime-700' },
      { hex: '#9e9d24', name: 'lime-800' },
      { hex: '#827717', name: 'lime-900' },
    ],
    // Yellow
    [
      { hex: '#fffde7', name: 'yellow-50' },
      { hex: '#fff9c4', name: 'yellow-100' },
      { hex: '#fff59d', name: 'yellow-200' },
      { hex: '#fff176', name: 'yellow-300' },
      { hex: '#ffee58', name: 'yellow-400' },
      { hex: '#ffeb3b', name: 'yellow-500' },
      { hex: '#fdd835', name: 'yellow-600' },
      { hex: '#fbc02d', name: 'yellow-700' },
      { hex: '#f9a825', name: 'yellow-800' },
      { hex: '#f57f17', name: 'yellow-900' },
    ],
    // Amber
    [
      { hex: '#fff8e1', name: 'amber-50' },
      { hex: '#ffecb3', name: 'amber-100' },
      { hex: '#ffe082', name: 'amber-200' },
      { hex: '#ffd54f', name: 'amber-300' },
      { hex: '#ffca28', name: 'amber-400' },
      { hex: '#ffc107', name: 'amber-500' },
      { hex: '#ffb300', name: 'amber-600' },
      { hex: '#ffa000', name: 'amber-700' },
      { hex: '#ff8f00', name: 'amber-800' },
      { hex: '#ff6f00', name: 'amber-900' },
    ],
    // Orange
    [
      { hex: '#fff3e0', name: 'orange-50' },
      { hex: '#ffe0b2', name: 'orange-100' },
      { hex: '#ffcc80', name: 'orange-200' },
      { hex: '#ffb74d', name: 'orange-300' },
      { hex: '#ffa726', name: 'orange-400' },
      { hex: '#ff9800', name: 'orange-500' },
      { hex: '#fb8c00', name: 'orange-600' },
      { hex: '#f57c00', name: 'orange-700' },
      { hex: '#ef6c00', name: 'orange-800' },
      { hex: '#e65100', name: 'orange-900' },
    ],
    // Deep Orange
    [
      { hex: '#fbe9e7', name: 'deep-orange-50' },
      { hex: '#ffccbc', name: 'deep-orange-100' },
      { hex: '#ffab91', name: 'deep-orange-200' },
      { hex: '#ff8a65', name: 'deep-orange-300' },
      { hex: '#ff7043', name: 'deep-orange-400' },
      { hex: '#ff5722', name: 'deep-orange-500' },
      { hex: '#f4511e', name: 'deep-orange-600' },
      { hex: '#e64a19', name: 'deep-orange-700' },
      { hex: '#d84315', name: 'deep-orange-800' },
      { hex: '#bf360c', name: 'deep-orange-900' },
    ],
    // Brown
    [
      { hex: '#efebe9', name: 'brown-50' },
      { hex: '#d7ccc8', name: 'brown-100' },
      { hex: '#bcaaa4', name: 'brown-200' },
      { hex: '#a1887f', name: 'brown-300' },
      { hex: '#8d6e63', name: 'brown-400' },
      { hex: '#795548', name: 'brown-500' },
      { hex: '#6d4c41', name: 'brown-600' },
      { hex: '#5d4037', name: 'brown-700' },
      { hex: '#4e342e', name: 'brown-800' },
      { hex: '#3e2723', name: 'brown-900' },
    ],
    // Gray
    [
      { hex: '#fafafa', name: 'gray-50' },
      { hex: '#f5f5f5', name: 'gray-100' },
      { hex: '#eeeeee', name: 'gray-200' },
      { hex: '#e0e0e0', name: 'gray-300' },
      { hex: '#bdbdbd', name: 'gray-400' },
      { hex: '#9e9e9e', name: 'gray-500' },
      { hex: '#757575', name: 'gray-600' },
      { hex: '#616161', name: 'gray-700' },
      { hex: '#424242', name: 'gray-800' },
      { hex: '#212121', name: 'gray-900' },
    ],
    // Blue Gray
    [
      { hex: '#eceff1', name: 'blue-gray-50' },
      { hex: '#cfd8dc', name: 'blue-gray-100' },
      { hex: '#b0bec5', name: 'blue-gray-200' },
      { hex: '#90a4ae', name: 'blue-gray-300' },
      { hex: '#78909c', name: 'blue-gray-400' },
      { hex: '#607d8b', name: 'blue-gray-500' },
      { hex: '#546e7a', name: 'blue-gray-600' },
      { hex: '#455a64', name: 'blue-gray-700' },
      { hex: '#37474f', name: 'blue-gray-800' },
      { hex: '#263238', name: 'blue-gray-900' },
    ],
  ],
};

/** 色库注册表。加色库只改这一行（规约 §1.3） */
export const COLOR_LIBRARIES: Record<string, ColorLibrary> = {
  'web-safe': { id: 'web-safe', name: 'colorLib.webSafe', colors: WEB_SAFE_COLORS },
  'css-named': CSS_NAMED,
  material: MATERIAL_DESIGN,
};

export function libraryById(id: string): ColorLibrary | undefined {
  return COLOR_LIBRARIES[id];
}
