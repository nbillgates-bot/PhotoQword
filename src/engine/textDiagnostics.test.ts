/**
 * PhotoQword
 *
 * Copyright (c) 2026 Richard Tong
 * Website: https://www.qword.com
 * Email: nbillgates@gmail.com
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  collectTextDiagnostics,
  formatTextDiagnostics,
  logFontResolution,
  logTextDiagnostics,
  resetFontResolutionLogForTests,
  textDiagnosticsTitle,
} from './textDiagnostics';
import { alignShift } from './textRender';
import { boundsFor } from './layerBounds';
import { createCanvas } from './canvasUtils';
import type { Layer, TextData } from '../types';

/**
 * 诊断日志本身不参与渲染，但它是排查「字体/位置变了」的唯一抓手，
 * 打错比不打更糟——会把人往错的方向带。所以这里测的是它说的话对不对：
 * 位移和框左边的关系、点/段落两种坐标约定、以及不能出 NaN。
 *
 * 字体是否可用这类结论依赖运行环境，断言一律写成「两条路都成立」（规约 §9）。
 */

const BASE: TextData = {
  content: '文字',
  fontFamily: 'sans-serif',
  fontSize: 32,
  fontWeight: 400,
  bold: false,
  italic: false,
  underline: false,
  align: 'left',
  color: '#000000',
  lineHeight: 1.2,
  letterSpacing: 0,
  x: 100,
  y: 50,
};

const text = (patch: Partial<TextData> = {}): TextData => ({ ...BASE, ...patch });

function layerOf(width = 400, height = 300, x = 0, y = 0): Layer {
  const canvas = createCanvas(width, height);
  return {
    id: 'L1',
    name: '文字图层',
    type: 'text',
    visible: true,
    locked: false,
    opacity: 100,
    blendMode: 'normal',
    canvas,
    bounds: boundsFor(canvas, x, y),
    textData: undefined,
    parentId: null,
  };
}

describe('collectTextDiagnostics 基本字段', () => {
  it('带上图层身份，日志里要认得出是哪一层', () => {
    const d = collectTextDiagnostics(layerOf(), text());

    expect(d.layerId).toBe('L1');
    expect(d.layerName).toBe('文字图层');
  });

  it('点文本和段落文本要分得清', () => {
    expect(collectTextDiagnostics(layerOf(), text()).kind).toBe('point');
    expect(
      collectTextDiagnostics(layerOf(), text({ width: 200, height: 80 })).kind,
    ).toBe('paragraph');
  });

  it('只有 width 没有 height 算点文本，和 isParagraphText 的约定一致', () => {
    expect(collectTextDiagnostics(layerOf(), text({ width: 200 })).kind).toBe('point');
  });

  it('样式字段原样带出来', () => {
    const d = collectTextDiagnostics(
      layerOf(),
      text({ fontSize: 48, bold: true, italic: true, underline: true, align: 'right',
        lineHeight: 1.5, letterSpacing: 3, color: '#ff0000' }),
    );

    expect(d.fontSize).toBe(48);
    expect(d.bold).toBe(true);
    expect(d.fontWeight).toBe(400);
    expect(d.italic).toBe(true);
    expect(d.underline).toBe(true);
    expect(d.align).toBe('right');
    expect(d.lineHeight).toBe(1.5);
    expect(d.letterSpacing).toBe(3);
    expect(d.color).toBe('#ff0000');
  });

  it('行数按换行符数，末尾空行也算', () => {
    expect(collectTextDiagnostics(layerOf(), text({ content: 'a\nb\nc' })).lineCount).toBe(3);
    expect(collectTextDiagnostics(layerOf(), text({ content: 'a\n' })).lineCount).toBe(2);
    expect(collectTextDiagnostics(layerOf(), text({ content: '' })).lineCount).toBe(1);
  });

  it('画布与 bounds 如实反映图层，PSD 那种局部画布要看得出来', () => {
    const d = collectTextDiagnostics(layerOf(120, 40, 300, 200), text());

    expect(d.canvasWidth).toBe(120);
    expect(d.canvasHeight).toBe(40);
    expect(d.boundsX).toBe(300);
    expect(d.boundsY).toBe(200);
    expect(d.boundsWidth).toBe(120);
    expect(d.boundsHeight).toBe(40);
  });
});

describe('collectTextDiagnostics 的字体判断', () => {
  it('没替代过就没有 PSD 原名', () => {
    expect(collectTextDiagnostics(layerOf(), text()).psdFamily).toBeNull();
  });

  it('替代过就记着原名，日志里才能对上 PSD', () => {
    const d = collectTextDiagnostics(
      layerOf(),
      text({ fontFamily: 'Noto Serif SC', originalFontFamily: 'SimSun' }),
    );

    expect(d.psdFamily).toBe('SimSun');
  });

  it('cssFont 就是真正写进 ctx.font 的那个字符串', () => {
    const d = collectTextDiagnostics(layerOf(), text({ fontFamily: 'Noto Sans SC', fontSize: 20 }));

    // 日志要是和实际用的字符串对不上，排查就白做了
    expect(d.cssFont).toContain('20px');
    expect(d.cssFont).toContain('Noto Sans SC');
  });

  it('WebFont 白名单只认可下载的那几个开源字体', () => {
    for (const family of ['Noto Sans SC', 'Noto Serif SC', 'Alibaba PuHuiTi']) {
      expect(collectTextDiagnostics(layerOf(), text({ fontFamily: family })).isWebFontCandidate)
        .toBe(true);
    }
    expect(collectTextDiagnostics(layerOf(), text({ fontFamily: 'Arial' })).isWebFontCandidate).toBe(false);
  });

  /*
   * 清单里一档字重就是一个键（'Alibaba PuHuiTi 300'），家族名只对得上常规体那一条。
   * 拿家族名直接去查清单的话，Light 的层会被报成「不是可下载字体」，
   * 排查的人就会以为下载压根没触发。
   */
  it('非常规字重的可下载字体照样算候选', () => {
    for (const fontWeight of [100, 300, 500, 700, 800]) {
      const d = collectTextDiagnostics(
        layerOf(),
        text({ fontFamily: 'Alibaba PuHuiTi', fontWeight }),
      );
      expect(d.isWebFontCandidate, `字重 ${fontWeight} 被判成非候选`).toBe(true);
    }
  });

  it('usingFallback 与 familyUsable 永远是互斥的两面', () => {
    // 环境不同结论可能不同，但这条恒等关系必须成立
    for (const family of ['Arial', 'SimSun', '压根不存在的字体名']) {
      const d = collectTextDiagnostics(layerOf(), text({ fontFamily: family }));
      expect(d.usingFallback).toBe(!d.familyUsable);
    }
  });

  it('注册过的 WebFont 一定算「能用到」', () => {
    const d = collectTextDiagnostics(layerOf(), text({ fontFamily: 'Noto Sans SC' }));

    if (d.webFontLoaded) expect(d.familyUsable).toBe(true);
  });
});

describe('collectTextDiagnostics 的位置换算', () => {
  it('点文本：框左边 = 落笔点 − 对齐位移', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const d = collectTextDiagnostics(layerOf(), text({ align, x: 100 }));

      expect(d.penX).toBe(100);
      expect(d.alignShift).toBeCloseTo(alignShift(align, d.boxWidth), 5);
      expect(d.boxX).toBeCloseTo(100 - d.alignShift, 5);
    }
  });

  it('点文本左对齐不退位移', () => {
    const d = collectTextDiagnostics(layerOf(), text({ align: 'left' }));

    expect(d.alignShift).toBe(0);
    expect(d.boxX).toBe(d.penX);
  });

  it('段落文本不退位移，落笔点本来就是框左上角', () => {
    for (const align of ['left', 'center', 'right'] as const) {
      const d = collectTextDiagnostics(layerOf(), text({ align, x: 100, width: 200, height: 80 }));

      expect(d.alignShift).toBe(0);
      expect(d.boxX).toBe(100);
      expect(d.boxWidth).toBe(200);
      expect(d.boxHeight).toBe(80);
    }
  });

  it('纵向不做位移，两种文本的 boxY 都等于 penY', () => {
    expect(collectTextDiagnostics(layerOf(), text({ y: 77 })).boxY).toBe(77);
    expect(
      collectTextDiagnostics(layerOf(), text({ y: 77, width: 200, height: 80 })).boxY,
    ).toBe(77);
  });

  it('点文本的编辑框比实测文字宽（留了光标的位置），高度则一致', () => {
    const d = collectTextDiagnostics(layerOf(), text());

    expect(d.boxWidth).toBeGreaterThan(d.measuredWidth);
    expect(d.boxHeight).toBeCloseTo(d.measuredHeight, 5);
  });

  it('所有数值字段都是有限数，不含 NaN', () => {
    const cases = [
      text(),
      text({ content: '' }),
      text({ content: 'a\nb\nc', align: 'center', letterSpacing: 2 }),
      text({ fontSize: 1, lineHeight: 0.5 }),
      text({ width: 1, height: 1 }),
      text({ x: -50, y: -20, align: 'right' }),
    ];

    for (const data of cases) {
      const d = collectTextDiagnostics(layerOf(), data);
      for (const [key, value] of Object.entries(d)) {
        if (typeof value === 'number') {
          expect(Number.isFinite(value), `${key} 不是有限数`).toBe(true);
        }
      }
    }
  });
});

describe('formatTextDiagnostics', () => {
  it('每一行都非空，没有拼串拼出来的空洞', () => {
    const lines = formatTextDiagnostics(collectTextDiagnostics(layerOf(), text()));

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line.trim().length).toBeGreaterThan(0);
  });

  it('把字体名和图层名摆出来', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontFamily: 'Noto Sans SC' })),
    ).join('\n');

    expect(joined).toContain('Noto Sans SC');
    expect(joined).toContain('文字图层');
  });

  it('发生过替代时标出 PSD 原名', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontFamily: 'Noto Serif SC', originalFontFamily: 'SimSun' })),
    ).join('\n');

    expect(joined).toContain('SimSun');
    expect(joined).toContain('已替代');
  });

  it('没替代时写「未替代」，不要留个空括号', () => {
    const joined = formatTextDiagnostics(collectTextDiagnostics(layerOf(), text())).join('\n');

    expect(joined).toContain('未替代');
  });

  /*
   * bold 只说明要不要再加粗，看不出基准粗细。
   * 「Light 的层被当成常规体」这类问题，日志里没有数值字重就查不出来。
   */
  it('数值字重和它的字面名都要打出来', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontWeight: 300 })),
    ).join('\n');

    expect(joined).toContain('300');
    expect(joined).toContain('Light');
  });

  it('常规字重也照样打，别让人以为这层没设字重', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontWeight: 400 })),
    ).join('\n');

    expect(joined).toContain('字重 400');
  });

  it('小数留两位，不出现浮点尾巴', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontSize: 32, lineHeight: 1.2 })),
    ).join('\n');

    // 57.60000000000001 这种一旦出现，日志就没法看了
    expect(joined).not.toMatch(/\d\.\d{3,}/);
  });

  it('整数不带小数点', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontSize: 32, x: 100, y: 50 })),
    ).join('\n');

    expect(joined).toContain('32px');
    expect(joined).not.toContain('32.00px');
  });

  it('用后备字体时给出警告字样，这是排查时第一眼要看到的', () => {
    const d = collectTextDiagnostics(layerOf(), text({ fontFamily: '压根不存在的字体名' }));
    const joined = formatTextDiagnostics(d).join('\n');

    // 两条路都要说得通：判成能用就说用的是原字体，判成不能用就要有警告
    expect(joined).toContain(d.usingFallback ? '后备字体' : '实际用的就是');
  });
});

/*
 * 报的现象：PSD 图层的 fontFamily 解析成了 sans-serif，日志却打「后备字体」警告，
 * 把「本机缺字体」和「存的本来就是通用族」混成了一句话。这两者的修法完全不同。
 */
describe('通用族要和「缺字体降级」分开', () => {
  it('存的就是通用族时标记 familyIsGeneric', () => {
    for (const family of ['sans-serif', 'serif', 'monospace']) {
      expect(collectTextDiagnostics(layerOf(), text({ fontFamily: family })).familyIsGeneric)
        .toBe(true);
    }
  });

  it('具体字体名不算通用族', () => {
    for (const family of ['Arial', 'Noto Sans SC', '微软雅黑']) {
      expect(collectTextDiagnostics(layerOf(), text({ fontFamily: family })).familyIsGeneric)
        .toBe(false);
    }
  });

  it('通用族永远算「浏览器能用到」，不该被报成缺字体', () => {
    const d = collectTextDiagnostics(layerOf(), text({ fontFamily: 'sans-serif' }));

    expect(d.familyUsable).toBe(true);
    expect(d.usingFallback).toBe(false);
  });

  it('通用族的结论要点明「导入时已经放弃原字体」，不是「浏览器临时降级」', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(layerOf(), text({ fontFamily: 'sans-serif' })),
    ).join('\n');

    expect(joined).toContain('退到通用族');
    expect(joined).toContain('没触发下载');
  });

  it('通用族且知道 PSD 原名时，结论里要带上原名', () => {
    const joined = formatTextDiagnostics(
      collectTextDiagnostics(
        layerOf(),
        text({ fontFamily: 'sans-serif', originalFontFamily: 'FZLTHJW--GB1-0' }),
      ),
    ).join('\n');

    expect(joined).toContain('FZLTHJW--GB1-0');
  });
});

describe('textDiagnosticsTitle', () => {
  it('没替代时只写实际字体', () => {
    const title = textDiagnosticsTitle(collectTextDiagnostics(layerOf(), text()));

    expect(title).toContain('文字图层');
    expect(title).not.toContain('→');
  });

  it('替代过就写「原名 → 结果」，不展开也知道谁变成了谁', () => {
    const title = textDiagnosticsTitle(
      collectTextDiagnostics(
        layerOf(),
        text({ fontFamily: 'Noto Sans SC', originalFontFamily: 'MicrosoftYaHei' }),
      ),
    );

    expect(title).toContain('MicrosoftYaHei → Noto Sans SC');
  });

  it('退到通用族时标题就带警告', () => {
    const title = textDiagnosticsTitle(
      collectTextDiagnostics(layerOf(), text({ fontFamily: 'sans-serif' })),
    );

    expect(title).toContain('⚠');
    expect(title).toContain('通用族');
  });
});

describe('logFontResolution', () => {
  beforeEach(() => {
    resetFontResolutionLogForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('退到通用族用 warn：这是要人动手补映射表的问题', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logFontResolution('FZLTHJW--GB1-0', 'sans-serif', true);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain('FZLTHJW--GB1-0');
    expect(message).toContain('sans-serif');
    expect(message).toContain('FONT_FALLBACK_MAP');
  });

  it('替代成具体字体只是普通信息，不该 warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    logFontResolution('MicrosoftYaHei', 'Noto Sans SC', true);

    expect(warn).not.toHaveBeenCalled();
    expect(String(log.mock.calls[0][0])).toContain('MicrosoftYaHei → Noto Sans SC');
  });

  it('没替代时说明原样使用', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    logFontResolution('Arial', 'Arial', false);

    expect(String(log.mock.calls[0][0])).toContain('原样使用');
  });

  it('同一组解析只报一次——一个 PSD 里几十层共用一个字体是常态', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    for (let i = 0; i < 30; i += 1) logFontResolution('SomeFont', 'sans-serif', true);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('不同字体各报各的，去重不能把别的字体一起吞掉', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logFontResolution('FontA', 'sans-serif', true);
    logFontResolution('FontB', 'sans-serif', true);

    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('重置之后可以重新报，换个 PSD 不会一片空白', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logFontResolution('FontA', 'sans-serif', true);
    resetFontResolutionLogForTests();
    logFontResolution('FontA', 'sans-serif', true);

    expect(warn).toHaveBeenCalledTimes(2);
  });
});

describe('logTextDiagnostics', () => {
  /** 把 console 三件套换成哑实现，返回 log 的调用记录 */
  function spyConsole() {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'groupCollapsed').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    return log;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('确实往控制台打了东西', () => {
    const log = spyConsole();

    logTextDiagnostics(collectTextDiagnostics(layerOf(), text()));

    expect(log).toHaveBeenCalled();
  });

  it('原始对象也一并打出来，方便直接复制', () => {
    const log = spyConsole();
    const d = collectTextDiagnostics(layerOf(), text());

    logTextDiagnostics(d);

    expect(log.mock.calls.some((call) => call[0] === d)).toBe(true);
  });

  it('环境没有 console.group 时退回逐行打印，不抛错', () => {
    const log = spyConsole();
    const original = console.groupCollapsed;
    // 模拟没有 group 系列的宿主（旧 Safari、部分测试环境）
    (console as unknown as { groupCollapsed?: unknown }).groupCollapsed = undefined;

    try {
      expect(() => logTextDiagnostics(collectTextDiagnostics(layerOf(), text()))).not.toThrow();
      expect(log).toHaveBeenCalled();
    } finally {
      console.groupCollapsed = original;
    }
  });
});
